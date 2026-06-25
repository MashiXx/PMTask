const en = require('../locales/en.json');
const vi = require('../locales/vi.json');

const LOCALES = { en, vi };
const SUPPORTED = ['en', 'vi'];
const LABELS = { en: 'English', vi: 'Tiếng Việt' };

function normalizeLang(lang) {
  return SUPPORTED.includes(lang) ? lang : 'en';
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function t(key, lang, vars) {
  const l = normalizeLang(lang);
  let str = LOCALES[l][key];
  if (str === undefined) str = LOCALES.en[key];
  if (str === undefined) {
    if (process.env.NODE_ENV !== 'production') console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(str, vars);
}

// Only js.* keys, with English fallback, for embedding in the page for client JS.
function clientDict(lang) {
  const l = normalizeLang(lang);
  const out = {};
  for (const k of Object.keys(LOCALES.en)) {
    if (k.startsWith('js.')) out[k] = LOCALES[l][k] !== undefined ? LOCALES[l][k] : LOCALES.en[k];
  }
  return out;
}

module.exports = { t, normalizeLang, clientDict, SUPPORTED, LABELS };
