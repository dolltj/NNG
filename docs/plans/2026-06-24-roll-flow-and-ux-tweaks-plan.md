# Roll Flow & UX Tweaks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the local roll confirmation modal (send straight to Roll20), make HP/Fatigue bars clickable, fix skill-table header alignment, make Initiative an editable rolled stat, and switch Carrying Capacity from weight to slot-count.

**Architecture:** All changes are within the existing vanilla-JS, no-build-step `app.js`/`style.css`/`dice.js` files. No new files, no new dependencies. Verification continues this project's established pattern: throwaway Node scripts (with a hand-rolled DOM shim where DOM behavior matters) written, run, and deleted per task — no permanent test framework, by design.

**Tech Stack:** Vanilla JS, CSS.

**Reference design:** `docs/plans/2026-06-24-roll-flow-and-ux-tweaks-design.md`

---

### Task 1: Remove the roll confirmation modal — send rolls directly to Roll20

**Files:**
- Modify: `app.js` (state at top, `renderSheet`, `buildAbilityCard`, `buildSkillRow`, `renderAttacksTable`, delete the whole `DICE ROLL MODAL` section)
- Modify: `style.css` (delete the `DICE ROLL OVERLAY` block and its one responsive-media reference)

**Step 1: Remove `ACTIVE_ROLL` state**

In `app.js`, delete this line (currently line 14):
```js
let ACTIVE_ROLL  = null;   // current roll result for the overlay
```

**Step 2: Remove the `renderDiceOverlay()` call from `renderSheet`**

In `app.js`, find (currently around line 205, inside `renderSheet`):
```js
  renderDiceOverlay();
```
Delete that line. The rest of `renderSheet` is unchanged.

**Step 3: Change the ability-test roll button to send directly**

In `buildAbilityCard` (currently lines 516-521), replace:
```js
  card.querySelector('.ability-roll-btn').addEventListener('click', () => {
    const curVal = getChar().core_stats[statDef.id] ?? 0;
    const formula = buildTestFormula(curVal);
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: `${statDef.label} Test`, type: 'ability', formula, ...result });
  });
```
with:
```js
  card.querySelector('.ability-roll-btn').addEventListener('click', () => {
    const curVal = getChar().core_stats[statDef.id] ?? 0;
    const formula = buildTestFormula(curVal);
    window.Roll20Bridge.sendToRoll20({ label: `${statDef.label} Test`, formula, characterName: getChar()?.name || 'Character' });
  });
```

**Step 4: Change the skill roll button to send directly**

In `buildSkillRow` (currently lines 553-559), replace:
```js
  row.querySelector('[data-roll-skill]').addEventListener('click', () => {
    const s = getChar().skills[skillDef.id];
    const total2 = (s.origin || 0) + (s.rank || 0);
    const formula = buildTestFormula(total2);
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: skillDef.label, type: 'skill', formula, ...result });
  });
```
with:
```js
  row.querySelector('[data-roll-skill]').addEventListener('click', () => {
    const s = getChar().skills[skillDef.id];
    const total2 = (s.origin || 0) + (s.rank || 0);
    const formula = buildTestFormula(total2);
    window.Roll20Bridge.sendToRoll20({ label: skillDef.label, formula, characterName: getChar()?.name || 'Character' });
  });
```

**Step 5: Change the weapon attack/damage roll buttons to send directly**

In `renderAttacksTable`, replace (currently lines 721-731):
```js
    tr.querySelector('.attack-roll-btn').addEventListener('click', () => {
      const total = getSkillTotal(weapon.skill_id, getChar());
      const formula = buildTestFormula(total);
      const result  = evaluateDiceExpression(formula);
      showRollModal({ label: `${weapon.label} — Attack`, type: 'attack', formula, ...result });
    });

    tr.querySelector('.damage-roll-btn').addEventListener('click', () => {
      const result = evaluateDiceExpression(weapon.damage);
      showRollModal({ label: `${weapon.label} — Damage`, type: 'damage', formula: weapon.damage, ...result });
    });
```
with:
```js
    tr.querySelector('.attack-roll-btn').addEventListener('click', () => {
      const total = getSkillTotal(weapon.skill_id, getChar());
      const formula = buildTestFormula(total);
      window.Roll20Bridge.sendToRoll20({ label: `${weapon.label} — Attack`, formula, characterName: getChar()?.name || 'Character' });
    });

    tr.querySelector('.damage-roll-btn').addEventListener('click', () => {
      window.Roll20Bridge.sendToRoll20({ label: `${weapon.label} — Damage`, formula: weapon.damage, characterName: getChar()?.name || 'Character' });
    });
```

