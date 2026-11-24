// Interface language. English text in the code is the lookup key; zh.js holds the
// Simplified Chinese for each key. A key without a translation falls back to English,
// and test/i18n.test.js fails when that happens.
// {0}, {1}… are placeholders filled from the extra arguments, in any order.

import ZH from './zh.js';

export const DEFAULT_LOCALE = 'zh-CN';
let locale = DEFAULT_LOCALE;

// 'zh…' → Chinese; 'en…' and 'ms' → English; anything else → the default (Chinese).
export function normaliseLocale(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.startsWith('zh')) return 'zh-CN';
  if (v.startsWith('en') || v.startsWith('ms')) return 'en';
  return DEFAULT_LOCALE;
}

export function setLocale(value) {
  locale = normaliseLocale(value);
  if (typeof document !== 'undefined') document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  return locale;
}

export function getLocale() { return locale; }

// Case wording: a business that records departments (转名 / 继承 / 离婚…) calls its records
// cases, not orders. When on, interface text says 案件 / case instead of 订单 / order.
// Only the fixed text is changed, never the values filled into {0}, {1}…
let caseWording = false;
export function setCaseWording(on) { caseWording = !!on; }
export function usesCaseWording() { return caseWording; }
const MATCH_CASE = (word, like) => (like[0] === like[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);
export function toCaseWording(text) {
  return String(text)
    .replace(/[张笔]订单/g, '宗案件').replace(/订单额/g, '案件金额').replace(/订单/g, '案件').replace(/[张笔]销售单/g, '宗案件').replace(/销售单/g, '案件').replace(/ 张已过/g, ' 宗已过')
    .replace(/\b([Oo])rders\b/g, (m, o) => MATCH_CASE('cases', o)).replace(/\b([Oo])rder\b/g, (m, o) => MATCH_CASE('case', o))
    .replace(/\b([Ss])ale(\(s\))?(?![\w(])/g, (m, o, pl) => MATCH_CASE('case', o) + (pl || ''));
}
const words = text => (caseWording ? toCaseWording(text) : text);

// Intl locale for dates and numbers shown to the owner.
export function intlLocale() { return locale === 'zh-CN' ? 'zh-CN' : 'en-MY'; }

function fill(text, args) {
  return args.length ? text.replace(/\{(\d+)\}/g, (m, i) => (args[i] === undefined || args[i] === null ? m : String(args[i]))) : text;
}

// Leading/trailing spaces stay with the call site so text around links keeps its spacing.
function lookup(en) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(en);
  const zh = ZH[m[2]];
  return zh === undefined ? null : (locale === 'zh-CN' ? `${m[1]}${zh}${m[3]}` : null);
}

// Plain text: Chinese only.
export function tr(en, ...args) {
  if (locale !== 'zh-CN') return fill(words(en), args);
  return fill(words(lookup(en) ?? en), args);
}

// Menu items, buttons and named controls: 中文（English）, so the English name in the
// guide and in search results still matches.
export function tl(en, ...args) {
  const english = fill(words(en), args).trim();
  if (locale !== 'zh-CN') return english;
  const zhRaw = lookup(en);
  const zh = zhRaw === null ? null : words(zhRaw);
  if (zh === null) return english;
  // Keep decorations (“+ ”, “ ↗”, “…”, “ ×”) outside the brackets: + 新增待办（Add task）
  const pre = /^(\+\s)/.exec(english)?.[1] || '';
  const post = /(\s?[↗…×])$/.exec(english)?.[1] || '';
  const core = s => s.trim().slice(pre && s.trim().startsWith(pre) ? pre.length : 0).replace(/\s?[↗…×]$/, '').trim();
  return `${pre}${core(fill(zh, args))}（${core(english)}）${post}`;
}

// Joins whole sentences: no space between Chinese sentences.
export function sentences(...parts) {
  const kept = parts.filter(Boolean);
  return locale === 'zh-CN' ? kept.join('') : kept.join(' ');
}

export function hasTranslation(en) { return Object.prototype.hasOwnProperty.call(ZH, String(en).trim()); }
