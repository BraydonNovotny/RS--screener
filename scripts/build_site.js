// Regenerates index.html from data.json.
const fs = require('fs');
const path = require('path');
const { loadData } = require('./lib');

const OUT = path.join(__dirname, '..', 'index.html');

function build() {
const data = loadData();

const panels = [
  { key: 'RS_ADR_INTRADAY', label: 'Top RS — Intraday (ADR-adj)', sub: 'move ÷ prior-day ADR14 vs QQQ same, since prior close (refreshes every 30 min, market hours)', moveKey: 'INTRADAY', admKey: 'ADR_MULT_INTRADAY' },
  { key: 'RS_ADR_3D', label: 'Top RS — 3 Day (ADR-adj)', sub: 'move ÷ prior-day ADR14 vs QQQ same, 3 trading days', moveKey: '3D', admKey: 'ADR_MULT_3D' },
  { key: 'RS_ADR_5D', label: 'Top RS — 5 Day (1W, ADR-adj)', sub: 'move ÷ prior-day ADR14 vs QQQ same, 5 trading days', moveKey: '5D', admKey: 'ADR_MULT_5D' },
  { key: 'RS_ADR_2W', label: 'Top RS — 2 Week (ADR-adj)', sub: 'move ÷ prior-day ADR14 vs QQQ same, 10 trading days', moveKey: '2W', admKey: 'ADR_MULT_2W' },
  { key: 'RS_ADR_1M', label: 'Top RS — 1 Month (ADR-adj)', sub: 'move ÷ prior-day ADR14 vs QQQ same, 21 trading days', moveKey: '1M', admKey: 'ADR_MULT_1M' },
];

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RS Screener — Top Relative Strength vs QQQ</title>
<style>
:root{
  --bg:#0b0e14; --panel:#131722; --border:#232838; --text:#e6e9ef; --sub:#8b93a7;
  --pos:#2ecc71; --neg:#ff5c5c; --accent:#5b8def;
}
@media (prefers-color-scheme: light){
  :root{ --bg:#f5f6f8; --panel:#ffffff; --border:#e2e5eb; --text:#1a1d24; --sub:#666e7d; }
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  padding:24px 16px 48px;
}
.wrap{max-width:100%;margin:0 auto}
header{margin-bottom:24px}
h1{font-size:1.4rem;margin:0 0 4px}
.meta{color:var(--sub);font-size:0.85rem}
.grid{
  display:grid;
  grid-template-columns:repeat(3,minmax(280px,1fr));
  gap:16px;
}
@media (max-width:1300px){ .grid{grid-template-columns:repeat(2,minmax(240px,1fr))} }
@media (max-width:640px){ .grid{grid-template-columns:1fr} }
.panel{
  background:var(--panel); border:1px solid var(--border); border-radius:10px;
  overflow:hidden;
}
.panel.featured{border-color:var(--accent)}
.panel-head{ padding:14px 16px; border-bottom:1px solid var(--border); }
.panel-head h2{margin:0;font-size:1rem}
.panel-head .sub{color:var(--sub);font-size:0.78rem;margin-top:2px}
.table-scroll{max-height:70vh;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:0.85rem}
thead th{position:sticky;top:0;background:var(--panel);z-index:1}
th{
  text-align:left; padding:8px 12px; color:var(--sub); font-weight:600;
  font-size:0.72rem; text-transform:uppercase; letter-spacing:0.03em;
  border-bottom:1px solid var(--border);
}
td{padding:8px 12px; border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
.rank{color:var(--sub); width:28px}
.ticker{font-weight:700; font-variant-numeric:tabular-nums}
.rs{text-align:right; font-variant-numeric:tabular-nums; font-weight:600}
.pos{color:var(--pos)}
.neg{color:var(--neg)}
.bar-wrap{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.bar{height:6px;border-radius:3px;min-width:2px}
tbody tr:hover{background:rgba(91,141,239,0.06)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>RS Screener — Top Relative Strength vs QQQ</h1>
    <div class="meta" id="meta">Loading…</div>
  </header>
  <div class="grid" id="grid"></div>
</div>

<script>
const DATA = ${JSON.stringify(data)};
const eodUpdated = DATA.updated.eod || 'not yet run';
const intradayUpdated = DATA.updated.intraday
  ? new Date(DATA.updated.intraday).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' }) + ' PT'
  : 'not yet run today';

document.getElementById('meta').textContent =
  \`Universe: \${Object.keys(DATA.tickers).length} Liquid Leaders tickers · QQQ benchmark (ADR14 \${DATA.qqq.ADR14 != null ? DATA.qqq.ADR14.toFixed(2)+'%' : '—'}) · EOD as of \${eodUpdated} · Intraday as of \${intradayUpdated}\`;

const panels = ${JSON.stringify(panels)};
const grid = document.getElementById('grid');

function fmt(v){
  if (v == null) return '—';
  return (v>=0?'+':'') + v.toFixed(2) + '%';
}
function fmtX(v){
  if (v == null) return '—';
  return (v>=0?'+':'') + v.toFixed(2) + 'x';
}

panels.forEach((p, idx)=>{
  const hasAdr = !!p.moveKey;
  const rows = Object.entries(DATA.tickers)
    .map(([t,v])=>({ticker:t, rs:v[p.key], move:v[p.moveKey], adm:v[p.admKey]}))
    .filter(r => r.rs != null)
    .sort((a,b)=>b.rs-a.rs);

  const maxAbs = Math.max(...rows.map(r=>Math.abs(r.rs)), 1);

  const extraHead = hasAdr ? '<th style="text-align:right">Move</th><th style="text-align:right">ADR×</th>' : '';

  const panel = document.createElement('div');
  panel.className = 'panel' + (idx===0 ? ' featured' : '');
  panel.innerHTML = \`
    <div class="panel-head">
      <h2>\${p.label}</h2>
      <div class="sub">\${p.sub}\${hasAdr ? ' · QQQ: '+fmt(DATA.qqq[p.moveKey])+' ('+fmtX(DATA.qqq[p.admKey])+' ADR)' : ''}</div>
    </div>
    <div class="table-scroll">
    <table>
      <thead><tr><th></th><th>Ticker</th>\${extraHead}<th style="text-align:right">RS</th></tr></thead>
      <tbody>
        \${rows.map((r,i)=>{
          const cls = r.rs>=0?'pos':'neg';
          const w = Math.max(4, Math.abs(r.rs)/maxAbs*60);
          const color = r.rs>=0 ? 'var(--pos)' : 'var(--neg)';
          const extraCells = hasAdr
            ? \`<td class="rs \${r.move>=0?'pos':'neg'}">\${fmt(r.move)}</td><td class="rs">\${fmtX(r.adm)}</td>\`
            : '';
          return \`<tr>
            <td class="rank">\${i+1}</td>
            <td class="ticker">\${r.ticker}</td>
            \${extraCells}
            <td class="rs \${cls}">
              <div class="bar-wrap">
                <div class="bar" style="width:\${w}px;background:\${color}"></div>
                <span>\${hasAdr ? fmtX(r.rs) : fmt(r.rs)}</span>
              </div>
            </td>
          </tr>\`;
        }).join('')}
      </tbody>
    </table>
    </div>
  \`;
  grid.appendChild(panel);
});
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${html.length} bytes)`);
}

module.exports = { build };
if (require.main === module) build();
