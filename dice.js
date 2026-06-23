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
  let substituted = expr.toLowerCase().replace(/[a-z_]+/g, (match) => {
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
 * Build the full attack roll formula string from config and character data.
 * Returns something like "1d20 + 5 + 3" (attack roll + stat mod + proficiency)
 */
function buildAttackFormula(attack, character, config) {
  const statId = attack.attack_stat || 'strength';
  const stat = character.core_stats?.[statId] ?? 10;
  const mod = Math.floor((stat - 10) / 2);
  const profBonus = getProficiencyBonus(character.level || 1, config);
  const profAdd = attack.proficient ? profBonus : 0;

  const parts = [attack.attack_roll || '1d20'];
  if (mod !== 0) parts.push(mod >= 0 ? `+ ${mod}` : `- ${Math.abs(mod)}`);
  if (profAdd !== 0) parts.push(`+ ${profAdd}`);
  return parts.join(' ');
}

/**
 * Build the damage formula string for an attack.
 */
function buildDamageFormula(attack, character, config) {
  const statId = attack.attack_stat || 'strength';
  const stat = character.core_stats?.[statId] ?? 10;
  let mod = Math.floor((stat - 10) / 2);

  // Finesse: use higher of STR/DEX
  if (attack.finesse) {
    const dexMod = Math.floor(((character.core_stats?.dexterity ?? 10) - 10) / 2);
    mod = Math.max(mod, dexMod);
  }

  const base = attack.damage || '1d4';
  if (mod === 0) return base;
  return mod > 0 ? `${base} + ${mod}` : `${base} - ${Math.abs(mod)}`;
}

/**
 * Check if a d20 roll contains a natural 20 or natural 1
 */
function checkCrit(rolls) {
  for (const r of rolls) {
    if (r.faces === 20) {
      if (r.results.includes(20)) return 'crit_hit';
      if (r.results.includes(1))  return 'crit_fail';
    }
  }
  return null;
}

/**
 * Get proficiency bonus from config for a given level.
 */
function getProficiencyBonus(level, config) {
  const table = config?.proficiency_bonus_by_level;
  if (!table) return 2;
  const idx = Math.max(0, Math.min(level - 1, table.length - 1));
  return table[idx];
}

/**
 * Compute ability modifier from raw stat value.
 */
function computeModifier(statValue) {
  return Math.floor((statValue - 10) / 2);
}

/**
 * Format a modifier as a string: "+3", "−1", "+0"
 */
function formatMod(mod) {
  if (mod >= 0) return `+${mod}`;
  return `−${Math.abs(mod)}`;
}
