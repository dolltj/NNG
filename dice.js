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
 * Which ability powers an attack with this resolved weapon (NNGRules):
 * melee weapons use STR, ranged use AGI, and the finesse keyword uses
 * whichever of the two is higher (the rules give the choice; higher is
 * strictly better). Melee-ness is derived from the weapon's category
 * string; unknown categories fall back to ranged/AGI.
 * Returns { stat: 'STR'|'AGI', value, melee }.
 */
function weaponAttackAbility(character, resolvedWeapon) {
  const cs = character.core_stats || {};
  const str = cs.strength ?? 0;
  const agi = cs.agility ?? 0;
  const melee = /melee/i.test(resolvedWeapon.category || '');
  if ((resolvedWeapon.tags || []).includes('finesse')) {
    return str >= agi ? { stat: 'STR', value: str, melee } : { stat: 'AGI', value: agi, melee };
  }
  return melee ? { stat: 'STR', value: str, melee: true } : { stat: 'AGI', value: agi, melee: false };
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

/**
 * Evaluate a dice formula string client-side.
 * Handles: XdY, XdYkhZ, XdYklZ, optional +/- N modifier.
 * Returns { dice, kept, dropped, modifier, total, isDoubles }.
 * isDoubles: true when kept.length >= 2 and all kept values are equal.
 */
function evaluateFormula(formula) {
  const m = String(formula).trim().match(
    /^(\d+)d(\d+)(?:k([hl])(\d+))?(?:\s*([+-])\s*(\d+))?$/i
  );
  if (!m) return { dice: [], kept: [], dropped: [], modifier: 0, total: 0, isDoubles: false };

  const count    = parseInt(m[1], 10);
  const sides    = parseInt(m[2], 10);
  const keepDir  = m[3] ? m[3].toLowerCase() : null;  // 'h', 'l', or null
  const keepN    = m[4] ? parseInt(m[4], 10) : count;
  const modifier = m[6] ? (m[5] === '-' ? -1 : 1) * parseInt(m[6], 10) : 0;

  const dice = [];
  for (let i = 0; i < count; i++) dice.push(Math.floor(Math.random() * sides) + 1);

  let kept, dropped;
  if (!keepDir) {
    kept    = dice.slice();
    dropped = [];
  } else {
    const sorted = dice.slice().sort((a, b) => a - b);
    if (keepDir === 'h') {
      kept    = sorted.slice(count - keepN);
      dropped = sorted.slice(0, count - keepN);
    } else {
      kept    = sorted.slice(0, keepN);
      dropped = sorted.slice(keepN);
    }
  }

  const total     = kept.reduce((s, v) => s + v, 0) + modifier;
  const isDoubles = kept.length >= 2 && kept.every(function(v) { return v === kept[0]; });

  return { dice: dice, kept: kept, dropped: dropped, modifier: modifier, total: total, isDoubles: isDoubles };
}

// Node export for unit testing; no-op in the browser (no `module` global there).
if (typeof module !== 'undefined') {
  module.exports = {
    applyPerkModifiers, deriveMaxHP, deriveInjuryThreshold, deriveRecoveryModifier,
    deriveCarryingCapacity, getResourceMax, weaponAttackAbility,
    buildTestFormula, buildAdvantageFormula, evaluateFormula
  };
}
