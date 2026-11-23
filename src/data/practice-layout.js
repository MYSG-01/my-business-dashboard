// The practice-workbook layout that "My Excel" reads: the B2B training layout plus one
// optional column on the Sales sheet, "department" (for example 转名, 继承, 离婚). The
// training CSVs do not have it; a workbook without it simply has no department filter.

import { LAYOUTS } from './layouts.generated.js';

const B2B = LAYOUTS['betterspace-b2b'];
export const EXTRA_SALES_FIELDS = [{ header: 'department', canonical: 'department' }];
export const PRACTICE_LAYOUT = Object.freeze({
  ...B2B,
  tables: B2B.tables.map(t => (t.sheet_name === 'Sales' ? { ...t, fields: [...t.fields, ...EXTRA_SALES_FIELDS] } : t)),
});
