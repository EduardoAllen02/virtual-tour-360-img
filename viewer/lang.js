// lang.js — Central language state. Dispatches 'langchange' for all modules.
let _lang = 'it';

export function setLang(lang) {
  _lang = lang;
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

export function getLang() { return _lang; }

export function t(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field[_lang] || field['it'] || field['en'] || '';
}
