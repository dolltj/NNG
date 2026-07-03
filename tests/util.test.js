const { test } = require('node:test');
const assert = require('node:assert');
const { escHtml, canEditCharacter, stripCloudMeta } = require('../util.js');

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

test('canEditCharacter: local characters are always editable', () => {
  assert.strictEqual(canEditCharacter({ name: 'A' }, null, {}), true);
  assert.strictEqual(canEditCharacter({ name: 'A' }, 'user-1', {}), true);
});

test('canEditCharacter: cloud characters editable by owner', () => {
  const char = { _cloud: { campaign_id: 'c1', owner_id: 'user-1' } };
  assert.strictEqual(canEditCharacter(char, 'user-1', {}), true);
  assert.strictEqual(canEditCharacter(char, 'user-2', {}), false);
  assert.strictEqual(canEditCharacter(char, null, {}), false);
});

test('canEditCharacter: campaign GM can edit any sheet in their campaign', () => {
  const char = { _cloud: { campaign_id: 'c1', owner_id: 'user-1' } };
  const campaignsById = { c1: { id: 'c1', gm_id: 'gm-9' } };
  assert.strictEqual(canEditCharacter(char, 'gm-9', campaignsById), true);
  assert.strictEqual(canEditCharacter(char, 'gm-9', {}), false);
});

test('stripCloudMeta removes _cloud and nothing else', () => {
  const char = { id: 'x', name: 'A', _cloud: { campaign_id: 'c1', owner_id: 'u1' } };
  assert.deepStrictEqual(stripCloudMeta(char), { id: 'x', name: 'A' });
  assert.deepStrictEqual(stripCloudMeta({ id: 'y' }), { id: 'y' });
});
