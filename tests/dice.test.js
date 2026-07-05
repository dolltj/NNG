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
