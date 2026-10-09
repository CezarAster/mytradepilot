import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contractFor } from '../src/core/contracts.ts';
import { toNumber } from '../src/core/csv.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { zonedTimeToUtc } from '../src/core/time.ts';

const NY = 'America/New_York';
const broker = (name: string, timeZone = NY) =>
  parseFile(readFileSync(new URL(`fixtures/brokers/${name}`, import.meta.url), 'utf8'), { timeZone, fileName: name });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('numbers: currency, parentheses for losses, signs and @ prices', () => {
  assert.equal(toNumber('$(20.00)'), -20);
  assert.equal(toNumber('($1,104.30)'), -1104.3);
  assert.equal(toNumber('-$25.50'), -25.5);
  assert.equal(toNumber('+100'), 100);
  assert.equal(toNumber('@182.50'), 182.5);
  assert.ok(Number.isNaN(toNumber('')));
});

test('time: US dates, AM/PM, IBKR formats, zone names and UTC offsets', () => {
  const at = (s: string, tz = NY) => zonedTimeToUtc(s, tz)?.toISOString();
  assert.equal(at('3/2/2026 1:05:00 PM'), '2026-03-02T18:05:00.000Z');
  assert.equal(at('3/2/2026 12:15:00 AM'), '2026-03-02T05:15:00.000Z');
  assert.equal(at('3/2/26 09:35:01'), '2026-03-02T14:35:01.000Z');
  assert.equal(at('2026-03-02, 09:40:00'), '2026-03-02T14:40:00.000Z');
  assert.equal(at('20260302;094000'), '2026-03-02T14:40:00.000Z');
  assert.equal(at('03/02/2026 09:35:01 EST', 'America/Los_Angeles'), '2026-03-02T14:35:01.000Z');
  assert.equal(at('03/02/2026 09:31:05 -05:00', 'America/Los_Angeles'), '2026-03-02T14:31:05.000Z');
  assert.equal(at('2026-03-02T14:31:05Z'), '2026-03-02T14:31:05.000Z');
  assert.equal(at('2026-03-02'), undefined);
});

test('contracts: futures roots in every platform spelling, options x100, stocks x1', () => {
  for (const s of ['MNQH6', 'MNQZ25', '/MNQH26', 'MNQ 03-26', 'CON.F.US.MNQ.H26']) {
    assert.deepEqual(contractFor(s), { symbol: 'MNQ', multiplier: 2, isFutures: true }, s);
  }
  assert.equal(contractFor('6EH6').multiplier, 125000);
  assert.equal(contractFor('M2KH6').symbol, 'M2K');
  assert.equal(contractFor('AAPL260320C00200000').multiplier, 100);
  assert.equal(contractFor('SPY 20 MAR 26 600 CALL').multiplier, 100);
  assert.equal(contractFor('ES').multiplier, 1); // Eversource, the stock
  assert.equal(contractFor('ES', true).multiplier, 50); // on a futures-only platform
  assert.equal(contractFor('AAPL').multiplier, 1);
});

test('tradovate: lots are rebuilt into trades with scale-ins, shorts, and inferred contract size', () => {
  const res = broker('tradovate-performance.csv');
  assert.equal(res.format, 'Tradovate performance');
  assert.deepEqual(res.warnings, ["Tradovate's Performance report has no commissions or fees, so P&L here is before costs."]);
  const [a, b, c] = res.trades;
  assert.equal(a.symbol, 'MNQ');
  assert.equal(a.direction, 'long');
  assert.equal(a.qty, 2);
  assert.equal(a.entryPrice, 21001);
  assert.equal(a.pnl, 36);
  assert.equal(a.fills, 3);
  assert.equal(b.direction, 'short');
  assert.equal(b.exitPrice, 21022.5);
  assert.equal(b.pnl, -10);
  assert.equal(c.symbol, 'KEZ6');
  assert.equal(c.pnl, 100);
  near(c.returnPct, (100 / (600 * 50)) * 100);
});

