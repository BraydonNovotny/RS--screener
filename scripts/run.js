// Entry point invoked by the GitHub Actions workflow every 15 min, all day, every day.
// Self-gates on actual America/Los_Angeles local time (DST-safe via Intl) so the cron
// schedule itself doesn't need to change twice a year.
const { ptNowDecimalHour, ptDateString, loadData } = require('./lib');
const scanIntraday = require('./scan_intraday');
const scanEod = require('./scan_eod');
const { build } = require('./build_site.js');

async function main() {
  const { decimalHour, weekday } = ptNowDecimalHour();
  const isWeekday = !['Sat', 'Sun'].includes(weekday);

  if (!isWeekday) {
    console.log(`Skip: ${weekday} is a weekend.`);
    return;
  }

  const inIntradayWindow = decimalHour >= 6.45 && decimalHour <= 12.60;
  const inEodWindow = decimalHour >= 13.05 && decimalHour <= 14.10;

  let ran = false;

  if (inIntradayWindow) {
    console.log(`PT hour ${decimalHour.toFixed(2)} in intraday window - running scan_intraday.`);
    await scanIntraday.run();
    ran = true;
  }

  if (inEodWindow) {
    const data = loadData();
    const today = ptDateString();
    if (data.updated?.eod === today) {
      console.log(`EOD scan already ran today (${today}) - skipping.`);
    } else {
      console.log(`PT hour ${decimalHour.toFixed(2)} in EOD window - running scan_eod.`);
      await scanEod.run();
      ran = true;
    }
  }

  if (!ran) {
    console.log(`PT hour ${decimalHour.toFixed(2)} outside all scan windows - no-op.`);
    return;
  }

  build();
}

main().catch(e => { console.error(e); process.exit(1); });
