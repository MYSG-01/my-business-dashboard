// ROAS per advertising period, from the Ads sheet. Figures are checked against the numbers the
// business worked out by hand (RM; the code uses cents).
import test from 'node:test';
import assert from 'node:assert/strict';
import { adsFigures, readAdsRows, ADS_ROAS_RATE } from '../src/core/ads.js';

const c = rm => Math.round(rm * 100);
const period = (label, adv, enq, dep, sub, pending, approved, bf, extra = {}) => adsFigures({
  period: label, adFeeBeforeTax: c(adv), enquiries: enq, deposits: dep, submissions: sub,
  pending: c(pending), approved: c(approved), broughtForward: c(bf), cpmStated: null, ...extra,
});

test('ROAS = total sales × 0.5% ÷ ad cost incl. 16% tax, for the four periods', () => {
  const oct2031 = period('Oct 2026 (20/10-31/10)', 7444.54, 95, 5, 4, 3592000, 9173063, 4689365);
  assert.equal(oct2031.adCost, c(8635.67));
  assert.equal(oct2031.totalSales, c(17454428));
  assert.equal(oct2031.cpm, Math.round(c(8635.67) / 95));
  assert.equal(oct2031.roas, 10.11);

  const oct1019 = period('Oct 2026 (10/10-19/10)', 5830.64, 75, 4, 3, 2232000, 12094911, 0);
  assert.equal(oct1019.adCost, c(6763.54));
  assert.equal(oct1019.totalSales, c(14326911));
  assert.equal(oct1019.roas, 10.59);

  const nov1420 = period('Nov 2026 (14/11-20/11)', 4704.74, 57, 0, 0, 2432000, 5020419, 0);
  assert.equal(nov1420.adCost, c(5457.50));
  assert.equal(nov1420.roas, 6.83);

  // Nov 7–13: the CPM is the figure the business wrote (74.45), not the calculated one.
  const nov713 = period('Nov 2026 (7/11-13/11)', 3145.06, 41, 0, 0, 2432000, 5020419, 0, { cpmStated: c(74.45) });
  assert.equal(nov713.cpm, c(74.45));
  assert.equal(nov713.cpmIsStated, true);
  assert.equal(nov713.roas, 10.21);
});

test('the rate is the fixed 0.5% and an empty ad cost or enquiry count gives no figure', () => {
  assert.equal(ADS_ROAS_RATE, 0.005);
  const none = period('x', 0, 0, 0, 0, 0, 0, 0);
  assert.equal(none.roas, null);
  assert.equal(none.cpm, null);
});

test('the Ads sheet is read: money with RM and commas, blank brought forward counts as nothing', () => {
  const rows = [
    ['period', 'adv_fee_before_tax', 'enquiries', 'deposits', 'submissions', 'pending_approval', 'approved', 'brought_forward'],
    ['Oct 2026 (10/10-19/10)', '5830.64', '75', '4', '3', 'RM 2,232,000', 'RM 12,094,911', ''],
    ['', '', '', '', '', '', '', ''],
  ];
  const [p] = readAdsRows(rows);
  assert.equal(rows.length - 1, 2);
  assert.equal(p.totalSales, c(14326911));
  assert.equal(p.roas, 10.59);
  assert.deepEqual(readAdsRows([['period', 'other']]), [], 'no Ads columns → no ROAS card');
});

// The simple form: fill in ad cost, customers and total sales; the rest is worked out.
test('the simple Ads form: adv_fee_before_tax, customers, total_sales — ROAS and ad cost are worked out', () => {
  const rows = [
    ['period', 'adv_fee_before_tax', 'customers', 'total_sales'],
    ['Oct 2026 (20/10-31/10)', '7444.54', '95', '17454428'],
    ['Nov 2026 (14/11-20/11)', '4704.74', '57', 'RM 7,452,419'],
  ];
  const [a, b] = readAdsRows(rows);
  assert.equal(a.adCost, c(8635.67));
  assert.equal(a.enquiries, 95);
  assert.equal(a.roas, 10.11);
  assert.equal(b.totalSales, c(7452419));
  assert.equal(b.roas, 6.83);
});