test('ninjatrader: partial rows merge, commission comes out, stop exits and MAE/MFE are read', () => {
  const res = broker('ninjatrader-trades.csv');
  assert.equal(res.format, 'NinjaTrader trades');
  assert.equal(res.trades.length, 2);
  const [win, loss] = res.trades;
  assert.equal(win.symbol, 'ES');
  near(win.pnl, 195.7);
  assert.equal(win.stoppedOut, false);
  near(win.mfePct!, (212.5 / (6000 * 50)) * 100);
  assert.equal(loss.direction, 'short');
  assert.equal(loss.qty, 2);
  assert.equal(loss.fills, 2);
  near(loss.pnl, -208.6);
  assert.equal(loss.stoppedOut, true);
  near(loss.maePct!, -(250 / (6010 * 2 * 50)) * 100);
  assert.equal(loss.entryTime.toISOString(), '2026-03-02T18:05:00.000Z');
});

test('topstepx: offsets in the timestamps win over the chosen zone, fees come out of P&L', () => {
  const res = broker('topstepx-trades.csv', 'America/Los_Angeles');
  assert.equal(res.format, 'TopstepX trades');
  const [a, b] = res.trades;
  assert.equal(a.entryTime.toISOString(), '2026-03-02T14:31:05.000Z');
  near(a.pnl, 19.26);
  assert.equal(b.direction, 'short');
  near(b.pnl, -41.48);
  near(b.returnPct, (-41.48 / (21050 * 2 * 2)) * 100);
});

test('webull: unfilled orders are skipped, options count x100', () => {
  const res = broker('webull-orders.csv', 'America/Los_Angeles');
  assert.equal(res.format, 'Webull orders');
  assert.equal(res.trades.length, 2);
  const [stock, option] = res.trades;
  assert.equal(stock.pnl, 150);
  assert.equal(stock.entryTime.toISOString(), '2026-03-02T14:35:01.000Z');
  near(option.pnl, 120);
  near(option.returnPct, 40);
  assert.match(res.warnings.join(), /1 order with nothing filled/);
});

test('thinkorswim: finds the trade history section, spread legs, futures, fees and stop exits', () => {
  const res = broker('thinkorswim-statement.csv');
  assert.equal(res.format, 'thinkorswim statement');
  const by = (s: string) => res.trades.find((t) => t.symbol === s)!;
  near(by('AAPL').pnl, -130 - 1.35);
  assert.equal(by('AAPL').stoppedOut, true);
  assert.equal(by('MES').direction, 'short');
  near(by('MES').pnl, 23.75);
  near(by('SPY 20 MAR 26 600 CALL').pnl, 80);
  near(by('SPY 20 MAR 26 605 CALL').pnl, -40);
  assert.equal(by('SPY 20 MAR 26 605 CALL').entryTime.toISOString(), '2026-03-03T14:45:00.000Z');
  // An option on the ES future moves $50 a point, not $100.
  near(by('/ESH26 20 MAR 26 6000 CALL').pnl, 5 * 50);
  // Closing 50 MSFT bought before the statement starts isn't a trade.
  assert.equal(res.trades.some((t) => t.symbol === 'MSFT'), false);
  assert.equal(res.trades.length, 5);
  assert.deepEqual(res.warnings, [
    'Futures fees are listed in a separate section that isn’t read yet; futures P&L is before fees.',
    '1 closing fill for positions opened before this file starts left out.',
  ]);
});

test('ibkr: reads every asset section of an activity statement, skipping subtotals and earlier positions', () => {
  const res = broker('ibkr-activity.csv');
  assert.equal(res.format, 'Interactive Brokers statement');
  assert.deepEqual(res.warnings, ['1 closing fill for positions opened before this file starts left out.']);
  const tsla = res.trades.find((t) => t.symbol === 'TSLA')!;
  const mnq = res.trades.find((t) => t.symbol === 'MNQ')!;
  const call = res.trades.find((t) => t.symbol === 'AAPL 20MAR26 200 C')!;
  near(tsla.pnl, 248);
  near(mnq.pnl, 48.76);
  near(call.pnl, 50 - 1.4);
  assert.equal(res.trades.length, 3);
});

