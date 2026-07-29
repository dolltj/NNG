# Integrated Dice Roller Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a toggleable integrated dice roller that evaluates rolls client-side, shows die values + crit callout in the roll log panel, while still forwarding formulas to Roll20.

**Architecture:** `evaluateFormula()` is added to `dice.js` (pure function, fully testable). `roll20-bridge.js` gets a localStorage-backed roll mode API (`getRollMode`/`setRollMode`/`toggleRollMode`) and an enhanced `_renderRollLog` that branches on mode. A toggle button in `index.html`'s top bar calls `Roll20Bridge.toggleRollMode()`. No changes to `app.js` — all 13 roll call sites already route through `Roll20Bridge.sendToRoll20`.

**Tech Stack:** Vanilla JS (ES5 IIFE in roll20-bridge.js, top-level function declarations in dice.js), Node built-in test runner (`node --test`), CSS custom properties.

---

### Task 1: Add `evaluateFormula` to `dice.js`

**Files:**
- Modify: `dice.js` (end of file, before `module.exports`)
- Test: `tests/dice.test.js` (append new tests)

**Context:** `dice.js` uses top-level `function` declarations (not classes). The file ends with a `module.exports` block guarded by `if (typeof module !== 'undefined')`. All functions added here are global in the browser (no `const`/`let` at module scope needed — use `function`). The test runner is `node --test tests/dice.test.js`.

**Step 1: Append failing tests to `tests/dice.test.js`**

Add these tests at the end of the file (after the existing `getResourceMax` tests):

```js
test('evaluateFormula: plain 2d10 + modifier — structure and range', () => {
  const r = dice.evaluateFormula('2d10 + 5');
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.modifier, 5);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] + 5);
  assert.ok(r.kept.every(v => v >= 1 && v <= 10), 'all d10 values in [1,10]');
});

test('evaluateFormula: negative modifier', () => {
  const r = dice.evaluateFormula('2d10 - 3');
  assert.strictEqual(r.modifier, -3);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] - 3);
});

test('evaluateFormula: no modifier', () => {
  const r = dice.evaluateFormula('2d10');
  assert.strictEqual(r.modifier, 0);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1]);
});

test('evaluateFormula: advantage (4d10kh2) keeps 2 highest', () => {
  const r = dice.evaluateFormula('4d10kh2');
  assert.strictEqual(r.dice.length, 4);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 2);
  const allSorted = [...r.dice].sort((a, b) => a - b);
  assert.deepStrictEqual(
    [...r.kept].sort((a, b) => a - b),
    allSorted.slice(-2),
    'kept should be the 2 highest values'
  );
});

test('evaluateFormula: disadvantage (4d10kl2) keeps 2 lowest', () => {
  const r = dice.evaluateFormula('4d10kl2');
  assert.strictEqual(r.dice.length, 4);
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.dropped.length, 2);
  const allSorted = [...r.dice].sort((a, b) => a - b);
  assert.deepStrictEqual(
    [...r.kept].sort((a, b) => a - b),
    allSorted.slice(0, 2),
    'kept should be the 2 lowest values'
  );
});

test('evaluateFormula: isDoubles true when kept dice all equal', () => {
  const origRandom = Math.random;
  Math.random = () => 0;  // Math.floor(0 * 10) + 1 = 1; all dice = 1
  const r = dice.evaluateFormula('2d10');
  Math.random = origRandom;
  assert.strictEqual(r.isDoubles, true);
  assert.deepStrictEqual(r.kept, [1, 1]);
});

test('evaluateFormula: isDoubles false when kept dice differ', () => {
  let call = 0;
  const origRandom = Math.random;
  Math.random = () => call++ === 0 ? 0.2 : 0.8;  // 3 and 9
  const r = dice.evaluateFormula('2d10');
  Math.random = origRandom;
  assert.strictEqual(r.isDoubles, false);
});

test('evaluateFormula: 1d10 — isDoubles false (only 1 kept die)', () => {
  const r = dice.evaluateFormula('1d10');
  assert.strictEqual(r.kept.length, 1);
  assert.strictEqual(r.dropped.length, 0);
  assert.strictEqual(r.isDoubles, false);
});

test('evaluateFormula: weapon damage 2d6 + 4', () => {
  const r = dice.evaluateFormula('2d6 + 4');
  assert.strictEqual(r.kept.length, 2);
  assert.strictEqual(r.modifier, 4);
  assert.strictEqual(r.total, r.kept[0] + r.kept[1] + 4);
  assert.ok(r.kept.every(v => v >= 1 && v <= 6));
});

test('evaluateFormula: 1d1 announcement formula', () => {
  const r = dice.evaluateFormula('1d1');
  assert.deepStrictEqual(r.kept, [1]);
  assert.strictEqual(r.total, 1);
  assert.strictEqual(r.isDoubles, false);
});
```

