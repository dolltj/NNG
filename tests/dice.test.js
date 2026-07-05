const { test } = require('node:test');
const assert = require('node:assert');
const dice = require('../dice.js');

test('deriveMaxHP: 50 + (STR + FOR) * level', () => {
  const char = { core_stats: { strength: 2, fortitude: 3 }, level: 4 };
  assert.strictEqual(dice.deriveMaxHP(char), 50 + 5 * 4);
});

test('deriveInjuryThreshold: 10 + STR + FOR (NNGRules line 440)', () => {
  assert.strictEqual(dice.deriveInjuryThreshold({ core_stats: { strength: 2, fortitude: 3 } }), 15);
  assert.strictEqual(dice.deriveInjuryThreshold({ core_stats: {} }), 10);
});

test('deriveRecoveryModifier: FOR + WIL (Short Rest heals 1d10 + this)', () => {
  assert.strictEqual(dice.deriveRecoveryModifier({ core_stats: { fortitude: 3, willpower: 1 } }), 4);
  assert.strictEqual(dice.deriveRecoveryModifier({ core_stats: {} }), 0);
});

test('applyPerkModifiers: no perks/modifiers -> base unchanged', () => {
  assert.strictEqual(dice.applyPerkModifiers({}, 'speed', 4), 4);
  assert.strictEqual(dice.applyPerkModifiers({ perks: [{ name: 'X' }] }, 'speed', 4), 4);
});

test('applyPerkModifiers: flat add (Speed Freak +2)', () => {
  const char = { perks: [{ name: 'Speed Freak', modifiers: [{ target: 'speed', type: 'add', value: 2 }] }] };
  assert.strictEqual(dice.applyPerkModifiers(char, 'speed', 4), 6);
  assert.strictEqual(dice.applyPerkModifiers(char, 'initiative', 0), 0, 'other targets untouched');
});

test('applyPerkModifiers: pct rounds up (Tough as Nails +25%)', () => {
  const char = { perks: [{ modifiers: [{ target: 'injury_threshold', type: 'pct', value: 25 }] }] };
  assert.strictEqual(dice.applyPerkModifiers(char, 'injury_threshold', 16), 20);
  assert.strictEqual(dice.applyPerkModifiers(char, 'injury_threshold', 13), 17, 'ceil(16.25)');
});

test('applyPerkModifiers: adds apply before pct', () => {
  const char = { perks: [
    { modifiers: [{ target: 'injury_threshold', type: 'add', value: 3 }] },
    { modifiers: [{ target: 'injury_threshold', type: 'pct', value: 25 }] }
  ] };
  assert.strictEqual(dice.applyPerkModifiers(char, 'injury_threshold', 13), 20, 'ceil((13+3)*1.25)');
});

test('derived stats honor perk modifiers', () => {
  const char = {
    core_stats: { strength: 2, fortitude: 3 },
    perks: [{ modifiers: [{ target: 'injury_threshold', type: 'pct', value: 25 }] }]
  };
  assert.strictEqual(dice.deriveInjuryThreshold(char), Math.ceil(15 * 1.25));
});

test('weaponAttackAbility: melee uses STR, ranged uses AGI', () => {
  const char = { core_stats: { strength: 3, agility: 1 } };
  assert.deepStrictEqual(
    dice.weaponAttackAbility(char, { category: 'Modern Melee Weapon', tags: [] }),
    { stat: 'STR', value: 3, melee: true });
  assert.deepStrictEqual(
    dice.weaponAttackAbility(char, { category: 'Modern Ranged Weapon', tags: [] }),
    { stat: 'AGI', value: 1, melee: false });
});

test('weaponAttackAbility: finesse uses the higher of STR/AGI', () => {
  const agile = { core_stats: { strength: 1, agility: 4 } };
  assert.deepStrictEqual(
    dice.weaponAttackAbility(agile, { category: 'Modern Melee Weapon', tags: ['finesse'] }),
    { stat: 'AGI', value: 4, melee: true });
  const strong = { core_stats: { strength: 4, agility: 1 } };
  assert.deepStrictEqual(
    dice.weaponAttackAbility(strong, { category: 'Modern Melee Weapon', tags: ['finesse'] }),
    { stat: 'STR', value: 4, melee: true });
});

test('weaponAttackAbility: unknown/missing category falls back to ranged/AGI', () => {
  const char = { core_stats: { strength: 3, agility: 2 } };
  assert.deepStrictEqual(
    dice.weaponAttackAbility(char, { tags: [] }),
    { stat: 'AGI', value: 2, melee: false });
});

test('buildTestFormula formats positive/negative/zero modifiers', () => {
  assert.strictEqual(dice.buildTestFormula(3), '2d10 + 3');
  assert.strictEqual(dice.buildTestFormula(-2), '2d10 - 2');
  assert.strictEqual(dice.buildTestFormula(0), '2d10');
});

test('getResourceMax: derived resource uses HP formula', () => {
  const char = { core_stats: { strength: 2, fortitude: 3 }, level: 2, resources: {} };
  assert.strictEqual(dice.getResourceMax({ id: 'hp', derived_max: true }, char), 50 + 5 * 2);
});

test('getResourceMax: non-derived resource reads stored max', () => {
  const char = { resources: { fatigue: { current: 10, max: 100 } } };
  assert.strictEqual(dice.getResourceMax({ id: 'fatigue', derived_max: false }, char), 100);
});

test('getResourceMax: missing resource entry -> null', () => {
  assert.strictEqual(dice.getResourceMax({ id: 'shields', derived_max: false }, { resources: {} }), null);
});
