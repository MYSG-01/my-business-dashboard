// ROAS for the advertising periods on the workbook's Ads sheet (one row per period).
// Fixed rates live here; the numbers for each period come from the sheet.
//   ad cost (incl. tax)  = ad cost before tax + 16% tax
//   total sales          = approved + pending approval + brought forward
//   ROAS                 = total sales × 0.5% ÷ ad cost (incl. tax)
//   CPM                  = ad cost (incl. tax) ÷ enquiries (or the stated CPM, when the sheet gives one)
// Money is integer cents, as everywhere else.

export const ADS_TAX_RATE = 0.16;
export const ADS_ROAS_RATE = 0.005;
export const ADS_TARGETS = Object.freeze({ cpm: 5000, deposits: 10, submissions: 10 }); // CPM target RM 50

const cents = v => {
  const s = String(v ?? '').replace(/RM/gi, '').replace(/[,\s]/g, '');
  if (s === '' || s === '-' || Number.isNaN(Number(s))) return 0;
  return Math.round(Number(s) * 100);
};
const count = v => { const n = parseInt(String(v ?? '').replace(/[,\s]/g, ''), 10); return Number.isFinite(n) ? n : 0; };

// The Ads sheet's rows → figures. Columns: period, adv_fee_before_tax, customers (or enquiries), total_sales
// (or approved + pending_approval + brought_forward), and optionally deposits, submissions, cpm_stated.
export function readAdsRows(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map(v => String(v ?? '').trim().toLowerCase());
  const at = name => header.indexOf(name);
  if (at('period') === -1 || at('adv_fee_before_tax') === -1) return [];
  const enq = at('enquiries') !== -1 ? at('enquiries') : at('customers');
  const total = at('total_sales');
  const hasFunnel = at('deposits') !== -1 || at('submissions') !== -1;
  return rows.slice(1).filter(r => String(r[at('period')] ?? '').trim()).map(r => adsFigures({
    hasFunnel,
    period: String(r[at('period')]).trim(),
    adFeeBeforeTax: cents(r[at('adv_fee_before_tax')]),
    enquiries: enq === -1 ? 0 : count(r[enq]),
    totalSales: total === -1 ? undefined : cents(r[total]),
    deposits: at('deposits') === -1 ? 0 : count(r[at('deposits')]),
    submissions: at('submissions') === -1 ? 0 : count(r[at('submissions')]),
    pending: cents(r[at('pending_approval')]),
    approved: cents(r[at('approved')]),
    broughtForward: cents(r[at('brought_forward')]),
    cpmStated: at('cpm_stated') === -1 ? null : (String(r[at('cpm_stated')] ?? '').trim() === '' ? null : cents(r[at('cpm_stated')])),
  }));
}

// One period's figures from its inputs (inputs: cents and counts, as read above).
export function adsFigures(i) {
  const tax = Math.round(i.adFeeBeforeTax * ADS_TAX_RATE);
  const adCost = i.adFeeBeforeTax + tax;
  const totalSales = i.totalSales ?? (i.approved + i.pending + i.broughtForward);
  const cpmCalc = i.enquiries ? Math.round(adCost / i.enquiries) : null;
  return {
    hasFunnel: !!i.hasFunnel,
    period: i.period,
    adCost,
    tax,
    enquiries: i.enquiries,
    cpm: i.cpmStated ?? cpmCalc,
    cpmIsStated: i.cpmStated !== null && i.cpmStated !== undefined,
    deposits: i.deposits,
    submissions: i.submissions,
    totalSales,
    roas: adCost ? Math.round((totalSales * ADS_ROAS_RATE / adCost) * 100) / 100 : null,
  };
}
