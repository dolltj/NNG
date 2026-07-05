// =============================================
// DICE / DERIVED-STAT HELPERS
// Formula builders for Roll20 and NNG derived
// stats. Rolling itself happens in Roll20.
// =============================================

/**
 * NNG derived stats — pure formulas off core_stats + level.
 */

/**
 * Sum a character's perk modifiers for one target stat.
 * Modifier shape: { target, type: 'add'|'pct', value } on perk.modifiers.
 * Flat adds apply to the base first; then each pct increase applies with
 * round-up (NNGRules wording: "increases by 25% (round up)").
 */
function applyPerkModifiers(character, target, base) {
  const mods = [];
  (character.perks || []).forEach(p =>
    (p.modifiers || []).forEach(m => { if (m.target === target) mods.push(m); }));
  let total = base;
  mods.forEach(m => { if (m.type === 'add') total += (m.value || 0); });
  mods.forEach(m => { if (m.type === 'pct') total = Math.ceil(total * (1 + (m.value || 0) / 100)); });
  return total;
}

/** Max HP = 50 + (STR + FOR) * level */
function deriveMaxHP(character) {
  const str  = character.core_stats?.strength  ?? 0;
  const fort = character.core_stats?.fortitude ?? 0;
  const level = character.level || 1;
  return applyPerkModifiers(character, 'max_hp', 50 + (str + fort) * level);
}

/** Injury Threshold = 10 + STR + FOR (NNGRules: "Injury Threshold") */
function deriveInjuryThreshold(character) {
  const str  = character.core_stats?.strength  ?? 0;
  const fort = character.core_stats?.fortitude ?? 0;
  return applyPerkModifiers(character, 'injury_threshold', 10 + str + fort);
}

/** Recovery is a ROLL (1d10 + FOR + WIL, on a Short Rest); this is its
 *  static modifier part. */
function deriveRecoveryModifier(character) {
  const fort = character.core_stats?.fortitude ?? 0;
  const wil  = character.core_stats?.willpower ?? 0;
  return applyPerkModifiers(character, 'recovery', fort + wil);
}

/** Carrying Capacity = 10 + STR */
function deriveCarryingCapacity(character) {
  return applyPerkModifiers(character, 'carrying_capacity', 10 + (character.core_stats?.strength ?? 0));
}

/**
 * A tracked resource's effective max: the derived HP formula for
 * derived_max resources, otherwise the character's stored max
 * (null when the character has no entry / no max set).
 */
function getResourceMax(resDef, character) {
  if (resDef.derived_max) return deriveMaxHP(character);
  return character.resources?.[resDef.id]?.max ?? null;
}

/**
 * Build a "2d10 + modifier" test formula string.
 */
function buildTestFormula(modifier) {
  if (!Number.isFinite(modifier)) throw new TypeError(`buildTestFormula: expected a finite number, got ${modifier}`);
  if (modifier > 0) return `2d10 + ${modifier}`;
  if (modifier < 0) return `2d10 - ${Math.abs(modifier)}`;
  return '2d10';
}

/**
 * Build a test formula with Advantage/Disadvantage applied.
 *
 * Base Test rolls `baseDieCount`d10 and keeps all of them. Each instance
 * of Advantage or Disadvantage adds one extra d10; Advantage keeps the
 * highest `baseDieCount` results, Disadvantage keeps the lowest
 * `baseDieCount` results. Advantage and Disadvantage cancel 1-to-1, so
 * only their net difference matters. Net zero collapses to the plain
 * "baseDieCount d10 + modifier" formula (identical to buildTestFormula
 * for baseDieCount=2).
 */
function buildAdvantageFormula(baseDieCount, modifier, advantage = 0, disadvantage = 0) {
  if (!Number.isFinite(modifier)) throw new TypeError(`buildAdvantageFormula: expected a finite modifier, got ${modifier}`);
  const net = (advantage || 0) - (disadvantage || 0);
  let dicePart;
  if (net === 0) {
    dicePart = `${baseDieCount}d10`;
  } else if (net > 0) {
    dicePart = `${baseDieCount + net}d10kh${baseDieCount}`;
  } else {
    dicePart = `${baseDieCount - net}d10kl${baseDieCount}`;
  }
  if (modifier > 0) return `${dicePart} + ${modifier}`;
  if (modifier < 0) return `${dicePart} - ${Math.abs(modifier)}`;
  return dicePart;
}

// Node export for unit testing; no-op in the browser (no `module` global there).
if (typeof module !== 'undefined') {
  module.exports = {
    applyPerkModifiers, deriveMaxHP, deriveInjuryThreshold, deriveRecoveryModifier,
    deriveCarryingCapacity, getResourceMax,
    buildTestFormula, buildAdvantageFormula
  };
}