test('ibkr: contract size comes from Proceeds, and an unknown future with none is flagged', () => {
  const head = 'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Code';
  const csv = [
    head,
    'Trades,Data,Order,Options On Futures,USD,ES 20MAR26 6000 C,"2026-03-02, 10:00:00",1,20,-1000,-2,O',
    'Trades,Data,Order,Options On Futures,USD,ES 20MAR26 6000 C,"2026-03-02, 10:30:00",-1,25,1250,-2,C',
    'Trades,Data,Order,Futures,USD,XYZH6,"2026-03-02, 11:00:00",1,100,0,-1,O',
    'Trades,Data,Order,Futures,USD,XYZH6,"2026-03-02, 11:30:00",-1,101,0,-1,C',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'ib.csv' });
  near(res.trades.find((t) => t.symbol.startsWith('ES '))!.pnl, 5 * 50 - 4);
  assert.match(res.warnings.join(), /contract size of XYZH6/);
});

test('fill list: separate date and time columns, signed quantity, IBKR Flex multiplier and order type', () => {
  const csv = [
    'Symbol,Date,Time,Quantity,TradePrice,IBCommission,Multiplier,OrderType',
    'MNQ,2026-03-02,9:35:00 AM,2,21000,-1.24,2,LMT',
    'MNQ,2026-03-02,9:50:00 AM,-2,20990,-1.24,2,STP',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'flex.csv' });
  assert.equal(res.format, 'Fill list');
  const [t] = res.trades;
  assert.equal(t.entryTime.toISOString(), '2026-03-02T14:35:00.000Z');
  near(t.pnl, -10 * 2 * 2 - 2.48);
  assert.equal(t.stoppedOut, true);
});

test('unknown files name every supported format', () => {
  const res = parseFile('a,b\n1,2', { timeZone: NY, fileName: 'x.csv' });
  assert.equal(res.format, 'unknown');
  assert.match(res.warnings[0], /Tradovate.*NinjaTrader.*Webull.*thinkorswim.*Interactive Brokers/);
});

test('time: a whole file is read day first when any date says so (en-GB NinjaTrader)', () => {
  const csv = [
    'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,MAE,MFE,ETD,Bars',
    '1,ES 03-26,Sim101,,Long,1,6000,6001,09/03/2026 14:35:00,09/03/2026 14:40:00,Entry,Exit,$45.70,$45.70,$4.30,$0,$50,$4.30,5',
    '2,ES 03-26,Sim101,,Long,1,6000,6001,10/03/2026 14:35:00,10/03/2026 14:40:00,Entry,Exit,$45.70,$91.40,$4.30,$0,$50,$4.30,5',
  ].join('\n');
  // No date past the 12th, but no AM/PM either: NinjaTrader's US format always has AM/PM.
  const nt = parseFile(csv, { timeZone: 'Europe/London', fileName: 'nt.csv' });
  assert.deepEqual(nt.trades.map((t) => t.entryTime.toISOString()), ['2026-03-09T14:35:00.000Z', '2026-03-10T14:35:00.000Z']);

  const fills = ['Symbol,Side,Qty,Price,Time', 'AAPL,Buy,10,100,09/03/2026 10:00', 'AAPL,Sell,10,101,13/03/2026 10:00'].join('\n');
  const res = parseFile(fills, { timeZone: NY, fileName: 'f.csv' });
  assert.equal(res.trades[0].direction, 'long');
  assert.equal(res.trades[0].entryTime.toISOString(), '2026-03-09T14:00:00.000Z');
});

