import { h, t, add } from '../dom.js';
import { pageHead, scopeBar, filterBar, tile, trendChart, hbars, statusChip } from '../components.js';
import { rerender } from '../router.js';
import { view, metrics, reportingDate, records, openTasks, label, money, absent, adsPeriods } from '../view-state.js';
import { ADS_TAX_RATE, ADS_ROAS_RATE, ADS_TARGETS } from '../../core/ads.js';
import { formatDate } from '../../core/dates.js';
import { tr, tl, getLocale } from '../../i18n/i18n.js';

export function renderOverview() {
  const m = metrics();
  const rd = reportingDate();
  const root = h('div', {}, pageHead(tl('Overview')), scopeBar(), filterBar());
  const tiles = h('div', { class: 'tiles overview-tiles' });
  const cmp = m.comparison;
  const deltaText = cmp.growth === null
    ? tr('vs {0}–{1}: unavailable (no prior sales)', formatDate(cmp.start), formatDate(cmp.end))
    : tr('{0}{1}% vs {2}–{3} ({4})', cmp.growth >= 0 ? '+' : '', (cmp.growth * 100).toFixed(1), formatDate(cmp.start), formatDate(cmp.end), money(cmp.prior_order_value));
  add(tiles, tile({ label: tr('Order value in period'), value: money(m.period_order_value), hero: true, delta: { text: deltaText, dir: cmp.growth === null ? '' : cmp.growth >= 0 ? 'up' : 'down' }, foot: tr('{0} orders{1} · booked value, not profit', m.period_order_count, m.average_order_value !== null ? tr(' · average {0}', money(m.average_order_value)) : '') }));
  if (!absent('Payments')) {
    add(tiles, tile({ label: tr('Cash collected in period'), value: money(m.period_cash_collected), foot: tr('{0} receipts by payment date', m.period_receipt_count) }));
    add(tiles, tile({ label: tr('Outstanding balance'), value: money(m.outstanding_balance), foot: tr('as of {0}', formatDate(rd)) }));
    add(tiles, tile({ label: tr('Overdue balance'), value: money(m.overdue_balance), foot: tr('{0} sale(s) past due date', m.overdue_payment_count), cls: m.overdue_balance > 0 ? 'alert' : '' }));
  }
  add(tiles, tile({ label: tr('Pending completion'), value: String(m.pending_completion_count), foot: tr('{0} overdue · {1} due today', m.overdue_completion_ids.length, m.due_today_completion_ids.length) }));
  if (!absent('Stock')) add(tiles, tile({ label: tr('Low-stock items'), value: String(m.low_stock_ids.length), foot: tr('{0} with no available units · snapshot {1}', m.out_of_stock_ids.length, m.stock_snapshot_date ? formatDate(m.stock_snapshot_date) : '—') }));
  if ((records().customers || []).some(c => c.next_follow_up_date)) add(tiles, tile({ label: tr('Follow-ups'), value: String(m.overdue_follow_up_ids.length), foot: tr('recorded actions overdue · {0} due today · {1} unassigned prospects', m.follow_up_today_ids.length, m.unassigned_prospect_ids.length) }));
  if (m.negative_balance_count) add(tiles, tile({ label: tr('Data check'), value: String(m.negative_balance_count), foot: tr('sale(s) with receipts exceeding the amount — check the source'), cls: 'alert' }));
  add(root, tiles);
  if (m.by_department.length) add(root, departmentCard(m));
  if (adsPeriods().length) add(root, adsCard(adsPeriods()));

  const grid = h('div', { class: 'grid cols-2' });
  add(grid, h('div', { class: 'card' }, t('h2', tr('Monthly order value')), t('div', tr('Eligible sales by sale date; the current month is partial.'), 'scope'), trendChart(m.trend, rd)));
  const channels = Object.entries(m.by_channel).sort((a, b) => b[1] - a[1]);
  if (channels.length > 1) add(grid, h('div', { class: 'card' }, t('h2', tr('Order value by {0}', label('channel', tr('channel')).toLowerCase())), t('div', tr('Selected period.'), 'scope'), hbars(channels.map(([k, v]) => ({ label: k, value: v })))));
  const next = openTasks().sort((a, b) => (a.action_date || '9999').localeCompare(b.action_date || '9999') || a.title.localeCompare(b.title)).slice(0, 6);
  add(grid, h('div', { class: 'card' }, t('h2', tr('Next actions')), t('div', tr('Open task suggestions by action date.'), 'scope'),
    next.length ? h('ul', { class: 'list' }, ...next.map(x => h('li', {}, h('a', { href: '#tasks' }, x.title), h('div', { class: 'small muted' }, `${x.action_date ? formatDate(x.action_date) : ''}${x.owner ? ' · ' + x.owner : ''} · `, statusChip(x.status))))) : t('p', tr('No open tasks.'), 'muted')));
  add(grid, h('div', { class: 'card' }, t('h2', tr('AI analysis')),
    t('p', tr('Ask Gemini what these numbers mean and what to do first, with your own free key. Its answer is checked against your data.'), 'small ink2'),
    h('a', { href: '#brief' }, tl('Open AI analysis'))));
  add(root, grid);
  return root;
}

