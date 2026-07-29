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

test('evaluateFormula: plain 2d10 + modifier — structure and range', () => {
  const r = dice.evaluateFormula('2d10 + 5');
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.modifier, 5);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] + 5);
  assert.ok(r.kept.every(v => v >= 1 && v <= 10), 'all d10 values in [1,10]');
});

test('evaluateFormula: negative modifier', () => {
  const r = dice.evaluateFormula('2d10 - 3');
  assert.strictEqual(r.modifier, -3);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] - 3);
});

test('evaluateFormula: no modifier', () => {
  const r = dice.evaluateFormula('2d10');
  assert.strictEqual(r.modifier, 0);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1]);
});

test('evaluateFormula: advantage (4d10kh2) keeps 2 highest', () => {
  const r = dice.evaluateFormula('4d10kh2');
  assert.strictEqual(r.dice.length, 4);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 2);
  const allSorted = [...r.dice].sort((a, b) => a - b);
  assert.deepStrictEqual(
    [...r.kept].sort((a, b) => a - b),
    allSorted.slice(-2),
    'kept should be the 2 highest values'
  );
});

test('evaluateFormula: disadvantage (4d10kl2) keeps 2 lowest', () => {
  const r = dice.evaluateFormula('4d10kl2');
  assert.strictEqual(r.dice.length, 4);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 2);
  const allSorted = [...r.dice].sort((a, b) => a - b);
  assert.deepStrictEqual(
    [...r.kept].sort((a, b) => a - b),
    allSorted.slice(0, 2),
    'kept should be the 2 lowest values'
  );
});

test('evaluateFormula: isDoubles true when kept dice all equal', () => {
  const origRandom = Math.random;
  Math.random = () => 0;  // Math.floor(0 * 10) + 1 = 1; all dice = 1
  const r = dice.evaluateFormula('2d10');
  Math.random = origRandom;
  assert.strictEqual(r.isDoubles, true);
  assert.deepStrictEqual(r.kept, [1, 1]);
});

test('evaluateFormula: isDoubles false when kept dice differ', () => {
  let call = 0;
  const origRandom = Math.random;
  Math.random = () => call++ === 0 ? 0.2 : 0.8;  // 3 and 9
  const r = dice.evaluateFormula('2d10');
  Math.random = origRandom;
  assert.strictEqual(r.isDoubles, false);
});

test('evaluateFormula: 1d10 — isDoubles false (only 1 kept die)', () => {
  const r = dice.evaluateFormula('1d10');
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.isDoubles, false);
});

test('evaluateFormula: weapon damage 2d6 + 4', () => {
  const r = dice.evaluateFormula('2d6 + 4');
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.modifier, 4);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] + 4);
  assert.ok(r.kept.every(v => v >= 1 && v <= 6));
});

test('evaluateFormula: 1d1 announcement formula', () => {
  const r = dice.evaluateFormula('1d1');
  assert.deepStrictEqual(r.kept, [1]);
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.isDoubles, false);
});
