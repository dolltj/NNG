const { test } = require('node:test');
const assert = require('node:assert');
const { escHtml } = require('../util.js');

test('escapes &, <, >, ", and single quote', () => {
  assert.strictEqual(
    escHtml(`<img src="x" onerror='a&b'>`),
    '&lt;img src=&quot;x&quot; onerror=&#39;a&amp;b&#39;&gt;'
  );
});

test('null/undefined become empty string, numbers are stringified', () => {
  assert.strictEqual(escHtml(null), '');
  assert.strictEqual(escHtml(undefined), '');
  assert.strictEqual(escHtml(42), '42');
});
