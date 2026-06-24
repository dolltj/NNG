# Roll Flow & UX Tweaks Design

## Context

Five follow-up changes to the live NNG character sheet, requested after the system rewrite shipped.

## 1. Skip the roll confirmation modal — send directly to Roll20

Roll20 is the source of truth for actual roll results (it rolls the formula independently — see the Roll20 bridge design). The local roll modal showing a (meaningless) locally-computed total is removed. Every roll button calls `Roll20Bridge.sendToRoll20({label, formula, characterName})` directly on click — no local `evaluateDiceExpression` call, no modal. Feedback is whatever `roll20-bridge.js` already shows (success/clipboard-fallback toast).

Removed from `app.js`: `showRollModal`, `renderDiceOverlay`, `closeRollModal`, `onRollOverlayKey`, `ACTIVE_ROLL` state, the call in `renderSheet` that builds the overlay. Removed from `index.html`/`style.css`: the roll-modal markup/styles (`#toast-container` stays — that's the bridge's own UI).

`dice.js`'s `evaluateDiceExpression`/`rollDie`/`parseDiceToken` are untouched (still defined, still tested) — simply no longer called from `app.js`'s roll buttons.

## 2. Clickable HP/Fatigue bars

`.resource-bar-wrap` gets a `click` listener. On click: `pct = clickX / barWidth`, `newValue = Math.round(pct * maxVal)`, clamped `0..maxVal`, written to `res.current`, then the same update path as the existing ±1 buttons (`updateResourceDisplay`, `scheduleSave`). Works identically for HP (derived max) and Fatigue (stored max) since both already compute `maxVal` the same way.

## 3. Skill table header alignment

`.skills-columns` drops its `grid-template-columns: 1fr 1fr` (and the `@media` override) — skills render as one full-width column always. The header row (`skillsHeader`) and each data row (`.skill-row`) are both `display:flex` with the same children in the same order, so once there's only one column, the header's labels land exactly above their data cells with no further CSS changes needed.

## 4. Modifiable Initiative

**Amended:** Initiative rolls `1d10 + AGI + Bonus` — a deliberate exception to the system's usual 2d10 mechanic. AGI is read live from `core_stats.agility` (not snapshotted). A new independent field `char.initiative_bonus` (default `0`) is added as a 4th editable flat-number chip in Combat (alongside Head Armor/Body Armor/Speed, same markup pattern), stacking on top of AGI rather than replacing it. The "Roll Initiative" button computes `agi + bonus`, builds a `1d10 ± N` formula inline (not via the shared `buildTestFormula`, which is hardcoded to `2d10` and used everywhere else — this keeps the one-off die size from leaking into the rest of the system), and sends it to Roll20.

## Amendment: Skills "Origin" → "Bonus"

Per-skill stored field renames from `{origin, rank}` to `{bonus, rank}` throughout (`buildDefaultCharacter`, `buildSkillRow`, `getSkillTotal`). The Skills table header label changes from "Origin" to "Bonus". `Total = Bonus + Rank` — formula unchanged, just relabeled/renamed for clarity. Unrelated to the separate Character-tab `char.origin` (background) field — no naming collision in practice since they live in different parts of the data model, but the rename removes the only place "origin" meant two different things in this codebase.

## Amendment: Core stats scale 0-6

STR/AGI/FOR/WIL move from a 0-20 range to 0-6 (input `min`/`max` and the change-handler clamp in `buildAbilityCard`). `config/nng.json`'s `core_stats[].default` changes from `5` to `3`. This only affects the 4 core stats — Skill Rank stays 0-12, unrelated. HP/Injury Threshold/Recovery Rate formulas are unchanged; they'll simply produce smaller numbers given the narrower stat range, which is the intended effect of the scale change.

## 5. Slot-based Carrying Capacity

`char.equipment` entries drop the `weight` field — Equipment becomes a plain name+description list, reusing `buildTextEntryList` with `secondFieldType: 'text'` (same as Perks/Injuries/Psycasts) instead of `'number'`. Capacity display becomes `${char.equipment.length} / ${deriveCarryingCapacity(char)} slots` (formula unchanged: `10 + STR`, just relabeled from lbs to slots, and "used" is now a count instead of a weight sum).
