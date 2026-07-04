const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

// Minimal localStorage stub so the browser module loads in Node.
const _store = new Map();
global.localStorage = {
  getItem: k => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: k => _store.delete(k)
};
const WeaponStore = require('../weapon-store.js');

const BASE = {
  weapons: [{ id: 'pistol', label: 'Pistol' }, { id: 'rifle', label: 'Rifle' }],
  attachments: [{ id: 'scope', label: 'Scope' }]
};

beforeEach(() => _store.clear());

test('markDeleted hides official items from the default merge', () => {
  WeaponStore.markDeleted('weapons', 'pistol');
  const merged = WeaponStore.getMergedConfig(BASE);
  assert.deepStrictEqual(merged.weapons.map(w => w.id), ['rifle']);
  assert.deepStrictEqual(merged.attachments.map(a => a.id), ['scope']);
});

test('includeDeleted marks items _deleted instead of hiding them', () => {
  WeaponStore.markDeleted('weapons', 'pistol');
  const merged = WeaponStore.getMergedConfig(BASE, { includeDeleted: true });
  assert.strictEqual(merged.weapons.find(w => w.id === 'pistol')._deleted, true);
  assert.strictEqual(merged.weapons.find(w => w.id === 'rifle')._deleted, undefined);
});

test('perk tombstones filter the perk merge', () => {
  WeaponStore.markDeleted('perks', 'p1');
  const perks = WeaponStore.getPerksMergedConfig([{ id: 'p1' }, { id: 'p2' }]);
  assert.deepStrictEqual(perks.map(p => p.id), ['p2']);
});

test('restoreDeleted brings an item back; marking twice does not duplicate', () => {
  WeaponStore.markDeleted('perks', 'p1');
  WeaponStore.markDeleted('perks', 'p1');
  assert.deepStrictEqual(WeaponStore.getDeletedIds('perks'), ['p1']);
  WeaponStore.restoreDeleted('perks', 'p1');
  assert.deepStrictEqual(WeaponStore.getDeletedIds('perks'), []);
  const perks = WeaponStore.getPerksMergedConfig([{ id: 'p1', name: 'P' }]);
  assert.deepStrictEqual(perks.map(p => p.id), ['p1']);
});

test('clearAllCustom clears tombstones too', () => {
  WeaponStore.markDeleted('weapons', 'pistol');
  WeaponStore.clearAllCustom();
  assert.deepStrictEqual(WeaponStore.getDeletedIds('weapons'), []);
});

test('deleting an overridden item (override dropped + tombstone) removes it entirely', () => {
  WeaponStore.saveCustomWeapon({ id: 'pistol', label: 'Pistol+' });
  WeaponStore.deleteCustomWeapon('pistol');
  WeaponStore.markDeleted('weapons', 'pistol');
  const merged = WeaponStore.getMergedConfig(BASE);
  assert.deepStrictEqual(merged.weapons.map(w => w.id), ['rifle']);
});