**Step 6: Delete the entire `DICE ROLL MODAL` section**

In `app.js`, delete the whole block from the `// DICE ROLL MODAL` comment through the end of `onRollOverlayKey` (currently lines 816-893) — this removes `renderDiceOverlay`, `showRollModal`, `closeRollModal`, and `onRollOverlayKey` entirely. Nothing calls any of these anymore after Steps 2-5.

**Step 7: Remove the dead CSS**

In `style.css`, delete the entire `DICE ROLL OVERLAY` block — from the `/* DICE ROLL OVERLAY */` comment through the end of the `.roll-send-btn:hover` rule (currently lines 1085-1223), right before the `TOAST NOTIFICATIONS` comment.

Then find and delete this line from the responsive media query block (currently around line 1395):
```css
  .roll-modal { min-width: 280px; padding: var(--space-lg); }
```
Leave the rest of that `@media (max-width: 768px)` block untouched.

**Step 8: Verify**

Run: `node --check app.js` — expect no syntax errors.

Write a throwaway Node script that requires `dice.js` and confirms `buildTestFormula`/`evaluateDiceExpression` are still exported and functional (they're untouched — this just confirms you didn't accidentally break `dice.js` while editing `app.js`). Then grep `app.js` for `ACTIVE_ROLL`, `showRollModal`, `renderDiceOverlay`, `closeRollModal`, `onRollOverlayKey`, `roll-overlay` — expect zero matches. Grep `style.css` for `roll-overlay`, `roll-modal`, `roll-send-btn`, `roll-close-btn`, `die-result` — expect zero matches (note: `.die-result` CSS was only ever used by the now-deleted modal's dice-chip display, so it's correctly removed as part of this same block, not a separate concern).

Also confirm (by reading the code, not guessing) that `window.Roll20Bridge.sendToRoll20` is the correct global — it's set in `roll20-bridge.js` via `window.Roll20Bridge = { sendToRoll20, showRollToast, isAvailable }`, and `roll20-bridge.js` loads before `app.js` in `index.html`, so it's available by the time any button click fires.

**Step 9: Commit**

```bash
git add app.js style.css
git commit -m "feat: send rolls directly to Roll20, remove local confirmation modal"
```

---

### Task 2: Clickable HP/Fatigue bars

**Files:**
- Modify: `app.js` (`buildResourceCard`)

**Step 1: Add a click handler to the resource bar**

In `buildResourceCard` (currently lines 388-444), the bar markup is currently built as a string:
```js
  const barHtml = resDef.show_bar
    ? `<div class="resource-bar-wrap"><div class="resource-bar-fill" id="res-bar-${resDef.id}"
         style="background:${resDef.color}; width:${calcBarPct(res.current, maxVal)}%"></div></div>`
    : '';
```
Leave that line as-is, but after the existing `card.querySelectorAll('.resource-btn')...` block (right after it, before the `const valDisplay = ...` line), add:
```js
  const barWrap = card.querySelector('.resource-bar-wrap');
  if (barWrap) {
    barWrap.addEventListener('click', e => {
      const rect = barWrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const char = getChar();
      const res2 = char.resources[resDef.id];
      const maxVal2 = resDef.derived_max ? deriveMaxHP(char) : res2.max;
      const newVal = Math.round(pct * (maxVal2 || 0));
      res2.current = Math.max(0, Math.min(maxVal2 ?? newVal, newVal));
      const display = document.getElementById(`res-val-${resDef.id}`);
      if (display) display.textContent = res2.current;
      updateResourceDisplay(resDef.id, resDef);
      scheduleSave();
    });
  }
```

This only does anything when `resDef.show_bar` is true (HP and Fatigue both have `show_bar: true` in `config/nng.json`; for any resource without a bar, `card.querySelector('.resource-bar-wrap')` returns `null` and the `if` skips it).

**Step 2: Verify**

There's no real browser available. Build a throwaway hand-rolled DOM shim (same pattern used throughout this project's prior work — minimal `Element`/`document` stand-ins sufficient for `querySelector`, `getBoundingClientRect`, `addEventListener`/dispatching a synthetic click with `clientX`) loading the real `app.js`/`dice.js`, render a character's Abilities tab, and:
- Dispatch a click on the HP bar at `clientX` = 25% of the bar's width (mock `getBoundingClientRect()` to return a known `left`/`width`, e.g. `{left: 0, width: 100}`). Confirm `char.resources.hp.current` becomes `Math.round(0.25 * deriveMaxHP(char))`.
- Dispatch a click at `clientX` beyond the bar's right edge (e.g. `clientX: 150` against `width: 100`) — confirm it clamps to `maxVal`, not something larger.
- Dispatch a click at a negative `clientX` relative to `left` — confirm it clamps to `0`.
- Confirm the Fatigue bar (stored `max`, not derived) responds the same way using its own `max`.
- Confirm `scheduleSave` is called (you can stub it and check it was invoked, or check `localStorage` after flushing the debounce).