test('time: zone suffixes we do not know fall back to the chosen zone instead of failing', () => {
  const at = (s: string, tz = NY) => zonedTimeToUtc(s, tz)?.toISOString();
  assert.equal(at('2026-03-02 09:30:00+00'), '2026-03-02T09:30:00.000Z');
  assert.equal(at('2026-03-02 09:30:00 +0000 UTC'), '2026-03-02T09:30:00.000Z');
  assert.equal(at('2026-03-02 09:30:00 CET'), '2026-03-02T14:30:00.000Z');
  assert.equal(at('2026-03-02 09:30:00 (EST)', 'UTC'), '2026-03-02T14:30:00.000Z');
  assert.equal(at('2026-03-02T09:30:00z'), '2026-03-02T09:30:00.000Z');
  assert.equal(at('2026-03-02 09:30:00,123'), '2026-03-02T14:30:00.000Z');
  assert.equal(at('2026-03-02 09:30:00 GMT-5', 'UTC'), '2026-03-02T14:30:00.000Z');
  assert.equal(at('3/2/2026 9:31:05 AM -05:00', 'UTC'), '2026-03-02T14:31:05.000Z');
  assert.equal(at('02.03.2026 09:30'), '2026-03-02T14:30:00.000Z');
});

test('ninjatrader: stock tickers that are also futures roots stay stocks; scale-ins merge', () => {
  const csv = [
    'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,MAE,MFE,ETD,Bars',
    '1,CL,Sim101,,Long,100,90.00,90.90,3/2/2026 9:35:00 AM,3/2/2026 9:50:00 AM,Entry,Exit,$89.00,$89.00,$1.00,$10,$95,$6,15',
    '2,MNQ 03-26,Sim101,,Long,1,21000,21010,3/2/2026 10:00:00 AM,3/2/2026 10:10:00 AM,Entry,Exit,$20.00,$109.00,$0,$0,$20,$0,10',
    '3,MNQ 03-26,Sim101,,Long,1,21004,21010,3/2/2026 10:02:00 AM,3/2/2026 10:10:00 AM,Entry,Exit,$12.00,$121.00,$0,$0,$12,$0,8',
    '4,MNQ 03-26,Sim101,,Long,1,21020,21030,3/2/2026 10:10:00 AM,3/2/2026 10:20:00 AM,Entry,Exit,$20.00,$141.00,$0,$0,$20,$0,10',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'nt.csv' });
  const cl = res.trades.find((t) => t.symbol === 'CL')!;
  near(cl.returnPct, (89 / 9000) * 100);
  const mnq = res.trades.filter((t) => t.symbol === 'MNQ');
  assert.equal(mnq.length, 2);
  assert.equal(mnq[0].qty, 2);
  near(mnq[0].pnl, 32);
  assert.equal(mnq[1].entryTime.toISOString(), '2026-03-02T15:10:00.000Z');
});

test('tradovate: same-second shorts keep their direction; contract months stay separate positions', () => {
  const head = 'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration';
  const csv = [
    head,
    // Sold 2 at 10:00:00, bought 1 back in the same second, the other a minute later.
    'MNQH6,-2,0,0.25,202,201,1,21018.00,21020.00,$4.00,03/02/2026 10:00:00,03/02/2026 10:00:00,0sec',
    'MNQH6,-2,0,0.25,203,201,1,21015.00,21020.00,$10.00,03/02/2026 10:01:00,03/02/2026 10:00:00,1min',
    // A calendar roll: long March, short June at the same time.
    'MNQH6,-2,0,0.25,301,302,1,21000.00,21010.00,$20.00,03/09/2026 10:00:00,03/09/2026 10:05:00,5min',
    'MNQM6,-2,0,0.25,304,303,1,21100.00,21105.00,$10.00,03/09/2026 10:05:00,03/09/2026 10:00:00,5min',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'tv.csv' });
  const [short, march, june] = res.trades;
  assert.equal(short.direction, 'short');
  assert.equal(short.qty, 2);
  near(short.pnl, 14);
  assert.equal(march.direction, 'long');
  near(march.pnl, 20);
  assert.equal(june.direction, 'short');
  near(june.pnl, 10);
  assert.equal(res.trades.length, 3);
});

