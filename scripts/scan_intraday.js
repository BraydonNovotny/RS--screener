// Fetches the latest intraday price for the RS universe + QQQ, computes % change vs
// prior close and RS vs QQQ. Merges into data.json under tickers[SYM].INTRADAY / RS_INTRADAY.
const { loadUniverse, loadData, saveData, fetchChart, pool } = require('./lib');

async function fetchLatest(symbol) {
  const result = await fetchChart(symbol, 'interval=1m&range=1d');
  const meta = result.meta;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  if (!prevClose) throw new Error(`${symbol}: missing prevClose`);

  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  let lastIdx = -1;
  for (let i = timestamps.length - 1; i >= 0; i--) {
    if (closes[i] != null) { lastIdx = i; break; }
  }
  if (lastIdx === -1) throw new Error(`${symbol}: no usable intraday bar yet`);

  const price = closes[lastIdx];
  const pct = ((price - prevClose) / prevClose) * 100;
  return { pct: Math.round(pct * 100) / 100 };
}

async function run() {
  const universe = loadUniverse();
  const data = loadData();

  const symbols = ['QQQ', ...universe];
  const results = await pool(symbols, fetchLatest);

  const failed = [];
  let qqqPct = null;
  const tickerPct = {};

  symbols.forEach((sym, i) => {
    const r = results[i];
    if (!r.ok) { failed.push({ sym, error: r.error }); return; }
    if (sym === 'QQQ') qqqPct = r.value.pct;
    else tickerPct[sym] = r.value.pct;
  });

  if (qqqPct === null) {
    console.error('FATAL: QQQ fetch failed, aborting merge.', failed);
    process.exit(1);
  }

  data.qqq.INTRADAY = qqqPct;
  // ADR-adjusted: reuse the prior-day ADR14 already on file from the last EOD scan
  // (today's ADR14 isn't known yet mid-session) to normalize the intraday move so far.
  const qqqAdr = data.qqq.ADR14;
  if (qqqAdr) data.qqq.ADR_MULT_INTRADAY = Math.round((qqqPct / qqqAdr) * 100) / 100;

  for (const [sym, pct] of Object.entries(tickerPct)) {
    if (!data.tickers[sym]) data.tickers[sym] = {};
    const t = data.tickers[sym];
    t.INTRADAY = pct;
    t.RS_INTRADAY = Math.round((pct - qqqPct) * 100) / 100;
    if (t.ADR14 && qqqAdr) {
      t.ADR_MULT_INTRADAY = Math.round((pct / t.ADR14) * 100) / 100;
      t.RS_ADR_INTRADAY = Math.round((t.ADR_MULT_INTRADAY - data.qqq.ADR_MULT_INTRADAY) * 100) / 100;
    }
  }
  data.updated = data.updated || {};
  data.updated.intraday = new Date().toISOString();

  saveData(data);
  console.log(`QQQ INTRADAY: ${qqqPct}%  |  updated ${Object.keys(tickerPct).length}/${universe.length} tickers`);
  if (failed.length) console.log('Failed:', JSON.stringify(failed));
}

module.exports = { run };
if (require.main === module) run();
