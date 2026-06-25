const test = require('node:test');
const assert = require('node:assert');
const { t, normalizeLang, clientDict } = require('../src/config/i18n');

test('normalizeLang falls back to en for unknown values', () => {
  assert.strictEqual(normalizeLang('xx'), 'en');
  assert.strictEqual(normalizeLang(undefined), 'en');
  assert.strictEqual(normalizeLang('vi'), 'vi');
});

test('t returns the localized string', () => {
  assert.strictEqual(t('common.save', 'en'), 'Save');
  assert.strictEqual(t('common.save', 'vi'), 'Lưu');
});

test('t falls back to English when key missing in target lang', () => {
  // common.enOnly exists only in en.json
  assert.strictEqual(t('common.enOnly', 'vi'), 'English only');
});

test('t returns the key itself when missing everywhere', () => {
  const orig = console.warn; console.warn = () => {};
  assert.strictEqual(t('nope.nope', 'en'), 'nope.nope');
  console.warn = orig;
});

test('t interpolates {vars}', () => {
  assert.strictEqual(t('common.greeting', 'en', { name: 'Sam' }), 'Hello Sam');
});

test('clientDict returns only js.* keys for the lang', () => {
  const d = clientDict('vi');
  assert.ok(Object.keys(d).every((k) => k.startsWith('js.')));
  assert.strictEqual(d['js.confirmDelete'], 'Bạn có chắc muốn xoá {name}?');
});