test('fill list: IBKR Flex with DateTime and TradeDate, one level of detail, several accounts', () => {
  const csv = [
    'ClientAccountID,Symbol,AssetClass,Multiplier,TradeDate,DateTime,Quantity,TradePrice,IBCommission,Buy/Sell,LevelOfDetail',
    'U1,AAPL,STK,1,20260302,20260302;094000,100,180,-1,BUY,EXECUTION',
    'U2,AAPL,STK,1,20260302,20260302;094500,50,181,-1,BUY,EXECUTION',
    'U1,AAPL,STK,1,20260302,20260302;100000,-100,182,-1,SELL,EXECUTION',
    'U1,AAPL,STK,1,20260302,20260302;100000,-100,182,-1,SELL,ORDER',
    'ClientAccountID,Symbol,AssetClass,Multiplier,TradeDate,DateTime,Quantity,TradePrice,IBCommission,Buy/Sell,LevelOfDetail',
    'U2,AAPL,STK,1,20260302,20260302;110000,-50,183,-1,SELL,EXECUTION',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'flex.csv' });
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(res.trades.map((t) => [t.qty, t.pnl]), [[100, 198], [50, 98]]);
});

test('fill list: underscored and CamelCase sides, fractional quantities, short rows', () => {
  const csv = [
    'Symbol,Action,Qty,Price,Date,Time',
    'XYZ260320C00010000,BUY_TO_OPEN,1,1.00,2026-03-02,09:35:00',
    'XYZ260320C00010000,SELL_TO_CLOSE,1,1.50,2026-03-02,09:40:00',
    'ABC,SellShort,10,20,2026-03-02,09:41:00',
    'ABC,BuyToCover,10,19,2026-03-02,09:42:00',
    'BTC,Buy,0.1,60000,2026-03-02,10:00:00',
    'BTC,Buy,0.2,60000,2026-03-02,10:01:00',
    'BTC,Sell,0.3,61000,2026-03-02,10:02:00',
    'Total',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'f.csv' });
  assert.deepEqual(res.trades.map((t) => [t.symbol, t.direction, +t.pnl.toFixed(2)]), [
    ['XYZ260320C00010000', 'long', 50],
    ['ABC', 'short', 10],
    ['BTC', 'long', 300],
  ]);
  assert.deepEqual(res.warnings, ["Row 9 couldn't be read; skipped."]);
});

test('fill list: no side column and only positive quantities is refused, not read as all buys', () => {
  const res = parseFile('Symbol,Qty,Price,Time\nAAPL,10,100,2026-03-02 10:00\nAAPL,10,101,2026-03-02 11:00', { timeZone: NY, fileName: 'f.csv' });
  assert.equal(res.format, 'unknown');
  assert.equal(res.trades.length, 0);
});

test('fill list: an option still open after its expiry says so', () => {
  const res = parseFile('Symbol,Side,Qty,Price,Time\nAAPL260320C00200000,Buy,1,2.00,2026-03-02 10:00', { timeZone: NY, fileName: 'f.csv' });
  assert.match(res.warnings[0], /still open after its expiry/);
});

test('time: every IBKR Flex date/time setting, year-first and dashed dates, month names', () => {
  const at = (s: string, dayFirst = false) => zonedTimeToUtc(s, NY, dayFirst)?.toISOString();
  for (const s of ['20260302;09:35:12', '20260302 09:35:12', '2026-03-02;093512', '03/02/2026;093512', '20260302,093512', '20260302093512', '02-Mar-26 09:35:12', '2026/3/2 9:35:12']) {
    assert.equal(at(s), '2026-03-02T14:35:12.000Z', s);
  }
  assert.equal(at('02-03-2026 09:35:12', true), '2026-03-02T14:35:12.000Z');
  assert.equal(at('3/2/2026 13:05:00 PM'), '2026-03-02T18:05:00.000Z');
  assert.equal(at('2026-03-02'), undefined);
});

