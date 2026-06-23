# NNG System Rewrite Design

## Context

The sheet currently implements D&D 5e via `config/dnd5e.json` plus matching logic baked into `app.js` and `dice.js` (ability modifiers, proficiency bonus, skill-to-stat ties, spell slots, classes/races/alignments). The group is switching to a homebrew system (working name "NNG", per a pasted design conversation between Trevor and Ricky). This fully replaces D&D 5e — no dual-system support, no data migration for existing (D&D-shaped) localStorage characters.

## System rules (as clarified)

- Core stats: STR, AGI, FOR, WIL. Raw stat value *is* its own modifier (no D&D-style conversion).
- Tests: `2d10 + relevant modifier`. Skill Tests: `2d10 + Skill Total`, where `Total = Origin (free ranks from background) + Rank (0-12, player-assigned)`.
- HP = `50 + (STR + FOR) × level`. Fatigue: 0/100 fixed max. Injury Threshold = `10 + FOR`. Recovery Rate = `10 + (FOR + WIL)`.
- Head Armor / Body Armor: flat, manually-entered numbers.
- Carrying Capacity = `10 + STR`, weight-based (lbs), against summed weight of equipment + weapons.
- Initiative: rollable, `2d10 + AGI`.
- Attacks: `2d10 + <chosen skill>.Total` — player picks which skill applies per weapon at roll time (no fixed attack-skill column on the weapon).
- Damage: flat formula string per weapon (e.g. `2d6`), no stat added.
- No crit/fumble mechanic confirmed yet for 2d10 (deferred — easy to add once confirmed, e.g. doubles detection).
- No damage types, no conditions list, no classes/races/alignments, no proficiency bonus.
- Skills: fixed list of 30 (Acrobatics through Survival, per the pasted list), none tied to a stat.
- Perks: 10 slots + 1 Origin Perk slot, each just name + description text.
- Psycasts: 14 slots, each just name + description text (no cost field, no tiers).
- Injuries / Critical Injuries: open-ended add/remove lists of free text, no fixed slot count.
- Origin: free text field (no fixed list exists yet).
- Level: simple numeric input, no class/XP system.

## Config: `config/nng.json`

Replaces `config/dnd5e.json`. Contains: `core_stats` (STR/AGI/FOR/WIL), `tracked_resources` (HP, Fatigue, Head Armor, Body Armor), `skills` (30 entries, `{id, label}` only, no `stat`), `dice.test: "2d10"`. No `saving_throws`, `classes`, `races`, `alignments`, `proficiency_bonus_by_level`, `damage_types`, `conditions`, `default_attacks`.

## Dice engine (`dice.js`)

- Remove `computeModifier`'s D&D conversion — raw stat value is used directly wherever a modifier is needed.
- Remove `getProficiencyBonus`, `checkCrit` (no crit rule confirmed), and D&D-specific `buildAttackFormula`/`buildDamageFormula`.
- Add a generic test-roll builder: `2d10 + <flat modifier>` where the modifier is either a raw stat value (ability tests, initiative) or a skill's Total (skill tests, attacks).
- `evaluateDiceExpression` (the core parser) is system-agnostic already and is unchanged.
- Roll20 bridge (`roll20-bridge.js`) needs no changes — it already only deals in generic `{formula, label}`, with no D&D-specific logic.

## Tab layout (`app.js` render functions)

| Tab | Contents |
|---|---|
| Character | Name, Origin (text), Level (number), Perks (10 + Origin Perk, name+description each) |
| Abilities | STR/AGI/FOR/WIL inputs, HP/Fatigue resources, Injury Threshold & Recovery Rate (derived, read-only), Skills table (Origin/Rank/Total, rollable), Injuries & Critical Injuries (add/remove text lists) |
| Combat | Head/Body Armor (flat inputs), Speed (flat input), Initiative (rollable, 2d10+AGI), Weapons table (Weapon/Range/Damage/Ammo current-max, attack roll picks a skill) |
| Spells → relabeled "Psycasts" | 14 slots, name+description |
| Equipment | Carrying Capacity (derived, lbs), general gear list (name+weight), running total vs. capacity |
| Notes | Unchanged |

Conditions chip row removed entirely (not part of NNG's spec).

## Unchanged

Roster screen, save/export/import, toast system, Roll20 bridge, overall app shell (`index.html`/`style.css` structure). Only system-specific render/calc logic in `app.js`/`dice.js`/`config/*.json` changes.

## Out of scope / deferred

- Crit/fumble mechanic on 2d10 — not confirmed by the group yet.
- Data migration from D&D-shaped characters — starting fresh by agreement.
- Fixed Origin list — currently free text; can become a dropdown later if the group settles on a list.
