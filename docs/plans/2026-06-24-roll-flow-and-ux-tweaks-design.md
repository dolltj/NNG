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

New character field `char.initiative`, defaulted to the character's AGI value at creation time (`buildDefaultCharacter`). Rendered as a 4th editable flat-number chip in Combat (alongside Head Armor/Body Armor/Speed, same markup pattern). The Initiative roll button uses `buildTestFormula(char.initiative)` instead of reading `core_stats.agility` directly.

Note: since the field is seeded from AGI only at character-creation time, changing AGI later does NOT retroactively change `char.initiative` — it's an independent, player-editable value from that point on, consistent with "modifiable."

## 5. Slot-based Carrying Capacity

`char.equipment` entries drop the `weight` field — Equipment becomes a plain name+description list, reusing `buildTextEntryList` with `secondFieldType: 'text'` (same as Perks/Injuries/Psycasts) instead of `'number'`. Capacity display becomes `${char.equipment.length} / ${deriveCarryingCapacity(char)} slots` (formula unchanged: `10 + STR`, just relabeled from lbs to slots, and "used" is now a count instead of a weight sum).
