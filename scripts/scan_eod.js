// Fetches daily bars for the RS universe + QQQ, computes 1D/3D/5D % change and RS vs QQQ.
// Merges into data.json under tickers[SYM].{1D,3D,5D,RS_1D,RS_3D,RS_5D}.
const { loadUniverse, loadData, saveData, fetchChart, pool, ptDateString } = require('./lib');

async function fetchDaily(symbol) {
  const result = await fetchChart(symbol, 'interval=1d&range=1mo');
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(c => c != null);
  if (closes.length < 6) throw new Error(`${symbol}: only ${closes.length} daily closes available`);
  const last6 = closes.slice(-6); // oldest -> newest, index 5 = most recent close
  const d1 = (last6[5] - last6[4]) / last6[4] * 100;
  const d3 = (last6[5] - last6[2]) / last6[2] * 100;
  const d5 = (last6[5] - last6[0]) / last6[0] * 100;
  return {
    '1D': Math.round(d1 * 100) / 100,
    '3D': Math.round(d3 * 100) / 100,
    '5D': Math.round(d5 * 100) / 100,
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

  data.qqq['1D'] = qqq['1D']; data.qqq['3D'] = qqq['3D']; data.qqq['5D'] = qqq['5D'];
  for (const [sym, v] of Object.entries(tickerPcts)) {
    if (!data.tickers[sym]) data.tickers[sym] = {};
    data.tickers[sym]['1D'] = v['1D']; data.tickers[sym]['3D'] = v['3D']; data.tickers[sym]['5D'] = v['5D'];
    data.tickers[sym].RS_1D = Math.round((v['1D'] - qqq['1D']) * 100) / 100;
    data.tickers[sym].RS_3D = Math.round((v['3D'] - qqq['3D']) * 100) / 100;
    data.tickers[sym].RS_5D = Math.round((v['5D'] - qqq['5D']) * 100) / 100;
  }
  data.updated = data.updated || {};
  data.updated.eod = ptDateString();

  saveData(data);
  console.log(`QQQ 1D/3D/5D: ${qqq['1D']}% / ${qqq['3D']}% / ${qqq['5D']}%  |  updated ${Object.keys(tickerPcts).length}/${universe.length} tickers`);
  if (failed.length) console.log('Failed:', JSON.stringify(failed));
}

module.exports = { run };
if (require.main === module) run();
