// Three languages: English (source), Russian and Uzbek (Latin).
// The page is written in English; on start we swap every known string in place,
// before any of the letter-splitting animations run.
import { DICT } from './i18n-dict.js';

export const LANGS = ['en', 'ru', 'uz'];

function pick() {
  const q = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(q)) return q;
  try {
    const saved = localStorage.getItem('silk-lang');
    if (LANGS.includes(saved)) return saved;
  } catch {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return nav === 'ru' ? 'ru' : nav === 'uz' ? 'uz' : 'en';
}

export const LANG = pick();
const col = LANG === 'ru' ? 0 : LANG === 'uz' ? 1 : -1;

export function t(s) {
  if (col < 0 || s == null) return s;
  const hit = DICT[s] || DICT[String(s).trim()];
  return hit ? hit[col] : s;
}

// swap text nodes and a few attributes, keeping the surrounding whitespace
export function translateDOM(root = document.body) {
  document.documentElement.lang = LANG;
  if (col < 0) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE|PRE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue;
    const key = raw.replace(/\s+/g, ' ').trim();
    if (!key || !DICT[key]) continue;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    n.nodeValue = lead + DICT[key][col] + trail;
  }
  for (const el of root.querySelectorAll('[alt], [aria-label], [title]')) {
    for (const a of ['alt', 'aria-label', 'title']) {
      const v = el.getAttribute(a);
      if (v && DICT[v.trim()]) el.setAttribute(a, DICT[v.trim()][col]);
    }
  }
  const ta = root.querySelector('textarea');
  if (ta && DICT[ta.value.trim()]) ta.value = DICT[ta.value.trim()][col];
  document.title = LANG === 'ru' ? 'Шёлковый путь 2.0' : LANG === 'uz' ? 'Ipak yoʻli 2.0' : document.title;
}

// translate fields of plain data objects in place (keeps the English city name for the 3D titles)
export function translateData(list, fields) {
  for (const item of list) {
    if (item.name && !item.nameLatin) item.nameLatin = item.name;
    for (const f of fields) if (item[f] != null) item[f] = t(item[f]);
  }
}

// the EN · RU · UZ switch in the navigation
export function mountSwitcher(where) {
  const box = document.createElement('div');
  box.className = 'm-lang';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', t('Language'));
  box.innerHTML = LANGS.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${l === LANG}">${l.toUpperCase()}</button>`).join('');
  box.addEventListener('click', (e) => {
    const l = e.target.closest('[data-lang]')?.dataset.lang;
    if (!l || l === LANG) return;
    try {
      localStorage.setItem('silk-lang', l);
    } catch {}
    const u = new URL(location.href);
    u.searchParams.set('lang', l);
    location.href = u.toString();
  });
  where.prepend(box);
}