**Step 2: Run tests to confirm they fail**

```bash
node --test tests/dice.test.js
```

Expected: 10 new failures with `TypeError: dice.evaluateFormula is not a function`.

**Step 3: Implement `evaluateFormula` in `dice.js`**

Add this function **before** the `if (typeof module !== 'undefined')` block at the bottom of `dice.js`:

```js
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
```

Also add `evaluateFormula` to the `module.exports` block at the bottom of `dice.js`. Change:

```js
module.exports = {
  applyPerkModifiers, deriveMaxHP, deriveInjuryThreshold, deriveRecoveryModifier,
  deriveCarryingCapacity, getResourceMax, weaponAttackAbility,
  buildTestFormula, buildAdvantageFormula
};
```

to:

```js
module.exports = {
  applyPerkModifiers, deriveMaxHP, deriveInjuryThreshold, deriveRecoveryModifier,
  deriveCarryingCapacity, getResourceMax, weaponAttackAbility,
  buildTestFormula, buildAdvantageFormula, evaluateFormula
};
```

**Step 4: Run tests to confirm they pass**

```bash
node --test tests/dice.test.js
```

Expected: all tests pass (0 failures). There should now be ~22 passing tests total.

**Step 5: Commit**

```bash
git add dice.js tests/dice.test.js
git commit -m "feat: add evaluateFormula to dice.js for client-side roll evaluation"
```

---

### Task 2: Roll mode API in `roll20-bridge.js`

**Files:**
- Modify: `roll20-bridge.js`

**Context:** `roll20-bridge.js` is an IIFE `(function() { 'use strict'; ... })()`. Private vars go inside, public API on `window.Roll20Bridge` at the bottom. The file already has `window.addEventListener('DOMContentLoaded', ...)` which runs 1 second after load. No test file for this — it's browser-only (localStorage, DOM). Manual verification is in Task 4.

**Step 1: Add roll mode constants and helpers inside the IIFE**

After the `const ROLL_LOG_MAX = 5;` line, add:

```js
const ROLL_MODE_KEY = 'ttrpg_roll_mode';

function getRollMode() {
  return localStorage.getItem(ROLL_MODE_KEY) === 'integrated' ? 'integrated' : 'roll20';
}

function setRollMode(mode) {
  localStorage.setItem(ROLL_MODE_KEY, mode === 'integrated' ? 'integrated' : 'roll20');
  _updateModeButton();
}

function toggleRollMode() {
  setRollMode(getRollMode() === 'integrated' ? 'roll20' : 'integrated');
}

function _updateModeButton() {
  const btn = document.getElementById('roll-mode-btn');
  if (!btn) return;
  const integrated = getRollMode() === 'integrated';
  btn.textContent = integrated ? '🎲 Local' : '📤 Roll20';
  btn.title = integrated
    ? 'Dice rolled in-app (also sent to Roll20)'
    : 'Dice sent to Roll20 (current mode)';
}
```

**Step 2: Initialize the button on DOMContentLoaded**

In the existing `window.addEventListener('DOMContentLoaded', () => { ... })` block, add a call to `_updateModeButton()`:

Change:

```js
window.addEventListener('DOMContentLoaded', () => {
  // Give Beyond20 1 second to inject its signal
  setTimeout(() => { _beyond20Checked = true; }, 1000);
});
```

to:

```js
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { _beyond20Checked = true; }, 1000);
  _updateModeButton();
});
```

**Step 3: Expose on `window.Roll20Bridge`**

Change:

```js
window.Roll20Bridge = { sendToRoll20, sendAnnouncement, showRollToast, isAvailable: () => _beyond20Available };
```

to:

```js
window.Roll20Bridge = {
  sendToRoll20, sendAnnouncement, showRollToast,
  isAvailable: () => _beyond20Available,
  getRollMode, setRollMode, toggleRollMode
};
```

**Step 4: Run the test suite to make sure nothing regressed**

