const { test } = require('node:test');
const assert = require('node:assert');
const dice = require('../dice.js');

test('deriveMaxHP: 50 + (STR + FOR) * level', () => {
  const char = { core_stats: { strength: 2, fortitude: 3 }, level: 4 };
  assert.strictEqual(dice.deriveMaxHP(char), 50 + 5 * 4);
});

test('buildTestFormula formats positive/negative/zero modifiers', () => {
  assert.strictEqual(dice.buildTestFormula(3), '2d10 + 3');
  assert.strictEqual(dice.buildTestFormula(-2), '2d10 - 2');
  assert.strictEqual(dice.buildTestFormula(0), '2d10');
});