// One row per department (the Sales sheet's "department" column). Pressing a department's
// name filters every page to it; the row of the selected department is highlighted.
function departmentCard(m) {
  const f = view.filters;
  const pick = d => { f.department = f.department === d ? '' : d; rerender(); };
  const showPay = !absent('Payments');
  const head = [tr('Department'), tr('Order value in period'), tr('Orders in period'), ...(showPay ? [tr('Cash collected in period'), tr('Outstanding balance'), tr('Overdue balance')] : []), tr('Pending completion')];
  const totalValue = m.by_department.reduce((a, d) => a + d.period_order_value, 0);
  return h('div', { class: 'card dept-card' },
    t('h2', tr('By department')),
    t('div', tr('Order value, orders and cash: selected period. Balances and pending work: as of the reporting date. Press a department to show only its records.'), 'scope'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ...head.map((x, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, x)))),
      h('tbody', {}, ...m.by_department.map(d => h('tr', { class: f.department === d.department ? 'selected' : '' },
        h('td', {}, h('button', { class: 'btn ghost small', 'aria-pressed': String(f.department === d.department), onclick: () => pick(d.department) }, d.department)),
        h('td', { class: 'num' }, money(d.period_order_value), totalValue ? t('span', ` · ${Math.round(d.period_order_value / totalValue * 100)}%`, 'muted small') : null),
        t('td', String(d.period_order_count), 'num'),
        ...(showPay ? [t('td', money(d.period_cash_collected), 'num'), t('td', money(d.outstanding_balance), 'num'), t('td', money(d.overdue_balance), d.overdue_balance > 0 ? 'num alert-text' : 'num')] : []),
        t('td', String(d.pending_count), 'num')))))));
}

// ROAS per advertising period (the Ads sheet). Rates and targets are fixed; the figures are the sheet's.
function adsCard(periods) {
  const pct = n => `${Math.round(n * 1000) / 10}%`;
  const rm = c => money(c);
  const head = [tr('Period'), tr('Ad cost incl. tax'), tr('Enquiries'), 'CPM', tr('Deposits'), tr('Submissions'), tr('Total sales'), 'ROAS'];
  return h('div', { class: 'card ads-card' },
    t('h2', 'ROAS'),
    t('div', tr('ROAS = total sales × {0} ÷ ad cost incl. tax ({1} tax). Targets: CPM RM {2}, deposits {3}, submissions {4}. Total sales = approved + pending approval + brought forward.', pct(ADS_ROAS_RATE), pct(ADS_TAX_RATE), (ADS_TARGETS.cpm / 100).toFixed(0), ADS_TARGETS.deposits, ADS_TARGETS.submissions), 'scope'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ...head.map((x, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, x)))),
      h('tbody', {}, ...periods.map(p => h('tr', {},
        h('td', {}, p.period),
        h('td', { class: 'num' }, rm(p.adCost)),
        h('td', { class: 'num' }, String(p.enquiries)),
        h('td', { class: 'num' }, p.cpm === null ? '—' : rm(p.cpm)),
        h('td', { class: 'num' }, `${p.deposits}/${ADS_TARGETS.deposits}`),
        h('td', { class: 'num' }, `${p.submissions}/${ADS_TARGETS.submissions}`),
        h('td', { class: 'num' }, rm(p.totalSales)),
        h('td', { class: 'num roas' }, p.roas === null ? '—' : p.roas.toFixed(2))))))));
}