```bash
node --test tests/dice.test.js
```

Expected: all tests still pass.

**Step 5: Commit**

```bash
git add roll20-bridge.js
git commit -m "feat: add roll mode toggle API to Roll20Bridge (getRollMode/setRollMode/toggleRollMode)"
```

---

### Task 3: Enhanced roll log for integrated mode

**Files:**
- Modify: `roll20-bridge.js`

**Context:** In `roll20-bridge.js`, `_logRoll(rollData)` stores `{label, formula}` entries in `_rollLog`. `_renderRollLog()` reads them and builds HTML. In integrated mode: `_logRoll` also evaluates the formula using `evaluateFormula()` (which is a global function in the browser from `dice.js`, loaded before this script). The `_renderRollLog` branches on `getRollMode()` to show either the existing formula display or the new die-faces display. `window.escHtml` is a global from `util.js`.

**Step 1: Modify `_logRoll` to evaluate in integrated mode**

Change:

```js
function _logRoll(rollData) {
  _rollLog.unshift({ label: rollData.label || 'Roll', formula: rollData.formula || '' });
  if (_rollLog.length > ROLL_LOG_MAX) _rollLog.length = ROLL_LOG_MAX;
  _renderRollLog();
}
```

to:

```js
function _logRoll(rollData) {
  const entry = { label: rollData.label || 'Roll', formula: rollData.formula || '' };
  if (getRollMode() === 'integrated' && typeof evaluateFormula === 'function') {
    try { entry.evalResult = evaluateFormula(rollData.formula || ''); } catch (_) {}
  }
  _rollLog.unshift(entry);
  if (_rollLog.length > ROLL_LOG_MAX) _rollLog.length = ROLL_LOG_MAX;
  _renderRollLog();
}
```

**Step 2: Modify `_renderRollLog` to branch on roll mode**

Replace the `_rollLog.map(r => ...)` template inside `_renderRollLog` with a helper that renders each entry based on whether it has an `evalResult`:

Change the `panel.innerHTML` assignment's map from:

```js
${_rollLog.map(r => `
  <div class="roll-log-entry">
    <span class="roll-log-formula">${window.escHtml(r.formula)}</span>
    <span class="roll-log-label">${window.escHtml(r.label)}</span>
  </div>
`).join('')}
```

to:

```js
${_rollLog.map(r => _renderLogEntry(r)).join('')}
```

Then add the `_renderLogEntry` helper function (inside the IIFE, near `_renderRollLog`):

```js
function _renderLogEntry(entry) {
  if (!entry.evalResult) {
    return `
      <div class="roll-log-entry">
        <span class="roll-log-formula">${window.escHtml(entry.formula)}</span>
        <span class="roll-log-label">${window.escHtml(entry.label)}</span>
      </div>`;
  }
  const ev = entry.evalResult;
  const keptHtml    = ev.kept.map(v =>
    `<span class="die-box die-kept">${window.escHtml(String(v))}</span>`).join('');
  const droppedHtml = ev.dropped.map(v =>
    `<span class="die-box die-dropped">${window.escHtml(String(v))}</span>`).join('');
  const modHtml = ev.modifier !== 0
    ? `<span class="roll-modifier">${ev.modifier > 0 ? '+' : ''}${ev.modifier}</span>`
    : '';
  const critHtml = ev.isDoubles ? `<span class="roll-crit">⚡ CRIT!</span>` : '';
  return `
    <div class="roll-log-entry roll-log-entry-integrated">
      <div class="roll-log-dice-row">
        ${keptHtml}${droppedHtml}${modHtml}
        <span class="roll-total">= ${ev.total}</span>
        ${critHtml}
      </div>
      <span class="roll-log-label">${window.escHtml(entry.label)}</span>
    </div>`;
}
```

**Step 3: Run the test suite**

```bash
node --test tests/dice.test.js
```

Expected: all tests still pass.

**Step 4: Commit**

```bash
git add roll20-bridge.js
git commit -m "feat: show die values and crit callout in roll log when integrated mode is on"
```

---

### Task 4: Toggle button in `index.html` + CSS in `style.css`

**Files:**
- Modify: `index.html` (`.top-bar-actions`)
- Modify: `style.css` (after `SENT ROLLS LOG` section)