Delete the throwaway script when done.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: make HP/Fatigue bars clickable to set value directly"
```

---

### Task 3: Fix skill table header alignment

**Files:**
- Modify: `style.css` (`.skills-columns`)

**Step 1: Drop the two-column layout**

In `style.css`, find (currently lines 819-827):
```css
.skills-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-sm);
}

@media (max-width: 600px) {
  .skills-columns { grid-template-columns: 1fr; }
}
```
Replace with:
```css
.skills-columns {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
```

This makes skills render as one full-width column always. Since the header row (`skillsHeader`, built in `renderTabAbilities`) and each data row (`.skill-row`, built in `buildSkillRow`) are both `display:flex` with identical child structure/order (roll button, name, origin input, rank input, total), removing the 2-column split means the header's 5 children now sit directly above the same 5 columns in every data row beneath it — no other CSS change is needed for the alignment itself.

**Step 2: Verify**

No browser available. This is a pure CSS layout change with no JS logic to test — verify by reading the rule and confirming `.skill-row`'s children (`app.js` `buildSkillRow`, currently lines 526-562) and the header's children (`app.js` `renderTabAbilities`, currently line 353: `` `<span></span><span>Skill</span><span>Origin</span><span>Rank</span><span>Total</span>` ``) are structurally identical in count and order — 5 children each, same semantic order (button/icon, name, origin, rank, total) — which they are; confirm this by reading both, don't just assume.

**Step 3: Commit**

```bash
git add style.css
git commit -m "fix: align skill table header with single-column skill rows"
```

---

### Task 4: Modifiable Initiative

**Files:**
- Modify: `app.js` (`buildDefaultCharacter`, `buildCombatStatsRow`)

**Step 1: Add `initiative` to the default character shape**

In `buildDefaultCharacter` (currently lines 89-120), the returned object currently has:
```js
    armor: { head: 0, body: 0 },
    speed: 30,
```
Change to:
```js
    armor: { head: 0, body: 0 },
    speed: 30,
    initiative: stats.agility ?? 0,
```
(`stats` is the locally-built `core_stats` object already computed earlier in this same function — `stats.agility` is its AGI default from config. This seeds Initiative from AGI only at character-creation time; it's independently editable from then on, per the design.)

**Step 2: Replace the Initiative chip in `buildCombatStatsRow`**

In `buildCombatStatsRow` (currently lines 646-688), replace the whole function body with:
```js
function buildCombatStatsRow(char) {
  const wrap = document.getElementById('combat-stats-row');
  wrap.innerHTML = '';

  const chips = [
    { label: 'Head Armor', value: char.armor.head, field: 'head' },
    { label: 'Body Armor', value: char.armor.body, field: 'body' },
    { label: 'Speed',      value: char.speed,       field: 'speed' },
    { label: 'Initiative', value: char.initiative,  field: 'initiative' }
  ];

  chips.forEach(chip => {
    const el = document.createElement('div');
    el.className = 'combat-stat-chip';
    el.innerHTML = `
      <span class="combat-stat-chip-label">${chip.label}</span>
      <span class="combat-stat-chip-value">
        <input type="number" value="${chip.value}" data-combat-field="${chip.field}" style="width:48px">
      </span>`;
    el.querySelector('input').addEventListener('change', e => {
      const v = parseInt(e.target.value) || 0;
      if (chip.field === 'speed') getChar().speed = v;
      else if (chip.field === 'initiative') getChar().initiative = v;
      else getChar().armor[chip.field] = v;
      scheduleSave();
    });
    wrap.appendChild(el);
  });

  const initRollEl = document.createElement('div');
  initRollEl.className = 'combat-stat-chip';
  initRollEl.innerHTML = `
    <span class="combat-stat-chip-label">Roll Initiative</span>
    <span class="combat-stat-chip-value">
      <button class="ability-roll-btn" id="roll-initiative-btn">🎲 Roll</button>
    </span>`;
  wrap.appendChild(initRollEl);

  document.getElementById('roll-initiative-btn').addEventListener('click', () => {
    const formula = buildTestFormula(getChar().initiative ?? 0);
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula, characterName: getChar()?.name || 'Character' });
  });
}
```

This adds Initiative as a 4th editable flat-number chip (same pattern as Head/Body Armor/Speed) and keeps a separate "Roll Initiative" button/chip that rolls `2d10 + char.initiative` and sends it directly to Roll20 (no local modal, consistent with Task 1).

**Step 3: Verify**

Build a throwaway DOM-shim script (same pattern as Task 2) that:
- Creates a default character via `buildDefaultCharacter`, confirms `char.initiative === char.core_stats.agility` at creation.
- Renders the Combat tab, confirms 4 editable chips exist (Head Armor, Body Armor, Speed, Initiative) plus the separate "Roll Initiative" button chip.
- Dispatches a `change` event on the Initiative input with a new value (e.g. `7`), confirms `char.initiative` updates to `7` and `char.core_stats.agility` is unaffected (independent field, not retroactively linked).
- Stubs `window.Roll20Bridge.sendToRoll20` and clicks "Roll Initiative", confirms it was called with `formula: buildTestFormula(7)` (i.e. `"2d10 + 7"`) and the correct character name — not reading `core_stats.agility` anymore.

Delete the script when done.

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: make Initiative an editable, independently rollable stat"
```

