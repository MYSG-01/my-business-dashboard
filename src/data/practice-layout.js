// The practice-workbook layout that "My Excel" reads: the B2B training layout plus one
// optional columns on the Sales sheet: "department" (for example 转名, 继承, 离婚) and
// "case_owner" (the person handling that order or case; blank = the customer's owner).
// The training CSVs do not have them; a workbook without them works as before.

import { LAYOUTS } from './layouts.generated.js';

const B2B = LAYOUTS['betterspace-b2b'];
export const EXTRA_SALES_FIELDS = [{ header: 'department', canonical: 'department' }, { header: 'case_owner', canonical: 'owner' }];
export const PRACTICE_LAYOUT = Object.freeze({
  ...B2B,
  tables: B2B.tables.map(t => (t.sheet_name === 'Sales' ? { ...t, fields: [...t.fields, ...EXTRA_SALES_FIELDS] } : t)),
});
