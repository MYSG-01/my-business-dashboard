// "My Excel": the viewer's own workbook. The training workbooks (data/templates/) hold
// the same records as the Day 1 CSV files, so reading them through the Excel path must
// give exactly the answer-key figures and the same task suggestions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook, workbookScenario, workbookColumns, cellValue, SHEETS, MY_EXCEL } from '../src/data/workbook.js';
import { loadScenario as openScenario, setWorkbookScenario, businessProfile, allBusinessIds, DIVORCE } from '../src/data/scenarios.js';
import { loadScenario } from './support/training.js';
import { computeMetrics } from '../src/core/metrics.js';
import { suggestionsFor } from '../src/core/scenario-tasks.js';
import { createStateStore, memoryStorage, PREFIX } from '../src/storage/local-state.js';
import { renderTemplatesModule, TEMPLATES_OUTPUT } from '../scripts/pack-data.js';
import { setLocale } from '../src/i18n/i18n.js';

setLocale('en');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bytes = file => { const b = readFileSync(path.join(root, 'data/templates', file)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const cents = n => Math.round(n * 100);
async function open(file) {
  const { sheets, missing } = await readWorkbook(bytes(file));
  return workbookScenario({ fileName: file, loadedAt: '2026-09-24T06:00:00.000Z', sheets, missing });
}

for (const [file, business] of [['BetterSpace_B2C.xlsx', 'b2c'], ['BetterSpace_B2B.xlsx', 'b2b']]) {
  test(`${file}: read through the Excel path, figures match expected_metrics.json (Day 1)`, async () => {
    const s = await open(file);
    const e = JSON.parse(readFileSync(path.join(root, 'test/expected', business, 'day1/expected_metrics.json'), 'utf8'));
    assert.equal(s.ok, true, JSON.stringify(s.issues.filter(i => i.level === 'error').slice(0, 3)));
    assert.deepEqual(s.issues, [], 'the training workbook raises no warnings');
    assert.equal(s.reportingDate, e.as_of_date, 'reporting date = latest dated event in the file');
    assert.deepEqual(s.source.counts, { Customers: e.row_counts.Customers, Sales: e.row_counts.Sales, Payments: e.row_counts.Payments, Stock: e.row_counts.Stock });
    const m = computeMetrics(s.records, s.reportingDate, { historyStart: s.historyStart });
    assert.equal(m.all_time_order_value, cents(e.all_time_order_value));
    assert.equal(m.all_time_cash_collected, cents(e.all_time_cash_collected));
    assert.equal(m.outstanding_balance, cents(e.outstanding_balance));
    assert.equal(m.overdue_balance, cents(e.overdue_balance));
    assert.equal(m.period_order_value, cents(e.august_order_value));
    assert.equal(m.period_order_count, e.august_order_count);
    assert.equal(m.period_cash_collected, cents(e.august_cash_collected));
    assert.equal(m.comparison.prior_order_value, cents(e.prior_comparable_order_value));
    assert.deepEqual(m.overdue_sale_ids, [...e.overdue_sale_ids].sort());
    assert.deepEqual(m.overdue_completion_ids, [...e.overdue_completion_ids].sort());
    assert.deepEqual(m.low_stock_ids, [...e.low_stock_ids].sort());
    assert.deepEqual(m.overdue_follow_up_ids, [...e.overdue_follow_up_ids].sort());
  });

  test(`${file}: same records and task suggestions as the training CSV files`, async () => {
    const s = await open(file);
    const csv = loadScenario(`betterspace-${business}`, 'day1');
    for (const entity of ['customers', 'sales', 'payments', 'stock']) {
      const strip = rows => rows.map(({ _row, _source, ...r }) => (void _row, void _source, r));
      assert.deepEqual(strip(s.records[entity]), strip(csv.records[entity]), `${entity} records are identical`);
    }
    assert.deepEqual(suggestionsFor(s).map(t => t.task_key).sort(), suggestionsFor(csv).map(t => t.task_key).sort());
  });
}

test('the dashboard has two businesses (transfers and divorce), each with its own opened workbook, and no built-in data', async () => {
  assert.deepEqual(allBusinessIds(), [MY_EXCEL, DIVORCE]);
  setWorkbookScenario(null);
  assert.equal(openScenario(), null, 'nothing open yet: the pages show how to open a file');
  assert.equal(businessProfile().business.short_zh, '我的 Excel');
  const s = await open('BetterSpace_B2B.xlsx');
  setWorkbookScenario(s);
  assert.equal(openScenario(), s);
  assert.equal(businessProfile().business.name, 'BetterSpace_B2B');
  assert.deepEqual(businessProfile().business.team, ['Amir', 'Mei', 'Sarah']);
  setWorkbookScenario(null);
});

test('Excel dates, blanks and numbers become what the mapping expects', () => {
  assert.equal(cellValue(new Date(Date.UTC(2026, 7, 30))), '2026-08-30');
  assert.equal(cellValue(null), '');
  assert.equal(cellValue(12.5), 12.5);
  assert.equal(cellValue('In Progress'), 'In Progress');
});

test('problems in a workbook are reported clearly and block the figures', async () => {
  const { sheets } = await readWorkbook(bytes('BetterSpace_B2C.xlsx'));
  // A missing sheet
  const noStock = { ...sheets }; delete noStock.Stock;
  const a = workbookScenario({ fileName: 'x.xlsx', loadedAt: '', sheets: noStock, missing: ['Stock'] });
  assert.equal(a.ok, false);
  assert.match(a.issues[0].message, /Sheet "Stock" was not found/);
  // A renamed required column
  const renamed = { ...sheets, Sales: sheets.Sales.map((r, i) => (i === 0 ? r.map(h => (h === 'sale_date' ? 'Order date' : h)) : r)) };
  const b = workbookScenario({ fileName: 'x.xlsx', loadedAt: '', sheets: renamed });
  assert.equal(b.ok, false);
  assert.match(b.issues.find(i => i.code === 'missing_header').message, /Column "sale_date" .* Use the column names from the template workbook/);
  // An unknown status value, with the accepted list in the message
  const status = sheets.Sales[0].indexOf('status');
  const badStatus = { ...sheets, Sales: sheets.Sales.map((r, i) => (i === 1 ? r.map((v, j) => (j === status ? 'Shipped' : v)) : r)) };
  const c = workbookScenario({ fileName: 'x.xlsx', loadedAt: '', sheets: badStatus });
  assert.equal(c.ok, false);
  assert.match(c.issues.find(i => i.code === 'unknown_status').message, /"Shipped" is not one of the accepted statuses \(Confirmed, In Progress, Completed, Cancelled\)/);
  // Not an Excel file at all
  await assert.rejects(readWorkbook(new TextEncoder().encode('customer_id,name\n1,a').buffer), /could not be read as an Excel workbook/);
});

test('optional columns may be left out; the dashboard says which ones are missing', async () => {
  const { sheets } = await readWorkbook(bytes('BetterSpace_B2B.xlsx'));
  const drop = (rows, col) => { const i = rows[0].indexOf(col); return rows.map(r => r.filter((_, j) => j !== i)); };
  const s = workbookScenario({ fileName: 'lean.xlsx', loadedAt: '', sheets: { ...sheets, Customers: drop(drop(sheets.Customers, 'account_owner'), 'next_follow_up_date'), Sales: drop(sheets.Sales, 'payment_due_date') } });
  assert.equal(s.ok, true);
  assert.match(s.issues.find(i => i.code === 'optional_columns_missing').message, /in the file \(figures that use them stay blank or zero\): payment_due_date\.$/, 'only payment_due_date is reported; B2C-style files never have owners or follow-ups');
  const m = computeMetrics(s.records, s.reportingDate, { historyStart: s.historyStart });
  assert.equal(m.overdue_balance, 0, 'no due dates → nothing can be overdue');
  assert.equal(m.outstanding_balance, 9109000, 'balances still use every receipt');
  assert.ok(!suggestionsFor(s).some(t => t.rule === 'follow_up_due'), 'without follow-up dates the B2C rules apply');
  const required = workbookColumns().find(c => c.sheet === 'Sales').required;
  assert.deepEqual(required, ['sale_id', 'sale_date', 'total_amount']);
});

test('the workbook is remembered in this browser, within a size limit, and can be forgotten', async () => {
  const storage = memoryStorage();
  const store = createStateStore(storage);
  const { sheets } = await readWorkbook(bytes('BetterSpace_B2C.xlsx'));
  assert.equal(store.saveWorkbook({ fileName: 'BetterSpace_B2C.xlsx', loadedAt: '2026-09-24T06:00:00.000Z', sheets }), 'saved');
  const back = createStateStore(storage).workbook();
  assert.equal(back.fileName, 'BetterSpace_B2C.xlsx');
  assert.deepEqual(back.sheets, sheets);
  assert.equal(workbookScenario(back).ok, true, 'a reload rebuilds the same scenario');
  store.saveDecision(MY_EXCEL, { task_key: 'review_replenishment:R003', status: 'accepted' });
  store.saveDecision('betterspace-b2c', { task_key: 'review_replenishment:R003', status: 'dismissed' });
  assert.equal(store.forgetWorkbook(MY_EXCEL), true);
  assert.equal(store.workbook(), null);
  assert.deepEqual(store.decisions(MY_EXCEL), [], 'its decisions go with it');
  assert.equal(store.decisions('betterspace-b2c')[0].status, 'dismissed', 'the demo businesses are untouched');
  const huge = { Customers: [['customer_id'], ...Array.from({ length: 400000 }, (_, i) => [`C-${i}`])] };
  assert.equal(store.saveWorkbook({ fileName: 'big.xlsx', loadedAt: '', sheets: huge }), 'too_large');
  assert.equal(storage.getItem(`${PREFIX}.workbook`), null);
  storage.setItem(`${PREFIX}.workbook`, JSON.stringify({ version: 1, fileName: 'x', sheets: { Customers: [[{ evil: 1 }]] } }));
  assert.equal(store.workbook(), null, 'malformed stored data is ignored');
});

test('the Excel templates and the vendored reader are up to date', async () => {
  assert.equal(readFileSync(TEMPLATES_OUTPUT, 'utf8'), renderTemplatesModule(), 'run `npm run data`');
  const { buildVendor, VENDOR_OUTPUT } = await import('../scripts/vendor.js');
  assert.equal(readFileSync(VENDOR_OUTPUT, 'utf8'), await buildVendor(), 'run `node scripts/vendor.js`');
  assert.deepEqual(SHEETS, ['Customers', 'Sales', 'Payments', 'Stock']);
});

// docs/START_HERE.md §5: the classroom demo of updating the Excel and reading it again.
test('classroom demo: adding the BS-001 payment row to the B2B workbook updates the figures', async () => {
  const s1 = await open('BetterSpace_B2B.xlsx');
  const { sheets } = await readWorkbook(bytes('BetterSpace_B2B.xlsx'));
  const updated = { ...sheets, Payments: [...sheets.Payments, ['BP-UPDATE', 'BS-001', '2026-08-31', 4500, 'Bank transfer']] };
  const s2 = workbookScenario({ fileName: 'BetterSpace_B2B.xlsx', loadedAt: '2026-09-25T06:00:00.000Z', sheets: updated, missing: [] });
  const m = s => computeMetrics(s.records, s.reportingDate, { historyStart: s.historyStart });
  const [a, b] = [m(s1), m(s2)];
  assert.deepEqual([s1.reportingDate, s2.reportingDate], ['2026-08-30', '2026-08-31']);
  assert.deepEqual([a.overdue_balance, b.overdue_balance], [cents(30515), cents(26015)]);
  assert.deepEqual([a.outstanding_balance, b.outstanding_balance], [cents(91090), cents(86590)]);
  assert.deepEqual([a.period_cash_collected, b.period_cash_collected], [cents(193765), cents(198265)]);
  assert.deepEqual([a.overdue_completion_ids, b.overdue_completion_ids], [[], ['BS-003']]);
  const keys = s => suggestionsFor(s).map(t => t.task_key);
  assert.ok(keys(s1).includes('payment_follow_up:BS-001') && !keys(s2).includes('payment_follow_up:BS-001'));
});

test('in the practice layout, dates written 30/08/2026 and amounts written RM 12.50 open directly', async () => {
  const { sheets } = await readWorkbook(bytes('BetterSpace_B2B.xlsx'));
  const plain = workbookScenario({ fileName: 'b.xlsx', loadedAt: '2026-09-24T06:00:00.000Z', sheets });
  const typed = structuredClone(sheets);
  const head = typed.Sales[0];
  const [d, a] = ['sale_date', 'total_amount'].map(c => head.indexOf(c));
  for (const row of typed.Sales.slice(1)) {
    const iso = String(cellValue(row[d]));
    row[d] = `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    row[a] = `RM ${Number(row[a]).toFixed(2)}`;
  }
  const s = workbookScenario({ fileName: 'b.xlsx', loadedAt: '2026-09-24T06:00:00.000Z', sheets: typed });
  assert.equal(s.ok, true, JSON.stringify(s.issues.filter(i => i.level === 'error').slice(0, 3)));
  assert.deepEqual(s.records.sales.map(r => [r.date, r.amount]), plain.records.sales.map(r => [r.date, r.amount]));
});

// The legal-services practice workbook has the optional "department" column (转名 / 继承 /
// 离婚) and an empty Stock sheet. Per-department figures are checked against sums made
// straight from the sheet rows, not through the mapping or metrics code.
test('BetterSpace_Legal.xlsx: departments add up, the department filter matches, empty stock is hidden', async () => {
  const { sheets, missing } = await readWorkbook(bytes('BetterSpace_Legal.xlsx'));
  const s = workbookScenario({ fileName: 'BetterSpace_Legal.xlsx', loadedAt: '2026-11-20T06:00:00.000Z', sheets, missing });
  assert.equal(s.ok, true, JSON.stringify(s.issues.slice(0, 3)));
  assert.deepEqual(s.issues, [], 'no warnings');
  assert.deepEqual(s.source.absent, ['Stock'], 'a Stock sheet with no rows counts as no stock');
  const [head, ...rows] = sheets.Sales;
  const col = name => head.indexOf(name);
  const live = rows.filter(r => r[col('status')] !== 'Cancelled' && r[col('sale_date')] <= s.reportingDate);
  const deptOf = new Map(live.map(r => [r[col('sale_id')], r[col('department')]]));
  const [pHead, ...pRows] = sheets.Payments;
  const paid = new Map();
  for (const p of pRows) if (deptOf.has(p[pHead.indexOf('sale_id')])) paid.set(p[pHead.indexOf('sale_id')], (paid.get(p[pHead.indexOf('sale_id')]) || 0) + p[pHead.indexOf('amount')]);
  const expect = {};
  for (const r of live) {
    const d = (expect[r[col('department')]] ||= { value: 0, count: 0, outstanding: 0 });
    d.value += r[col('total_amount')]; d.count++;
    d.outstanding += Math.max(0, r[col('total_amount')] - (paid.get(r[col('sale_id')]) || 0));
  }
  assert.deepEqual(Object.keys(expect).sort(), ['离婚', '继承', '转名'].sort());
  const all = { periodStart: s.historyStart, periodEnd: s.reportingDate, historyStart: s.historyStart };
  const m = computeMetrics(s.records, s.reportingDate, all);
  for (const d of m.by_department) {
    assert.equal(d.period_order_value, cents(expect[d.department].value), d.department);
    assert.equal(d.period_order_count, expect[d.department].count, d.department);
    assert.equal(d.outstanding_balance, cents(expect[d.department].outstanding), d.department);
    const only = computeMetrics(s.records, s.reportingDate, { ...all, filters: { department: d.department } });
    assert.equal(only.period_order_value, d.period_order_value, 'the filter shows the same figure as the department row');
    assert.equal(only.outstanding_balance, d.outstanding_balance);
    assert.deepEqual(only.by_department, m.by_department, 'the department table ignores the department filter');
  }
  assert.equal(m.by_department.reduce((a, d) => a + d.period_order_value, 0), m.period_order_value);
  assert.equal(m.by_department.reduce((a, d) => a + d.outstanding_balance, 0), m.outstanding_balance);
});

test('workbooks without a department column have no department figures', async () => {
  const s = await open('BetterSpace_B2B.xlsx');
  assert.deepEqual(computeMetrics(s.records, s.reportingDate, { historyStart: s.historyStart }).by_department, []);
});

test('BetterSpace_Legal.xlsx: the case_owner column drives the owner filter; the wording becomes 案件 / case', async () => {
  const { toCaseWording, usesCaseWording } = await import('../src/i18n/i18n.js');
  const { sheets, missing } = await readWorkbook(bytes('BetterSpace_Legal.xlsx'));
  const s = workbookScenario({ fileName: 'BetterSpace_Legal.xlsx', loadedAt: '2026-11-20T06:00:00.000Z', sheets, missing });
  const [head, ...rows] = sheets.Sales;
  const col = name => head.indexOf(name);
  const lawyers = [...new Set(rows.map(r => r[col('case_owner')]))];
  assert.ok(lawyers.length >= 3);
  const all = { periodStart: s.historyStart, periodEnd: s.reportingDate, historyStart: s.historyStart };
  for (const lawyer of lawyers) {
    const expect = rows.filter(r => r[col('case_owner')] === lawyer && r[col('status')] !== 'Cancelled').reduce((a, r) => a + r[col('total_amount')], 0);
    assert.equal(computeMetrics(s.records, s.reportingDate, { ...all, filters: { owner: lawyer } }).period_order_value, cents(expect), lawyer);
  }
  assert.equal(s.profile.labels_zh.sales, '案件');
  setWorkbookScenario(s);
  assert.equal(usesCaseWording(), true);
  setWorkbookScenario(await open('BetterSpace_B2B.xlsx'));
  assert.equal(usesCaseWording(), false, 'no department column: orders stay orders');
  setWorkbookScenario(null);
  assert.equal(toCaseWording('期间订单额 · 6 张订单 · 1 张销售单'), '期间案件金额 · 6 宗案件 · 1 宗案件');
  assert.equal(toCaseWording('2 sale(s) past due · Sale · from the sales records'), '2 case(s) past due · Case · from the sales records');
  assert.equal(toCaseWording('Orders in period · order value · Reorder level'), 'Cases in period · case value · Reorder level');
});

// The optional Calendar sheet: rows with a date and a title become appointments on the calendar.
// Details (phone numbers, PIC) are kept out of the calendar item, so the AI request never gets them.
test('a Calendar sheet becomes appointments; rows without a date or title are left out', async () => {
  const { readAppointments } = await import('../src/data/workbook.js');
  const { buildCalendarItems } = await import('../src/core/calendar.js');
  const { sheets, missing } = await readWorkbook(bytes('BetterSpace_B2B.xlsx'));
  const calendar = [
    ['date', 'title', 'detail'],
    ['2026-11-04', '继承 · Wong · 10–11am', '电话 012-0000000 · PIC Ivan/Alyssa'],
    ['05/11/2026', '继承 · Doris Shi · 11am', '+60 10-000 0000'],
    ['', '没有日期', '这行要略过'],
    ['2026-11-21', '', '没有标题，也要略过'],
  ];
  const r = readAppointments(calendar);
  assert.deepEqual(r.list.map(a => [a.date, a.title]), [['2026-11-04', '继承 · Wong · 10–11am'], ['2026-11-05', '继承 · Doris Shi · 11am']]);
  assert.equal(r.skipped, 2);
  const s = workbookScenario({ fileName: 'x.xlsx', loadedAt: 'x', sheets: { ...sheets, Calendar: calendar }, missing });
  assert.equal(s.appointments.length, 2);
  assert.ok(s.issues.some(i => i.code === 'appointments_skipped'));
  const items = buildCalendarItems({ records: s.records, metrics: computeMetrics(s.records, s.reportingDate, { historyStart: s.historyStart }), tasks: [], reportingDate: s.reportingDate, appointments: s.appointments });
  const appt = items.filter(i => i.kind === 'appointment');
  assert.equal(appt.length, 2);
  assert.ok(appt.every(i => i.note === '' && !/\d{3}-\d{7}|\+60/.test(JSON.stringify(i))), 'no phone numbers in calendar items');
  assert.equal(appt[0].type, 'appointment');
});

// A case with no date yet is kept (its name and fee are shown), but no date-based figure counts it.
test('a case with a blank date is kept and left out of date-based figures', async () => {
  const { sheets, missing } = await readWorkbook(bytes('BetterSpace_B2B.xlsx'));
  const [head, ...rows] = sheets.Sales;
  const blank = [head, ...rows.slice(0, 1).map(r => r.map((v, i) => (head[i] === 'sale_date' ? '' : v))), ...rows.slice(1)];
  const withBlank = workbookScenario({ fileName: 'x.xlsx', loadedAt: '', sheets: { ...sheets, Sales: blank }, missing });
  assert.equal(withBlank.ok, true, JSON.stringify(withBlank.issues.filter(i => i.level === 'error').slice(0, 2)));
  assert.equal(withBlank.records.sales.length, rows.length, 'the undated case is still a case');
  const withDate = await open('BetterSpace_B2B.xlsx');
  const a = computeMetrics(withBlank.records, withBlank.reportingDate, { historyStart: withBlank.historyStart });
  const b = computeMetrics(withDate.records, withDate.reportingDate, { historyStart: withDate.historyStart });
  assert.ok(a.all_time_order_value < b.all_time_order_value, 'the undated case is not in the order value');
});