const NT_HEAD = 'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,MAE,MFE,ETD,Bars';

test('ninjatrader: an ambiguous file goes by time zone (en-AU with am/pm, US on a 24-hour clock)', () => {
  const au = [NT_HEAD, '1,ES 03-26,Sim101,,Long,1,6000,6001,10/03/2026 1:35:00 am,10/03/2026 1:40:00 am,Entry,Exit,$50,$50,$0,$0,$50,$0,5'].join('\n');
  const res = parseFile(au, { timeZone: 'Australia/Sydney', fileName: 'nt.csv' });
  assert.equal(res.trades[0].entryTime.toISOString(), '2026-03-09T14:35:00.000Z');
  assert.match(res.warnings.join(), /read day first/);
  // "6/03/2026" (unpadded day, padded month) is day first whatever the zone.
  const dmm = au.replaceAll('10/03/2026', '6/03/2026');
  assert.equal(parseFile(dmm, { timeZone: NY, fileName: 'nt.csv' }).trades[0].entryTime.toISOString(), '2026-03-06T06:35:00.000Z');
  const us = [NT_HEAD, '1,ES 03-26,Sim101,,Long,1,6000,6001,03/02/2026 09:35:00,03/02/2026 09:40:00,Entry,Exit,$50,$50,$0,$0,$50,$0,5'].join('\n');
  const usRes = parseFile(us, { timeZone: 'America/Chicago', fileName: 'nt.csv' });
  assert.equal(usRes.trades[0].entryTime.toISOString(), '2026-03-02T15:35:00.000Z');
  assert.deepEqual(usRes.warnings, []);
});

test('fill list: day-first guess for non-US zones in the Americas too (Brazil)', () => {
  const csv = ['Symbol,Side,Qty,Price,Time', 'PETR4,Buy,100,30,02/03/2026 10:00', 'PETR4,Sell,100,31,02/03/2026 11:00'].join('\n');
  const res = parseFile(csv, { timeZone: 'America/Sao_Paulo', fileName: 'f.csv' });
  assert.equal(res.trades[0].entryTime.toISOString(), '2026-03-02T13:00:00.000Z'); // 2 March, not February 3
  assert.match(res.warnings.join(), /read day first/);
});

test('combine: identical trades in two accounts are both kept; a closed trade beats its open copy', () => {
  const fills = ['Account,Symbol,Side,Qty,Price,Time', 'A,AAPL,Buy,10,100,2026-03-02 10:00', 'A,AAPL,Sell,10,101,2026-03-02 11:00', 'B,AAPL,Buy,10,100,2026-03-02 10:00', 'B,AAPL,Sell,10,101,2026-03-02 11:00'].join('\n');
  const res = parseFile(fills, { timeZone: NY, fileName: 'f.csv' });
  assert.equal(combineTrades([res.trades]).reduce((s, t) => s + t.pnl, 0), 20);

  const nt = [NT_HEAD, '1,ES 03-26,Acct1,,Long,1,6000,6001,3/2/2026 9:35:00 AM,3/2/2026 9:40:00 AM,Entry,Exit,$50,$50,$0,$0,$50,$0,5', '2,ES 03-26,Acct2,,Long,1,6000,6001,3/2/2026 9:35:00 AM,3/2/2026 9:40:00 AM,Entry,Exit,$50,$100,$0,$0,$50,$0,5'].join('\n');
  const ntRes = parseFile(nt, { timeZone: NY, fileName: 'nt.csv' });
  assert.equal(combineTrades([ntRes.trades]).reduce((s, t) => s + t.pnl, 0), 100);

  const early = parseFile(fills.split('\n').slice(0, 2).join('\n'), { timeZone: NY, fileName: 'early.csv' });
  const all = combineTrades([early.trades, res.trades]);
  assert.equal(all.filter((t) => t.exitTime === null).length, 0);
  assert.equal(all.reduce((s, t) => s + t.pnl, 0), 20);
});