---

### Task 5: Slot-based Carrying Capacity

**Files:**
- Modify: `app.js` (`renderTabEquipment`)

**Step 1: Replace weight tracking with slot counting**

Replace the whole `renderTabEquipment` function (currently lines 774-799) with:
```js
function renderTabEquipment(char) {
  const panel = document.getElementById('tab-equipment');
  const capacity = deriveCarryingCapacity(char);
  const usedSlots = (char.equipment || []).length;

  panel.innerHTML = `
    <div class="section-header">Carrying Capacity</div>
    <div class="combat-stats-row">
      <div class="combat-stat-chip">
        <span class="combat-stat-chip-label">Capacity</span>
        <span class="combat-stat-chip-value">${usedSlots} / ${capacity} slots</span>
      </div>
    </div>

    <div class="section-header mt-md">Gear</div>
    <div id="equipment-list"></div>
  `;

  buildTextEntryList(document.getElementById('equipment-list'), char.equipment, {
    maxCount: Infinity,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Item',
    onChange: () => renderTabEquipment(getChar())
  });
}
```

Note: existing equipment entries on already-saved characters may still have a `weight` property left over from before this change — that's harmless dead data (never read or displayed anymore), not something this task needs to clean up or migrate.

**Step 2: Verify**

Write a throwaway Node script (no DOM needed for this one — it's pure data/string logic) that:
- Confirms `deriveCarryingCapacity` (unchanged, from `dice.js`) still returns `10 + STR`.
- Builds a sample character with `equipment: [{name:'Rope', description:'50ft'}, {name:'Torch', description:''}]`, confirms `usedSlots` (re-derive the same expression: `(char.equipment || []).length`) equals `2`.
- Confirms the rendered capacity string interpolates as `"2 / <capacity> slots"` (string-check the template, or extract and run the actual function against a fake `document`/`getChar`/`buildTextEntryList` stub, same approach used in this project's earlier Equipment-tab verification).
- Confirms `buildTextEntryList` is called with `secondFieldType: 'text'` (not `'number'`) — this matters because `buildTextEntryList`'s shared code branches behavior on this flag (stores `.description` vs `.weight`, no `min="0"` clamp needed for text).

Delete the script when done.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: switch Carrying Capacity from weight to slot count"
```

---

### Task 6: Final verification and push

**Step 1: Full syntax/sanity check**

```bash
node --check app.js
node --check dice.js
node --check roll20-bridge.js
node -e "JSON.parse(require('fs').readFileSync('config/nng.json','utf8')); console.log('config valid')"
```
All should pass with no errors.

**Step 2: Cross-task grep sweep**

Confirm no stale references survived across all 5 tasks:
```bash
grep -n "showRollModal\|renderDiceOverlay\|closeRollModal\|onRollOverlayKey\|ACTIVE_ROLL" app.js
grep -n "roll-overlay\|roll-modal\|die-result" style.css
grep -n "\.weight\b" app.js
```
First two should return zero matches. The third should return zero matches in `app.js` (the `buildTextEntryList` shared helper still has weight-handling code paths for the `secondFieldType === 'number'` branch — that's fine, it's generic shared infrastructure not equipment-specific; just confirm `renderTabEquipment` itself doesn't reference `.weight` anymore).

**Step 3: Push**

```bash
git push
```

GitHub Pages auto-redeploys from `main`.

**Step 4: Report**

Report what was verified and that the push succeeded. If anything in Steps 1-2 fails, stop and report the specific failure rather than pushing.
