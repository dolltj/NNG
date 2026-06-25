// =============================================
// DICE ROLLER ENGINE
// Parses and evaluates roll notation like:
//   "1d20", "2d6 + 3", "1d8 + strength_mod"
// =============================================

/**
 * Roll a single die of N faces, return integer 1..N
 */
function rollDie(faces) {
  return Math.floor(Math.random() * faces) + 1;
}

/**
 * Parse a dice notation token like "2d8" => { count:2, faces:8 }
 * or "5" => { count:1, faces:0, flat:5 }
 */
function parseDiceToken(token) {
  token = token.trim().replace(/\s+/g, '');
  const diceMatch = token.match(/^(\d+)?d(\d+)$/i);
  if (diceMatch) {
    return {
      count: parseInt(diceMatch[1] || '1'),
      faces: parseInt(diceMatch[2]),
      flat: null
    };
  }
  const flat = parseInt(token, 10);
  return { count: 0, faces: 0, flat: isNaN(flat) ? 0 : flat };
}

/**
 * Evaluate a full dice expression string.
 * Variable substitution: pass `vars` object like { strength_mod: 3 }
 * Returns: { total, rolls: [{label, results, subtotal}], formula, breakdown }
 */
function evaluateDiceExpression(expr, vars = {}) {
  // Substitute named variables
  let substituted = expr.toLowerCase().replace(/[a-z_][a-z_0-9]*|\d+d\d+|\bd\d+\b/g, (match) => {
    if (/^\d*d\d+$/.test(match)) return match; // dice notation (e.g. "2d10", "d20") — leave untouched
    if (match in vars) {
      const v = parseInt(vars[match]);
      return isNaN(v) ? '0' : String(v);
    }
    return '0';
  });

  // Tokenize: split on + and - keeping the operator
  const tokens = substituted.split(/(?=[+-])/);
  let total = 0;
  const rolls = [];
  let breakdownParts = [];

  for (let raw of tokens) {
    raw = raw.trim();
    if (!raw) continue;

    let sign = 1;
    if (raw.startsWith('-')) { sign = -1; raw = raw.slice(1).trim(); }
    else if (raw.startsWith('+')) { raw = raw.slice(1).trim(); }

    const parsed = parseDiceToken(raw);

    if (parsed.faces > 0) {
      // It's a dice roll
      const results = [];
      for (let i = 0; i < parsed.count; i++) {
        results.push(rollDie(parsed.faces));
      }
      const subtotal = results.reduce((a, b) => a + b, 0) * sign;
      total += subtotal;
      rolls.push({
        label: `${sign < 0 ? '-' : ''}${parsed.count}d${parsed.faces}`,
        results,
        subtotal,
        faces: parsed.faces
      });
      const diceStr = results.join(', ');
      breakdownParts.push(`${sign < 0 ? '−' : ''}(${diceStr})`);
    } else if (parsed.flat !== null && parsed.flat !== 0) {
      const flatVal = parsed.flat * sign;
      total += flatVal;
      rolls.push({ label: `${flatVal >= 0 ? '+' : ''}${flatVal}`, results: [], subtotal: flatVal, faces: 0 });
      breakdownParts.push(`${flatVal >= 0 ? '+' : ''}${flatVal}`);
    }
  }

  return {
    total,
    rolls,
    formula: expr,
    substitutedFormula: substituted,
    breakdown: breakdownParts.join(' ') || String(total)
  };
}

/**
 * NNG derived stats — pure formulas off core_stats + level.
 */

/** Max HP = 50 + (STR + FOR) * level */
function deriveMaxHP(character) {
  const str  = character.core_stats?.strength  ?? 0;
  const fort = character.core_stats?.fortitude ?? 0;
  const level = character.level || 1;
  return 50 + (str + fort) * level;
}

/** Injury Threshold = 10 + FOR */
function deriveInjuryThreshold(character) {
  return 10 + (character.core_stats?.fortitude ?? 0);
}

/** Recovery Rate = 10 + (FOR + WIL) */
function deriveRecoveryRate(character) {
  const fort = character.core_stats?.fortitude ?? 0;
  const wil  = character.core_stats?.willpower ?? 0;
  return 10 + (fort + wil);
}

/** Carrying Capacity = 10 + STR */
function deriveCarryingCapacity(character) {
  return 10 + (character.core_stats?.strength ?? 0);
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
 * Format a modifier as a string: "+3", "−1", "+0"
 */
function formatMod(mod) {
  if (mod >= 0) return `+${mod}`;
  return `−${Math.abs(mod)}`;
}

// Node export for unit testing; no-op in the browser (no `module` global there).
if (typeof module !== 'undefined') {
  module.exports = {
    rollDie, parseDiceToken, evaluateDiceExpression,
    deriveMaxHP, deriveInjuryThreshold, deriveRecoveryRate,
    deriveCarryingCapacity, buildTestFormula, buildAdvantageFormula, formatMod
  };
}