test('ibkr: a C;O flip with nothing open closed a position from before the file, so it is left out', () => {
  const head = 'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Code';
  const csv = [
    head,
    'Trades,Data,Order,Stocks,USD,AAPL,"2026-03-02, 09:31:00",-200,180,36000,-1,C;O',
    'Trades,Data,Order,Stocks,USD,AAPL,"2026-03-02, 09:50:00",100,179,-17900,-1,C',
    'Trades,Data,Order,Stocks,USD,AAPL,"2026-03-02, 10:00:00",100,175,-17500,-1,O',
    'Trades,Data,Order,Stocks,USD,AAPL,"2026-03-02, 10:30:00",-100,180,18000,-1,C',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'ib.csv' });
  assert.deepEqual(res.trades.map((t) => [t.direction, t.pnl]), [['long', 498]]);
  assert.match(res.warnings.join(), /2 closing fills/);
});

test('thinkorswim: same-second fees split by quantity; unknown futures are flagged', () => {
  const csv = [
    'Cash Balance',
    'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
    '3/3/26,09:45:00,TRD,="1",SPREAD,,-2.60,-112.60,1000',
    '3/3/26,10:30:00,TRD,="2",SPREAD,,-2.60,147.40,1000',
    '',
    'Account Trade History',
    ',Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type',
    ',3/3/26 09:45:00,VERTICAL,BUY,+1,TO OPEN,SPY,20 MAR 26,600,CALL,3.20,1.10,LMT',
    ',,,SELL,-1,TO OPEN,SPY,20 MAR 26,605,CALL,2.10,CREDIT,',
    ',3/3/26 10:30:00,VERTICAL,SELL,-1,TO CLOSE,SPY,20 MAR 26,600,CALL,4.00,1.50,LMT',
    ',,,BUY,+1,TO CLOSE,SPY,20 MAR 26,605,CALL,2.50,DEBIT,',
    ',3/4/26 10:00:00,FUTURE,BUY,+1,TO OPEN,/XYZH26,,,FUTURE,100,100,MKT',
    ',3/4/26 10:30:00,FUTURE,SELL,-1,TO CLOSE,/XYZH26,,,FUTURE,101,101,MKT',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'tos.csv' });
  near(res.trades.find((t) => t.symbol.includes('600'))!.pnl, 80 - 2.6);
  near(res.trades.find((t) => t.symbol.includes('605'))!.pnl, -40 - 2.6);
  assert.match(res.warnings.join(), /contract size of \/XYZH26/);
});

test('ninjatrader: a re-entry inside a position counts the largest position held, not every lot', () => {
  const csv = [
    NT_HEAD,
    '1,MNQ 03-26,Sim101,,Long,1,21000,21010,3/2/2026 10:00:00 AM,3/2/2026 10:10:00 AM,Entry,Exit,$20,$20,$0,$0,$20,$0,10',
    '2,MNQ 03-26,Sim101,,Long,1,21000,21010,3/2/2026 10:02:00 AM,3/2/2026 10:03:00 AM,Entry,Exit,$20,$40,$0,$0,$20,$0,1',
    '3,MNQ 03-26,Sim101,,Long,1,21000,21010,3/2/2026 10:04:00 AM,3/2/2026 10:05:00 AM,Entry,Exit,$20,$60,$0,$0,$20,$0,1',
  ].join('\n');
  const [t] = parseFile(csv, { timeZone: NY, fileName: 'nt.csv' }).trades;
  assert.equal(t.qty, 2);
  near(t.pnl, 60);
  near(t.returnPct, (60 / (21000 * 2 * 2)) * 100);
});