**Context:** `.top-bar-actions` in `index.html` currently has `save-indicator`, `Export`, `Import` buttons. The `onclick` attribute on the new button calls `window.Roll20Bridge.toggleRollMode()` — same pattern as other top-bar buttons that call global functions inline. The CSS goes at the end of the `SENT ROLLS LOG` section (around line 1556 in `style.css`). CSS variables available: `--bg-card`, `--bg-surface`, `--border-subtle`, `--text-primary`, `--text-muted`, `--gold`, `--gold-bright`, `--radius-sm`, `--space-xs`.

**Step 1: Add toggle button to `index.html`**

In `index.html`, inside `.top-bar-actions`, add the roll mode button **before** the Export button:

Change:

```html
<div class="top-bar-actions">
  <div class="save-indicator" id="save-indicator">
    <div class="save-dot"></div>
    <span class="save-dot-label">Auto-save on</span>
  </div>
  <button class="btn btn-secondary" onclick="exportCharacter()" title="Export character to JSON file">
    ↓ Export
  </button>
  <button class="btn btn-secondary" onclick="importCharacter()" title="Import character from JSON file">
    ↑ Import
  </button>
</div>
```

to:

```html
<div class="top-bar-actions">
  <div class="save-indicator" id="save-indicator">
    <div class="save-dot"></div>
    <span class="save-dot-label">Auto-save on</span>
  </div>
  <button class="btn btn-secondary" id="roll-mode-btn"
    onclick="window.Roll20Bridge.toggleRollMode()"
    title="Dice sent to Roll20 (current mode)">
    📤 Roll20
  </button>
  <button class="btn btn-secondary" onclick="exportCharacter()" title="Export character to JSON file">
    ↓ Export
  </button>
  <button class="btn btn-secondary" onclick="importCharacter()" title="Import character from JSON file">
    ↑ Import
  </button>
</div>
```

The initial text (`📤 Roll20`) is the default (Roll20 mode). `_updateModeButton()` corrects it on DOMContentLoaded to match localStorage, so it self-corrects even if the user was previously in integrated mode.

**Step 2: Add CSS to `style.css`**

After the existing `#roll-log-panel` section (after the `@media (max-width: 768px)` rule that adjusts `#roll-log-panel`), append:

```css
/* =============================================
   INTEGRATED DICE ROLLER
   ============================================= */
.roll-log-entry-integrated {
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
}

.roll-log-dice-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.die-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

.die-kept {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.die-dropped {
  background: transparent;
  border: 1px dashed var(--border-subtle);
  color: var(--text-muted);
  text-decoration: line-through;
}

.roll-modifier {
  font-family: var(--font-display);
  font-size: 0.7rem;
  color: var(--text-muted);
  margin: 0 2px;
}

.roll-total {
  font-family: var(--font-display);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-left: 2px;
}

.roll-crit {
  font-family: var(--font-display);
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--gold-bright);
  letter-spacing: 0.05em;
  margin-left: var(--space-xs);
}
```

**Step 3: Run tests**

```bash
node --test tests/dice.test.js
```

Expected: all tests pass.

**Step 4: Manual verification in browser**

Open `index.html` directly in a browser (or use a local server):

1. Open a character sheet. The top bar should show `📤 Roll20` button alongside Export/Import.
2. Click the button — it should toggle to `🎲 Local`.
3. Click any roll button (e.g. an ability test in the Abilities tab). The roll log panel should appear with die faces like `[7] [3] + 4 = 14 — STR Test`.
4. Refresh the page — the button should still read `🎲 Local` (localStorage persisted).
5. Force a doubles roll manually: temporarily override `Math.random = () => 0` in DevTools console, then click a roll button. The log should show `⚡ CRIT!`.
6. Toggle back to `📤 Roll20` — rolls revert to formula-only display.

**Step 5: Commit**

```bash
git add index.html style.css
git commit -m "feat: roll mode toggle button and integrated dice roller CSS"
```

---

### Task 5: Full regression test + push

**Step 1: Run tests**

```bash
node --test tests/dice.test.js
node --test tests/weapon-store.test.js
node --test tests/util.test.js
```

Expected: all pass, 0 failures.

**Step 2: Smoke test the feature in browser**

Open `index.html`. Verify:
- Toggle button appears and persists across refresh
- Integrated mode: roll log shows individual die values; crit fires on doubles
- Roll20 mode: roll log shows formula+label as before
- Beyond20 toast still appears in both modes
- Advantage modal still works in both modes

**Step 3: Push to main**

```bash
git push origin main
```
