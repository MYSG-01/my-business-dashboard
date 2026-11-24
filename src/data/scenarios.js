// The one business the dashboard shows: the viewer's own Excel workbook ("My Excel",
// workbook.js). There is no built-in data: until a workbook is opened, every data page
// shows the page for opening one. (The BetterSpace files in data/ are test material and
// downloadable practice workbooks, not part of the dashboard.)
//
// One snapshot: the workbook as last read. When an updated workbook is read again, task
// decisions carry over by their stable keys (rule:record_id).

import { MY_EXCEL, DIVORCE, INHERITANCE, emptyWorkbookProfile } from './workbook.js';
import { setCaseWording } from '../i18n/i18n.js';

export { MY_EXCEL, DIVORCE, INHERITANCE };
export const DAYS = ['day1'];
export const dayNumber = () => 1;

// Three businesses, each with its own Excel file: the transfers (MY_EXCEL), the divorce cases (DIVORCE) and the inheritance cases (INHERITANCE).
// Their decisions, notes and AI analyses are kept apart. Only the active one is shown.
const BUSINESS_IDS = [MY_EXCEL, DIVORCE, INHERITANCE];
export function allBusinessIds() { return [...BUSINESS_IDS]; }
export function hasBusiness(id) { return BUSINESS_IDS.includes(id); }

const workbooks = new Map();
let active = MY_EXCEL;
const hasDepartments = s => (s?.records?.sales || []).some(x => x.department);

export function activeBusinessId() { return active; }
export function setActiveBusiness(id) {
  if (!hasBusiness(id)) return;
  active = id;
  setCaseWording(hasDepartments(workbooks.get(active)));
}

export function setWorkbookScenario(scenario, id = active) {
  if (scenario) workbooks.set(id, scenario); else workbooks.delete(id);
  if (id === active) setCaseWording(hasDepartments(scenario));
}
export function workbookLoaded(id = active) { return workbooks.has(id); }

export function businessProfile(id = active) { return workbooks.get(id)?.profile || emptyWorkbookProfile(); }
export function dayMetadata(id = active) { return workbooks.get(id)?.metadata || { as_of_date: null }; }

// The open workbook of the active business as a scenario, or null while none is open.
export function loadScenario(id = active) { return workbooks.get(id) || null; }
