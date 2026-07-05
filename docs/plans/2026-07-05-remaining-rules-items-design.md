# Remaining Rules Items: Attack Abilities, Conditions, Major Injuries

## Scope (user, 2026-07-05)

Everything left from the NNGRules gap analysis except armor durability (explicitly deferred): ability modifiers on attack/damage rolls, a conditions tracker, and the Major Injury rename + 0-HP roll.

## Design

### Attack/damage ability modifiers (NNGRules: Making an Attack, Damage Rolls, Finesse)

- `weaponAttackAbility(char, resolved)` in dice.js (pure, TDD): melee weapons (category matches /melee/i) use STR; ranged use AGI; the `finesse` tag uses whichever of STR/AGI is higher (rules give the choice; higher is strictly better). Returns `{ stat: 'STR'|'AGI', value, melee }`.
- Attack rolls: modifier becomes ability + weapon bonus + attachment hit bonus. The action row's meta text shows the ability applied (e.g. "+3 STR") so the number is explainable.
- Damage rolls: melee only, per the rules — formula becomes `<dice> + ability`. Ranged damage stays bare dice.
- Melee-ness is derived from the category string the configs already have; custom weapons with unusual categories fall back to ranged/AGI (visible in the meta text, fixable by category naming).

### Conditions tracker (names from the rules doc; definitions not yet published)

- List lives in `config/nng.json` (`conditions`): Blinded, Exhausted, Flanked, Grappled, Incapacitated, Prone, Restrained, Silenced.
- `char.conditions: []` on the default character (import normalization inherits it). Toggle chips in a Conditions section on the Combat tab; persisted via the normal save path.
- Active conditions echo as badges in the Actions tab's turn-tracker bar (read-only) so they're visible on the play surface.

### Major Injuries (NNGRules: Dropping to 0 Hit Points)

- UI rename only: "Critical Injuries" → "Major Injuries" everywhere visible; the stored key stays `critical_injuries` (no data migration).
- "💀 Roll Major Injury" button beside the section header: sends `1d10 + <current Major Injury count>` to Roll20. The Major Injury table itself isn't in the rules text yet — the roll is sent, the result is read off the GM's table.

## Testing

TDD on `weaponAttackAbility` (melee/STR, ranged/AGI, finesse-best, category fallback). Headless boot; live click-through of an attack with each weapon type.
