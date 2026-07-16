// Fetches daily bars for the RS universe + QQQ, computes 3D/5D/2W/1M % change,
// ADR14-normalized 2W/1M moves, and RS vs QQQ (both plain and ADR-adjusted).
// ADR14 is computed as of the PRIOR trading day (excludes today's own bar) so
// today's move doesn't inflate the denominator it's being measured against —
// same look-ahead-avoidance convention as the setup-bar ADR% in the Qullamgie scorer.
// Merges into data.json under tickers[SYM].{3D,5D,RS_3D,RS_5D,2W,1M,ADR14,ADR_MULT_2W,
// ADR_MULT_1M,RS_2W,RS_1M,RS_ADR_2W,RS_ADR_1M}.
// (1D was dropped 2026-07-13: it's always identical to the Intraday panel's value at market close, so redundant.)
const { loadUniverse, loadData, saveData, fetchChart, pool, ptDateString } = require('./lib');

async function fetchDaily(symbol) {
  // range=3mo gives enough trading days of buffer for the 1M (21td) lookback + 14td ADR window.
  const result = await fetchChart(symbol, 'interval=1d&range=3mo');
  const quote = result.indicators?.quote?.[0] || {};
  const rawClose = quote.close || [];
  const rawHigh = quote.high || [];
  const rawLow = quote.low || [];

  const closes = [], highs = [], lows = [];
  for (let i = 0; i < rawClose.length; i++) {
    if (rawClose[i] != null && rawHigh[i] != null && rawLow[i] != null) {
      closes.push(rawClose[i]); highs.push(rawHigh[i]); lows.push(rawLow[i]);
    }
  }
  if (closes.length < 22) throw new Error(`${symbol}: only ${closes.length} daily bars available`);

  const last6 = closes.slice(-6); // oldest -> newest, index 5 = most recent close
  const d3 = (last6[5] - last6[2]) / last6[2] * 100;
  const d5 = (last6[5] - last6[0]) / last6[0] * 100;

  const n = closes.length;
  const close0 = closes[n - 1];
  const d2w = (close0 - closes[n - 11]) / closes[n - 11] * 100;  // 10 trading days back
  const d1m = (close0 - closes[n - 22]) / closes[n - 22] * 100; // 21 trading days back

  // 14 bars ending the day BEFORE today, normalized by yesterday's close (not today's).
  const prevClose = closes[n - 2];
  const prev14High = highs.slice(n - 15, n - 1), prev14Low = lows.slice(n - 15, n - 1);
  const adr14 = prev14High.reduce((s, h, i) => s + (h - prev14Low[i]), 0) / prev14High.length / prevClose * 100;

  return {
    '3D': Math.round(d3 * 100) / 100,
    '5D': Math.round(d5 * 100) / 100,
    '2W': Math.round(d2w * 100) / 100,
    '1M': Math.round(d1m * 100) / 100,
    ADR14: Math.round(adr14 * 100) / 100,
    ADR_MULT_3D: Math.round((d3 / adr14) * 100) / 100,
    ADR_MULT_5D: Math.round((d5 / adr14) * 100) / 100,
    ADR_MULT_2W: Math.round((d2w / adr14) * 100) / 100,
    ADR_MULT_1M: Math.round((d1m / adr14) * 100) / 100,
  };
}

async function run() {
  const universe = loadUniverse();
  const data = loadData();

  const symbols = ['QQQ', ...universe];
  const results = await pool(symbols, fetchDaily);

  const failed = [];
  let qqq = null;
  const tickerPcts = {};

  symbols.forEach((sym, i) => {
    const r = results[i];
    if (!r.ok) { failed.push({ sym, error: r.error }); return; }
    if (sym === 'QQQ') qqq = r.value;
    else tickerPcts[sym] = r.value;
  });

  if (!qqq) {
    console.error('FATAL: QQQ fetch failed, aborting merge.', failed);
    process.exit(1);
  }

  data.qqq['3D'] = qqq['3D']; data.qqq['5D'] = qqq['5D'];
  data.qqq['2W'] = qqq['2W']; data.qqq['1M'] = qqq['1M'];
  data.qqq.ADR14 = qqq.ADR14;
  data.qqq.ADR_MULT_3D = qqq.ADR_MULT_3D; data.qqq.ADR_MULT_5D = qqq.ADR_MULT_5D;
  data.qqq.ADR_MULT_2W = qqq.ADR_MULT_2W; data.qqq.ADR_MULT_1M = qqq.ADR_MULT_1M;

  for (const [sym, v] of Object.entries(tickerPcts)) {
    if (!data.tickers[sym]) data.tickers[sym] = {};
    const t = data.tickers[sym];
    t['3D'] = v['3D']; t['5D'] = v['5D']; t['2W'] = v['2W']; t['1M'] = v['1M'];
    t.ADR14 = v.ADR14;
    t.ADR_MULT_3D = v.ADR_MULT_3D; t.ADR_MULT_5D = v.ADR_MULT_5D;
    t.ADR_MULT_2W = v.ADR_MULT_2W; t.ADR_MULT_1M = v.ADR_MULT_1M;
    t.RS_3D = Math.round((v['3D'] - qqq['3D']) * 100) / 100;
    t.RS_5D = Math.round((v['5D'] - qqq['5D']) * 100) / 100;
    t.RS_2W = Math.round((v['2W'] - qqq['2W']) * 100) / 100;
    t.RS_1M = Math.round((v['1M'] - qqq['1M']) * 100) / 100;
    // ADR-adjusted RS: how many more/fewer ADRs of move this name made vs QQQ's own ADR-normalized move.
    t.RS_ADR_3D = Math.round((v.ADR_MULT_3D - qqq.ADR_MULT_3D) * 100) / 100;
    t.RS_ADR_5D = Math.round((v.ADR_MULT_5D - qqq.ADR_MULT_5D) * 100) / 100;
    t.RS_ADR_2W = Math.round((v.ADR_MULT_2W - qqq.ADR_MULT_2W) * 100) / 100;
    t.RS_ADR_1M = Math.round((v.ADR_MULT_1M - qqq.ADR_MULT_1M) * 100) / 100;
  }
  data.updated = data.updated || {};
  data.updated.eod = ptDateString();

  saveData(data);
  console.log(`QQQ 3D/5D/2W/1M: ${qqq['3D']}% / ${qqq['5D']}% / ${qqq['2W']}% / ${qqq['1M']}%  |  QQQ ADR14: ${qqq.ADR14}%  |  updated ${Object.keys(tickerPcts).length}/${universe.length} tickers`);
  if (failed.length) console.log('Failed:', JSON.stringify(failed));
}

module.exports = { run };
if (require.main === module) run();
