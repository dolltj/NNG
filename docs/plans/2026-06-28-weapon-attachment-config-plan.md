# Weapon & Attachment Config Dictionary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the free-form Weapons system in the Combat tab with a config-driven dictionary (`config/weapons.json`) of weapons/attachments, where each weapon has multiple rollable Actions (some consuming ammo, some Burst Fire with automatic Disadvantage, some single area-effect rolls), and attachments that modify a weapon's tags/magazine size/per-action bonuses.

**Architecture:** A new `config/weapons.json` is fetched alongside the existing `config/nng.json` at bootstrap into a new `WEAPON_CONFIG` global. A character's `weapons[]` array now stores lightweight instances (`{id, weapon_id, bonus, attachments[], ammo}`) referencing the dictionary. A pure function `resolveWeapon(weaponInstance)` merges the base weapon definition with all equipped attachments' effects into a fully-resolved view (adjusted tags/magazine size/per-action hit bonus/save DV/burst-disadvantage-removed flag) — this is the only place attachment-effect logic lives, and it has no DOM dependency so it's testable standalone. The Combat tab's weapon table is replaced with weapon cards built from this resolved view. Burst Fire actions reuse the existing Advantage/Disadvantage modal infrastructure (`openAdvantageModal`/`confirmAdvantageRoll`/`buildAdvantageFormula`), extended to support sending multiple rolls per confirm and pre-seeding a Disadvantage count.

**Tech Stack:** Plain JS (`app.js`), no build step, no framework, no test runner. Verification uses throwaway Node scripts (`node` with the `vm` module to load real `app.js`/`dice.js` into a sandboxed DOM shim, or plain `node -e` for pure functions) written to the scratchpad and discarded — consistent with this project's existing verification approach (no permanent test suite). Manual browser smoke-testing for full UI wiring (the app has no other way to verify DOM interactions).

---

### Task 1: `config/weapons.json` + bootstrap loading

**Files:**
- Create: `config/weapons.json`
- Modify: `app.js:10-26` (STATE block + bootstrap)

**Step 1: Create the config file**

Create `config/weapons.json` with this exact content:

```json
{
  "weapons": [
    {
      "id": "monodagger",
      "label": "Monodagger",
      "category": "Modern Melee Weapon",
      "tags": ["light", "finesse", "concealable"],
      "description": "A crystal-metallic dagger infused with mechanites that maintain a mono-molecular cutting edge.",
      "magazine_size": null,
      "actions": [
        { "id": "slash", "label": "Slash", "range": 1, "damage": "3d6" },
        { "id": "stab", "label": "Stab", "range": 1, "damage": "2d6", "damage_type": "piercing" },
        { "id": "throw", "label": "Throw", "range": 6, "damage": "2d6" }
      ]
    },
    {
      "id": "machine_pistol",
      "label": "Machine Pistol",
      "category": "Modern Ranged Weapon",
      "tags": ["light", "concealable"],
      "description": "A fully automatic handgun designed primarily for close-quarters combat.",
      "magazine_size": 20,
      "actions": [
        { "id": "single_shot", "label": "Single-Shot", "range": 30, "damage": "2d6", "ammo_cost": 1 },
        { "id": "three_round_burst", "label": "Three-Round Burst", "range": 30, "damage": "2d6", "ammo_cost": 3, "burst_fire": true, "attack_count": 3 },
        { "id": "full_auto", "label": "Full-Auto", "range": 30, "damage": "2d6", "ammo_cost": 10, "area_of_effect": 3, "save_dv": 11 },
        { "id": "reload", "label": "Reload", "is_reload": true }
      ]
    },
    {
      "id": "submachine_gun",
      "label": "Submachine Gun",
      "category": "Modern Ranged Weapon",
      "tags": [],
      "description": "A compact, lightweight, fully automatic weapon designed to be fired from the shoulder or hip.",
      "magazine_size": 30,
      "actions": [
        { "id": "single_shot", "label": "Single-Shot", "range": 50, "damage": "3d6", "ammo_cost": 1 },
        { "id": "three_round_burst", "label": "Three-Round Burst", "range": 50, "damage": "3d6", "ammo_cost": 3, "burst_fire": true, "attack_count": 3 },
        { "id": "full_auto", "label": "Full-Auto", "range": 50, "damage": "3d6", "ammo_cost": 10, "area_of_effect": 3, "save_dv": 13 },
        { "id": "reload", "label": "Reload", "is_reload": true }
      ]
    }
  ],
  "attachments": [
    {
      "id": "extended_magazine",
      "label": "Extended Magazine",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "Increases magazine capacity so the weapon does not run empty in a single, 6-second burst.",
      "effects": [
        { "type": "set_magazine_size", "weapon": "machine_pistol", "value": 30 },
        { "type": "set_magazine_size", "weapon": "submachine_gun", "value": 50 }
      ]
    },
    {
      "id": "drum_magazine",
      "label": "Drum Magazine",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "Useful for maximum capacity if the user is stationary or defending a fixed point, despite the added weight.",
      "effects": [
        { "type": "set_magazine_size", "value": 100 },
        { "type": "remove_tag", "tag": "light" },
        { "type": "remove_tag", "tag": "concealable" }
      ]
    },
    {
      "id": "single_point_sling",
      "label": "Single-Point Sling",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["submachine_gun"],
      "description": "A specialized sling that allows the operator to drop the weapon to transition to a sidearm without losing their primary weapon.",
      "effects": [],
      "notes": ["Can drop the weapon for free without losing it."]
    },
    {
      "id": "detachable_shoulder_stock",
      "label": "Detachable Shoulder Stock",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol"],
      "description": "Transforms the weapon into a steady platform. This is the single most important attachment for controlling full-auto muzzle rise.",
      "effects": [
        { "type": "action_save_dv_bonus", "action": "full_auto", "value": 2 },
        { "type": "remove_tag", "tag": "concealable" }
      ],
      "notes": ["Requires the Interact quick action to engage or disengage the shoulder stock."]
    },
    {
      "id": "forward_grip",
      "label": "Forward Grip",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol"],
      "description": "A secondary grip placed under the barrel to allow a two-handed stance, keeping the muzzle downward during sustained fire.",
      "effects": [
        { "type": "add_tag", "tag": "two-handed" },
        { "type": "remove_burst_disadvantage" }
      ]
    },
    {
      "id": "mrds",
      "label": "Micro Red Dot Sight (MRDS)",
      "category": "Modern Ranged Weapon Attachment",
      "compatible_weapons": ["machine_pistol", "submachine_gun"],
      "description": "A lightweight, low-profile optic that allows for rapid target tracking with both eyes open in close-quarters combat.",
      "effects": [
        { "type": "action_hit_bonus", "action": "single_shot", "value": 1 }
      ]
    }
  ]
}
```

**Step 2: Validate the JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('config/weapons.json', 'utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Wire up loading in `app.js`**

In `app.js`, change the STATE block (currently lines 10-17):

```js
let CONFIG       = null;   // loaded from nng.json
let CHARACTERS   = {};     // { [id]: characterObject }
let ACTIVE_ID    = null;   // currently open character id
let SAVE_TIMER   = null;   // debounce handle for autosave

const STORAGE_CHARS_KEY  = 'ttrpg_characters';
const STORAGE_ACTIVE_KEY = 'ttrpg_active_id';
const CONFIG_URL         = 'config/nng.json';
```

to:

```js
let CONFIG        = null;   // loaded from nng.json
let WEAPON_CONFIG  = null;  // loaded from weapons.json — { weapons: [], attachments: [] }
let CHARACTERS    = {};     // { [id]: characterObject }
let ACTIVE_ID     = null;   // currently open character id
let SAVE_TIMER    = null;   // debounce handle for autosave

const STORAGE_CHARS_KEY  = 'ttrpg_characters';
const STORAGE_ACTIVE_KEY = 'ttrpg_active_id';
const CONFIG_URL         = 'config/nng.json';
const WEAPONS_CONFIG_URL  = 'config/weapons.json';
```

Then change the bootstrap block (currently lines 22-26):

```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  loadAllCharacters();
  renderRoster();
});
```

to:

```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  loadAllCharacters();
  renderRoster();
});
```

`loadConfig` is already a generic `fetch`+`json` helper — no change needed there.

**Step 4: Commit**

```bash
git add config/weapons.json app.js
git commit -m "feat: add weapon/attachment config dictionary, load at bootstrap"
```

---

### Task 2: `resolveWeapon()` and dictionary lookup helpers

**Files:**
- Modify: `app.js` (add new functions near `getChar()`, around line 189-200)

**Step 1: Write the functions**

Add directly after the existing `rollCharacterName` function in `app.js`:

```js
function findWeaponDef(weaponId) {
  return (WEAPON_CONFIG.weapons || []).find(w => w.id === weaponId) || null;
}

function findAttachmentDef(attachmentId) {
  return (WEAPON_CONFIG.attachments || []).find(a => a.id === attachmentId) || null;
}

/**
 * Merge a weapon instance's base dictionary definition with all of its
 * equipped attachments' effects into one resolved view. Returns null if
 * weaponInstance.weapon_id doesn't match anything in the dictionary
 * (e.g. an orphaned pre-rewrite weapon entry on an old saved character).
 */
function resolveWeapon(weaponInstance) {
  const base = findWeaponDef(weaponInstance.weapon_id);
  if (!base) return null;

  const attachments = (weaponInstance.attachments || [])
    .map(findAttachmentDef)
    .filter(Boolean);

  const tags = new Set(base.tags || []);
  let magazineSize = base.magazine_size;
  let burstDisadvantageRemoved = false;
  const actionHitBonus = {};
  const actionDvBonus = {};
  const attachmentNotes = [];

  attachments.forEach(att => {
    (att.effects || []).forEach(eff => {
      if (eff.weapon && eff.weapon !== base.id) return;
      switch (eff.type) {
        case 'set_magazine_size':       magazineSize = eff.value; break;
        case 'add_tag':                 tags.add(eff.tag); break;
        case 'remove_tag':              tags.delete(eff.tag); break;
        case 'action_hit_bonus':        actionHitBonus[eff.action] = (actionHitBonus[eff.action] || 0) + eff.value; break;
        case 'action_save_dv_bonus':    actionDvBonus[eff.action]  = (actionDvBonus[eff.action]  || 0) + eff.value; break;
        case 'remove_burst_disadvantage': burstDisadvantageRemoved = true; break;
      }
    });
    (att.notes || []).forEach(n => attachmentNotes.push(n));
  });

  const actions = base.actions.map(a => ({
    ...a,
    hit_bonus: actionHitBonus[a.id] || 0,
    save_dv: a.save_dv != null ? a.save_dv + (actionDvBonus[a.id] || 0) : null
  }));

  return {
    id: base.id,
    label: base.label,
    category: base.category,
    tags: Array.from(tags),
    magazine_size: magazineSize,
    actions,
    burst_disadvantage_removed: burstDisadvantageRemoved,
    attachmentNotes
  };
}
```

**Step 2: Verify with a throwaway Node script**

Write `C:\Users\dollt\AppData\Local\Temp\claude\d--Code-Character-Sheet-NNG\25a01f16-6d67-4250-9f10-3e8209d29c85\scratchpad\verify_resolve_weapon.js`:

```js
const vm = require('vm');
const fs = require('fs');

const sandbox = { console };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('app.js', 'utf8').replace(
  "window.addEventListener('DOMContentLoaded', async () => {",
  "window.__skipBootstrap = true; (async () => { if (false) {"
), sandbox); // bootstrap body becomes dead code; we only need the function declarations

sandbox.WEAPON_CONFIG = JSON.parse(fs.readFileSync('config/weapons.json', 'utf8'));

// Bare machine pistol, no attachments
const bare = { weapon_id: 'machine_pistol', attachments: [] };
const r1 = sandbox.resolveWeapon(bare);
console.assert(r1.magazine_size === 20, 'bare magazine_size should be 20, got ' + r1.magazine_size);
console.assert(r1.actions.find(a => a.id === 'single_shot').hit_bonus === 0, 'bare single_shot hit_bonus should be 0');
console.assert(r1.burst_disadvantage_removed === false, 'bare should not have burst disadvantage removed');

// Machine pistol + Extended Magazine + MRDS
const equipped = { weapon_id: 'machine_pistol', attachments: ['extended_magazine', 'mrds'] };
const r2 = sandbox.resolveWeapon(equipped);
console.assert(r2.magazine_size === 30, 'extended_magazine should set machine_pistol mag to 30, got ' + r2.magazine_size);
console.assert(r2.actions.find(a => a.id === 'single_shot').hit_bonus === 1, 'mrds should add +1 hit_bonus to single_shot');

// Machine pistol + Forward Grip (cancels burst disadvantage, adds two-handed tag)
const grip = { weapon_id: 'machine_pistol', attachments: ['forward_grip'] };
const r3 = sandbox.resolveWeapon(grip);
console.assert(r3.burst_disadvantage_removed === true, 'forward_grip should remove burst disadvantage');
console.assert(r3.tags.includes('two-handed'), 'forward_grip should add two-handed tag');

// Machine pistol + Detachable Shoulder Stock (DV bonus on full_auto, removes concealable)
const stock = { weapon_id: 'machine_pistol', attachments: ['detachable_shoulder_stock'] };
const r4 = sandbox.resolveWeapon(stock);
console.assert(r4.actions.find(a => a.id === 'full_auto').save_dv === 13, 'shoulder stock should add +2 to full_auto save_dv (11 -> 13), got ' + r4.actions.find(a => a.id === 'full_auto').save_dv);
console.assert(!r4.tags.includes('concealable'), 'shoulder stock should remove concealable tag');
console.assert(r4.attachmentNotes.length === 1, 'shoulder stock should contribute one note');

// Unknown weapon_id resolves to null (orphaned legacy entry)
const orphan = { weapon_id: 'nonexistent_weapon', attachments: [] };
console.assert(sandbox.resolveWeapon(orphan) === null, 'unknown weapon_id should resolve to null');

console.log('All resolveWeapon assertions passed');
```

Run: `node "C:\Users\dollt\AppData\Local\Temp\claude\d--Code-Character-Sheet-NNG\25a01f16-6d67-4250-9f10-3e8209d29c85\scratchpad\verify_resolve_weapon.js"`
Expected: `All resolveWeapon assertions passed` with no assertion errors printed above it.

Delete the scratchpad script after it passes — it's a throwaway, not a permanent test file.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add resolveWeapon() merging weapon dictionary + attachment effects"
```

---

### Task 3: Extend the Advantage modal for multi-roll Burst Fire

**Files:**
- Modify: `app.js:904-979` (the existing `openAdvantageModal`/`closeAdvantageModal`/`adjustAdvantageCounts`/`updateAdvantagePreview`/`confirmAdvantageRoll` block — exact current line numbers may have shifted slightly after Task 2's insertion; locate by function name, not line number)

**Context:** Today, `openAdvantageModal(rollInfo)` always resets `DIS_COUNT` to 0 and `confirmAdvantageRoll()` sends exactly one roll. Burst Fire actions need: (a) the modal pre-seeded with Disadvantage = 1 when opened via Shift-click on a burst action, and (b) on confirm, send `attack_count` separate rolls (e.g. 3 for Three-Round Burst) instead of 1, each labeled `"<label> (i/N)"`. Every existing call site (ability/skill/initiative/weapon — none of which pass `presetDisadvantage` or `attackCount`) must keep behaving exactly as before.

**Step 1: Update `openAdvantageModal` to accept a preset Disadvantage seed**

Find:
```js
function openAdvantageModal(rollInfo) {
  PENDING_ADV_ROLL = rollInfo;
  ADV_COUNT = 0;
  DIS_COUNT = 0;
```

Replace with:
```js
function openAdvantageModal(rollInfo) {
  PENDING_ADV_ROLL = rollInfo;
  ADV_COUNT = 0;
  DIS_COUNT = rollInfo.presetDisadvantage || 0;
```

**Step 2: Update `confirmAdvantageRoll` to send N rolls**

Find:
```js
function confirmAdvantageRoll() {
  if (!PENDING_ADV_ROLL) return;
  const formula = buildAdvantageFormula(PENDING_ADV_ROLL.baseDieCount, PENDING_ADV_ROLL.modifier, ADV_COUNT, DIS_COUNT);
  const net = ADV_COUNT - DIS_COUNT;
  let label = PENDING_ADV_ROLL.label;
  if (net > 0) label = `Advantage${net > 1 ? ' x' + net : ''} ${label}`;
  else if (net < 0) label = `Disadvantage${-net > 1 ? ' x' + -net : ''} ${label}`;
  window.Roll20Bridge.sendToRoll20({
    label,
    formula,
    characterName: PENDING_ADV_ROLL.characterName
  });
  closeAdvantageModal();
}
```

Replace with:
```js
function confirmAdvantageRoll() {
  if (!PENDING_ADV_ROLL) return;
  const formula = buildAdvantageFormula(PENDING_ADV_ROLL.baseDieCount, PENDING_ADV_ROLL.modifier, ADV_COUNT, DIS_COUNT);
  const net = ADV_COUNT - DIS_COUNT;
  let label = PENDING_ADV_ROLL.label;
  if (net > 0) label = `Advantage${net > 1 ? ' x' + net : ''} ${label}`;
  else if (net < 0) label = `Disadvantage${-net > 1 ? ' x' + -net : ''} ${label}`;

  const n = PENDING_ADV_ROLL.attackCount || 1;
  for (let i = 1; i <= n; i++) {
    window.Roll20Bridge.sendToRoll20({
      label: n > 1 ? `${label} (${i}/${n})` : label,
      formula,
      characterName: PENDING_ADV_ROLL.characterName
    });
  }
  closeAdvantageModal();
}
```

**Step 3: Verify with a throwaway Node script**

This needs a minimal DOM shim since `openAdvantageModal` touches `document.createElement`/`document.body.appendChild`/`document.getElementById`. Write `<scratchpad>/verify_advantage_burst.js`:

```js
const vm = require('vm');
const fs = require('fs');

// Minimal DOM shim: enough for openAdvantageModal/confirmAdvantageRoll to run headless.
function makeEl() {
  const el = {
    children: [], attributes: {}, listeners: {}, _html: '',
    set innerHTML(v) { this._html = v; },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return makeEl(); },
    addEventListener(evt, fn) { this.listeners[evt] = fn; },
    classList: { add(){}, remove(){}, toggle(){} },
    textContent: ''
  };
  return el;
}

const sentRolls = [];
const sandbox = {
  console,
  window: { addEventListener: () => {}, Roll20Bridge: { sendToRoll20: (d) => sentRolls.push(d) } },
  document: {
    createElement: () => makeEl(),
    getElementById: () => makeEl(),
    body: { appendChild: () => {} },
    addEventListener: () => {}
  }
};
sandbox.global = sandbox;
vm.createContext(sandbox);

let src = fs.readFileSync('app.js', 'utf8');
src += '\n' + fs.readFileSync('dice.js', 'utf8').replace(/if \(typeof module.*?\n}\n?/s, ''); // inline buildAdvantageFormula/buildTestFormula, strip the Node module.exports guard
vm.runInContext(src, sandbox);

// Non-burst call (no attackCount/presetDisadvantage) — must still send exactly 1 roll, unprefixed at net 0
sandbox.openAdvantageModal({ label: 'Stealth', baseDieCount: 2, modifier: 3, characterName: 'Aldric' });
console.assert(sandbox.DIS_COUNT === 0, 'non-burst modal should seed DIS_COUNT to 0, got ' + sandbox.DIS_COUNT);
sandbox.confirmAdvantageRoll();
console.assert(sentRolls.length === 1, 'non-burst confirm should send exactly 1 roll, got ' + sentRolls.length);
console.assert(sentRolls[0].label === 'Stealth', 'non-burst net-0 label should be unprefixed, got "' + sentRolls[0].label + '"');

// Burst call: presetDisadvantage=1, attackCount=3, player adds no extra dice -> 3 rolls, Disadvantage-prefixed, "(i/3)" suffixed
sentRolls.length = 0;
sandbox.openAdvantageModal({ label: 'Three-Round Burst', baseDieCount: 2, modifier: 2, characterName: 'Aldric', attackCount: 3, presetDisadvantage: 1 });
console.assert(sandbox.DIS_COUNT === 1, 'burst modal should seed DIS_COUNT to 1, got ' + sandbox.DIS_COUNT);
sandbox.confirmAdvantageRoll();
console.assert(sentRolls.length === 3, 'burst confirm should send 3 rolls, got ' + sentRolls.length);
console.assert(sentRolls[0].label === 'Disadvantage Three-Round Burst (1/3)', 'got "' + sentRolls[0].label + '"');
console.assert(sentRolls[2].label === 'Disadvantage Three-Round Burst (3/3)', 'got "' + sentRolls[2].label + '"');
console.assert(sentRolls.every(r => r.formula === sentRolls[0].formula), 'all 3 burst rolls should share the same formula');

console.log('All advantage-modal burst assertions passed');
```

Run: `node "C:\Users\dollt\AppData\Local\Temp\claude\d--Code-Character-Sheet-NNG\25a01f16-6d67-4250-9f10-3e8209d29c85\scratchpad\verify_advantage_burst.js"`
Expected: `All advantage-modal burst assertions passed`

Delete the scratchpad script after it passes.

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: support multi-roll bursts and preset disadvantage in advantage modal"
```

---

### Task 4: Replace the Weapons section scaffold + "Add Weapon" control

**Files:**
- Modify: `app.js:649-712` (`renderTabCombat`) — locate by function name, exact line numbers will have shifted from Tasks 1-3.

**Context:** The current `renderTabCombat` builds an `<table class="attacks-table">` with a free-text `#attack-form` for adding weapons. This task replaces that scaffold with a `<div id="weapons-list">` (populated by Task 5's `renderWeaponsList`) and a `<select>` populated from `WEAPON_CONFIG.weapons`. The old `renderAttacksTable` function is fully replaced (not just modified) by `renderWeaponsList` in Task 5 — for this task, just get the new scaffold and add-weapon flow working; `renderWeaponsList` can be a one-line stub (`document.getElementById('weapons-list').innerHTML = '(weapons list — Task 5)';`) that Task 5 will overwrite.

**Step 1: Replace the Combat tab markup and add-weapon wiring**

Find the entire `renderTabCombat` function (from `function renderTabCombat(char) {` through its closing `}`, just before `function buildCombatStatsRow`) and replace it with:

```js
function renderTabCombat(char) {
  const panel = document.getElementById('tab-combat');
  panel.innerHTML = `
    <div class="section-header">Combat Stats</div>
    <div class="combat-stats-row" id="combat-stats-row"></div>

    <div class="section-header mt-md">Weapons</div>
    <div id="weapons-list"></div>
    <div class="flex gap-sm mt-md flex-wrap">
      <select class="field-input" id="add-weapon-select" style="flex:1">
        <option value="">+ Add Weapon…</option>
        ${(WEAPON_CONFIG.weapons || []).map(w => `<option value="${w.id}">${escHtml(w.label)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="add-weapon-btn">Add</button>
    </div>
  `;

  buildCombatStatsRow(char);
  renderWeaponsList(char);

  document.getElementById('add-weapon-btn').addEventListener('click', () => {
    const select = document.getElementById('add-weapon-select');
    const weaponId = select.value;
    if (!weaponId) return;
    const def = findWeaponDef(weaponId);
    if (!def) return;
    getChar().weapons.push({
      id: 'weapon_' + Date.now(),
      weapon_id: weaponId,
      bonus: 0,
      attachments: [],
      ammo: def.magazine_size != null ? { current: def.magazine_size } : null
    });
    scheduleSave();
    select.value = '';
    renderWeaponsList(getChar());
  });
}
```

**Step 2: Add a temporary stub for `renderWeaponsList`**

Directly above `function buildCombatStatsRow(char) {`, add:

```js
function renderWeaponsList(char) {
  document.getElementById('weapons-list').innerHTML = '(weapons list — implemented in Task 5)';
}
```

**Step 3: Delete the old `renderAttacksTable` function**

Find and delete the entire `function renderAttacksTable(char) { ... }` function (it's now dead code — nothing calls it after Step 1's rewrite).

**Step 4: Manual smoke test**

Open `index.html` directly in a browser (or run a static server, e.g. `npx serve .` / Python's `python -m http.server`), create a character, go to the Combat tab. Confirm:
- The old table/free-text form is gone.
- A "+ Add Weapon…" dropdown lists Monodagger, Machine Pistol, Submachine Gun.
- Selecting one and clicking Add doesn't throw a console error (the "(weapons list — implemented in Task 5)" placeholder text is expected for now).
- Reload the page — the added weapon instance persists in `localStorage` under the character (check via DevTools: `localStorage.getItem('ttrpg_characters')`).

**Step 5: Commit**

```bash
git add app.js
git commit -m "feat: replace free-text weapon form with config-driven add-weapon dropdown"
```

---

### Task 5: Weapon cards — resolved actions, rolling, ammo, reload

**Files:**
- Modify: `app.js` — replace the `renderWeaponsList` stub from Task 4, add `buildWeaponCard` and `buildActionRow`.

**Context:** This is the core rendering task. `renderWeaponsList` iterates `char.weapons`, calls `resolveWeapon` (Task 2) on each, and skips (doesn't render) any that resolve to `null` (orphaned `weapon_id`). Each resolved weapon gets a card built via `appendChild` (never `innerHTML +=`, which would destroy previously-attached listeners on sibling elements built in the same render pass). Each action row wires its own roll button(s); Burst Fire actions reuse Task 3's extended advantage-modal API (`attackCount`, `presetDisadvantage`); the `damage-roll-btn` and `Reload` button are unaffected by Burst Fire.

**Step 1: Replace the stub with the real `renderWeaponsList` plus `buildWeaponCard`/`buildActionRow`**

Replace:
```js
function renderWeaponsList(char) {
  document.getElementById('weapons-list').innerHTML = '(weapons list — implemented in Task 5)';
}
```

with:

```js
function renderWeaponsList(char) {
  const wrap = document.getElementById('weapons-list');
  wrap.innerHTML = '';
  (char.weapons || []).forEach(weaponInst => {
    const resolved = resolveWeapon(weaponInst);
    if (!resolved) return; // orphaned weapon_id with no matching dictionary entry
    wrap.appendChild(buildWeaponCard(weaponInst, resolved, char));
  });
}

function buildWeaponCard(weaponInst, resolved, char) {
  const card = document.createElement('div');
  card.className = 'weapon-card';

  const ammoHtml = weaponInst.ammo
    ? `<span class="weapon-card-ammo">${weaponInst.ammo.current}/${resolved.magazine_size}</span>`
    : '';

  card.innerHTML = `
    <div class="weapon-card-header">
      <div class="weapon-card-title">
        <span class="weapon-card-label">${escHtml(resolved.label)}</span>
        <span class="weapon-card-tags">${escHtml((resolved.tags || []).join(', '))}</span>
      </div>
      <div class="weapon-card-header-controls">
        ${ammoHtml}
        <span class="combat-stat-chip-label">Bonus</span>
        <input class="currency-input" style="width:44px" type="number" value="${weaponInst.bonus ?? 0}" data-weapon-bonus>
        <button class="delete-attack-btn" title="Remove">✕</button>
      </div>
    </div>
  `;

  card.querySelector('[data-weapon-bonus]').addEventListener('change', e => {
    weaponInst.bonus = parseInt(e.target.value) || 0;
    scheduleSave();
  });

  card.querySelector('.delete-attack-btn').addEventListener('click', () => {
    if (!confirm(`Remove weapon "${resolved.label}"?`)) return;
    const c = getChar();
    c.weapons = c.weapons.filter(w => w.id !== weaponInst.id);
    scheduleSave();
    renderWeaponsList(c);
  });

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'weapon-action-rows';
  resolved.actions.forEach(action => {
    actionsWrap.appendChild(buildActionRow(weaponInst, resolved, action, char));
  });
  card.appendChild(actionsWrap);

  card.appendChild(buildAttachmentsSection(weaponInst, resolved, char));

  return card;
}

function buildActionRow(weaponInst, resolved, action, char) {
  const row = document.createElement('div');
  row.className = 'weapon-action-row';

  if (action.is_reload) {
    row.innerHTML = `
      <span class="weapon-action-label">${escHtml(action.label)}</span>
      <button class="btn btn-secondary weapon-reload-btn">Reload</button>
    `;
    row.querySelector('.weapon-reload-btn').addEventListener('click', () => {
      weaponInst.ammo.current = resolved.magazine_size;
      scheduleSave();
      renderWeaponsList(getChar());
    });
    return row;
  }

  const notesParts = [];
  if (action.area_of_effect != null) notesParts.push(`AoE ${action.area_of_effect}`);
  if (action.save_dv != null) notesParts.push(`DV ${action.save_dv} negates`);
  const notesText = notesParts.length ? ` (${notesParts.join(', ')})` : '';

  const hasAmmo = weaponInst.ammo != null;
  const insufficientAmmo = hasAmmo && action.ammo_cost && weaponInst.ammo.current < action.ammo_cost;

  row.innerHTML = `
    <span class="weapon-action-label">${escHtml(action.label)}</span>
    <span class="weapon-action-meta">Rng ${escHtml(String(action.range))}${escHtml(notesText)}</span>
    <button class="attack-roll-btn"${insufficientAmmo ? ' disabled' : ''}>🎲 Attack</button>
    <button class="damage-roll-btn">⚔ ${escHtml(action.damage)}</button>
  `;

  row.querySelector('.attack-roll-btn').addEventListener('click', e => {
    if (insufficientAmmo) return;

    const modifier = (weaponInst.bonus ?? 0) + (action.hit_bonus || 0);
    const label = `${resolved.label} — ${action.label}`;
    const characterName = rollCharacterName(char);
    const isBurst = !!action.burst_fire && !resolved.burst_disadvantage_removed;
    const attackCount = isBurst ? (action.attack_count || 1) : 1;

    if (e.shiftKey) {
      openAdvantageModal({
        label, baseDieCount: 2, modifier, characterName,
        attackCount, presetDisadvantage: isBurst ? 1 : 0
      });
    } else if (isBurst) {
      const formula = buildAdvantageFormula(2, modifier, 0, 1);
      for (let i = 1; i <= attackCount; i++) {
        window.Roll20Bridge.sendToRoll20({ label: `${label} (${i}/${attackCount})`, formula, characterName });
      }
    } else {
      const formula = buildTestFormula(modifier);
      window.Roll20Bridge.sendToRoll20({ label, formula, characterName });
    }

    if (hasAmmo && action.ammo_cost) {
      weaponInst.ammo.current = Math.max(0, weaponInst.ammo.current - action.ammo_cost);
      scheduleSave();
      renderWeaponsList(getChar());
    }
  });

  row.querySelector('.damage-roll-btn').addEventListener('click', () => {
    window.Roll20Bridge.sendToRoll20({
      label: `${resolved.label} — ${action.label} Damage`,
      formula: action.damage,
      characterName: rollCharacterName(getChar())
    });
  });

  return row;
}
```

Note: `buildAttachmentsSection` is referenced here but implemented in Task 6 — add a temporary stub directly above `buildActionRow` for now:

```js
function buildAttachmentsSection(weaponInst, resolved, char) {
  return document.createElement('div'); // implemented in Task 6
}
```

**Step 2: Verify the roll/ammo/burst logic with a throwaway Node script**

Write `<scratchpad>/verify_weapon_rolls.js`. This extends Task 3's DOM-shim approach with attribute-aware lookups and a `dispatchClick` helper (the established pattern from this session's earlier Advantage/Disadvantage verification):

```js
const vm = require('vm');
const fs = require('fs');

function makeEl(tag) {
  const el = {
    tag, children: [], attrs: {}, listeners: {}, disabled: false, _html: '',
    set innerHTML(v) {
      this._html = v;
      this.disabled = /disabled/.test(v) && this.tag === undefined ? this.disabled : this.disabled;
    },
    get innerHTML() { return this._html; },
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    addEventListener(evt, fn) { this.listeners[evt] = fn; },
    dispatchClick(opts) { if (this.listeners.click) this.listeners.click(opts || {}); },
    querySelector(sel) {
      // Just enough to find by class for our action-row HTML: returns a stub click target.
      const stub = makeEl();
      stub.className = sel.replace('.', '');
      this._lastQuery = stub;
      return stub;
    },
    classList: { add(){}, remove(){}, toggle(){} },
    textContent: ''
  };
  return el;
}

const sentRolls = [];
const charState = { name: 'Aldric', player_name: '', weapons: [] };
const sandbox = {
  console,
  window: { addEventListener: () => {}, Roll20Bridge: { sendToRoll20: (d) => sentRolls.push(d) } },
  document: {
    createElement: (tag) => makeEl(tag),
    getElementById: () => makeEl(),
    body: { appendChild: () => {} },
    addEventListener: () => {}
  }
};
sandbox.global = sandbox;
vm.createContext(sandbox);

let src = fs.readFileSync('app.js', 'utf8');
src += '\n' + fs.readFileSync('dice.js', 'utf8').replace(/if \(typeof module.*?\n}\n?/s, '');
vm.runInContext(src, sandbox);

sandbox.WEAPON_CONFIG = JSON.parse(fs.readFileSync('config/weapons.json', 'utf8'));
sandbox.CHARACTERS = { c1: charState };
sandbox.ACTIVE_ID = 'c1';
sandbox.getChar = () => sandbox.CHARACTERS[sandbox.ACTIVE_ID];
sandbox.scheduleSave = () => {};

// --- Single-Shot: plain click, no burst, ammo deducted by 1 ---
const pistolInst = { id: 'w1', weapon_id: 'machine_pistol', bonus: 2, attachments: [], ammo: { current: 20 } };
let resolved = sandbox.resolveWeapon(pistolInst);
let singleShot = resolved.actions.find(a => a.id === 'single_shot');
let row = sandbox.buildActionRow(pistolInst, resolved, singleShot, charState);
row._lastQuery = null;
const attackBtn = row.querySelector('.attack-roll-btn');
attackBtn.dispatchClick({ shiftKey: false });
console.assert(sentRolls.length === 1, 'single-shot plain click should send 1 roll, got ' + sentRolls.length);
console.assert(sentRolls[0].formula === '2d10 + 2', 'single-shot formula should be "2d10 + 2", got "' + sentRolls[0].formula + '"');
console.assert(pistolInst.ammo.current === 19, 'single-shot should deduct 1 ammo, got ' + pistolInst.ammo.current);

// --- Three-Round Burst: plain click, no shift -> 3 separate rolls at Disadvantage, ammo -3 ---
sentRolls.length = 0;
resolved = sandbox.resolveWeapon(pistolInst);
let burst = resolved.actions.find(a => a.id === 'three_round_burst');
row = sandbox.buildActionRow(pistolInst, resolved, burst, charState);
row.querySelector('.attack-roll-btn').dispatchClick({ shiftKey: false });
console.assert(sentRolls.length === 3, 'burst plain click should send 3 rolls, got ' + sentRolls.length);
console.assert(sentRolls[0].formula === '3d10kl2 + 2', 'burst formula should apply 1 Disadvantage die, got "' + sentRolls[0].formula + '"');
console.assert(pistolInst.ammo.current === 16, 'burst should deduct 3 ammo total (19 -> 16), got ' + pistolInst.ammo.current);

// --- Forward Grip removes burst disadvantage: plain formula, still 3 rolls ---
sentRolls.length = 0;
pistolInst.attachments = ['forward_grip'];
pistolInst.ammo.current = 20;
resolved = sandbox.resolveWeapon(pistolInst);
burst = resolved.actions.find(a => a.id === 'three_round_burst');
row = sandbox.buildActionRow(pistolInst, resolved, burst, charState);
row.querySelector('.attack-roll-btn').dispatchClick({ shiftKey: false });
console.assert(sentRolls.length === 3, 'burst with forward_grip should still send 3 rolls, got ' + sentRolls.length);
console.assert(sentRolls[0].formula === '2d10 + 2', 'forward_grip should cancel disadvantage (plain 2d10), got "' + sentRolls[0].formula + '"');

// --- Full-Auto is NOT burst fire: exactly 1 roll, no auto-disadvantage ---
sentRolls.length = 0;
pistolInst.attachments = [];
pistolInst.ammo.current = 20;
resolved = sandbox.resolveWeapon(pistolInst);
const fullAuto = resolved.actions.find(a => a.id === 'full_auto');
row = sandbox.buildActionRow(pistolInst, resolved, fullAuto, charState);
row.querySelector('.attack-roll-btn').dispatchClick({ shiftKey: false });
console.assert(sentRolls.length === 1, 'full-auto should send exactly 1 roll, got ' + sentRolls.length);
console.assert(sentRolls[0].formula === '2d10 + 2', 'full-auto should use plain formula (no auto disadvantage), got "' + sentRolls[0].formula + '"');
console.assert(pistolInst.ammo.current === 10, 'full-auto should deduct ammo_cost 10 (20 -> 10), got ' + pistolInst.ammo.current);

// --- Insufficient ammo blocks the attack roll ---
sentRolls.length = 0;
pistolInst.ammo.current = 0;
resolved = sandbox.resolveWeapon(pistolInst);
singleShot = resolved.actions.find(a => a.id === 'single_shot');
row = sandbox.buildActionRow(pistolInst, resolved, singleShot, charState);
row.querySelector('.attack-roll-btn').dispatchClick({ shiftKey: false });
console.assert(sentRolls.length === 0, 'insufficient ammo should block the roll entirely, got ' + sentRolls.length + ' sent');

console.log('All weapon-card roll/ammo/burst assertions passed');
```

Run: `node "C:\Users\dollt\AppData\Local\Temp\claude\d--Code-Character-Sheet-NNG\25a01f16-6d67-4250-9f10-3e8209d29c85\scratchpad\verify_weapon_rolls.js"`
Expected: `All weapon-card roll/ammo/burst assertions passed`

If `querySelector`'s simplistic stub-matching doesn't line up with the real `buildActionRow` markup (it returns a single generic stub per call rather than truly parsing the HTML — adjust the shim if `buildActionRow` queries more than one selector in an order the test doesn't expect), the implementer should adapt the shim's `querySelector` to track calls by class name strictly in the order `buildActionRow` makes them, the same way prior verification scripts in this project's git history (Advantage/Disadvantage feature) did. Delete the scratchpad script once it passes.

**Step 3: Manual browser smoke test**

In the browser: add a Machine Pistol, fire Single-Shot (ammo 20→19, roll appears in the Sent Rolls panel), fire Three-Round Burst (ammo 19→16, 3 entries appear in the Sent Rolls panel each showing a `kl2` formula and "(i/3)" in the label), fire Reload (ammo back to 20 — or to the resolved max if an attachment is equipped, tested in Task 6), Shift-click Single-Shot (Advantage modal opens, Disadvantage NOT pre-seeded), Shift-click Three-Round Burst (Advantage modal opens, Disadvantage already shows 1 before touching the steppers).

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: render weapon cards with per-action rolling, ammo tracking, and burst fire"
```

---

### Task 6: Attachments UI — equip, remove, compatible-attachment picker

**Files:**
- Modify: `app.js` — replace the `buildAttachmentsSection` stub from Task 5.

**Step 1: Replace the stub**

Replace:
```js
function buildAttachmentsSection(weaponInst, resolved, char) {
  return document.createElement('div'); // implemented in Task 6
}
```

with:

```js
function buildAttachmentsSection(weaponInst, resolved, char) {
  const section = document.createElement('div');
  section.className = 'weapon-attachments';

  const equipped = (weaponInst.attachments || [])
    .map(id => ({ id, def: findAttachmentDef(id) }))
    .filter(a => a.def);

  equipped.forEach(({ id, def }) => {
    const row = document.createElement('div');
    row.className = 'weapon-attachment-row';
    row.innerHTML = `
      <span class="weapon-attachment-label">${escHtml(def.label)}</span>
      <button class="delete-item-btn" title="Remove">✕</button>
    `;
    row.querySelector('.delete-item-btn').addEventListener('click', () => {
      weaponInst.attachments = weaponInst.attachments.filter(a => a !== id);
      if (weaponInst.ammo) {
        const newResolved = resolveWeapon(weaponInst);
        if (newResolved.magazine_size != null) {
          weaponInst.ammo.current = Math.min(weaponInst.ammo.current, newResolved.magazine_size);
        }
      }
      scheduleSave();
      renderWeaponsList(getChar());
    });
    section.appendChild(row);
  });

  resolved.attachmentNotes.forEach(note => {
    const noteEl = document.createElement('div');
    noteEl.className = 'weapon-attachment-note';
    noteEl.textContent = `• ${note}`;
    section.appendChild(noteEl);
  });

  const available = (WEAPON_CONFIG.attachments || [])
    .filter(a => a.compatible_weapons.includes(weaponInst.weapon_id))
    .filter(a => !(weaponInst.attachments || []).includes(a.id));

  if (available.length > 0) {
    const addRow = document.createElement('div');
    addRow.className = 'flex gap-sm mt-sm';
    addRow.innerHTML = `
      <select class="field-input" style="flex:1">
        <option value="">+ Add Attachment…</option>
        ${available.map(a => `<option value="${a.id}">${escHtml(a.label)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary">Add</button>
    `;
    const select = addRow.querySelector('select');
    addRow.querySelector('button').addEventListener('click', () => {
      if (!select.value) return;
      weaponInst.attachments = weaponInst.attachments || [];
      weaponInst.attachments.push(select.value);
      scheduleSave();
      renderWeaponsList(getChar());
    });
    section.appendChild(addRow);
  }

  return section;
}
```

**Step 2: Manual browser smoke test**

Add a Machine Pistol. In its Attachments area, confirm only `compatible_weapons`-matching attachments appear (Extended Magazine, Drum Magazine, Detachable Shoulder Stock, Forward Grip, MRDS — not Single-Point Sling, which is Submachine-Gun-only). Equip Extended Magazine — confirm the ammo display updates to `current/30` immediately and the dropdown no longer offers Extended Magazine again. Equip MRDS — confirm Single-Shot's Attack button rolls `2d10 + bonus + 1`. Remove an attachment — confirm it disappears from the equipped list and reappears in the add-dropdown, and that `weaponInst.ammo.current` is clamped down if the new (smaller) magazine size is below the current ammo count. Reload the page — confirm equipped attachments persist via `localStorage`.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add attachment equip/remove UI with compatible-weapon filtering"
```

---

### Task 7: CSS for weapon cards

**Files:**
- Modify: `style.css:938-1052` (the `ATTACKS TABLE` section — remove the now-dead `.attacks-table`/`.attack-form` rules, add new weapon-card rules)

**Context:** `.attack-roll-btn`, `.damage-roll-btn`, `.delete-attack-btn`, `.delete-item-btn`, `.currency-input`, and `.field-input` are all reused as-is from existing CSS — no changes needed to those. This task only removes dead table/form CSS and adds new card/row/attachment classes. Per this session's established preference (skill-roll buttons were made permanently visible rather than hover-only), the weapon card's delete button should also default to visible rather than opacity-0-until-hover.

**Step 1: Remove the dead table/form CSS**

Delete the entire `/* ATTACKS TABLE */` block — every rule from `.attacks-table { ... }` through `.attack-form .field-input { ... }` and its closing rules (i.e. everything that only applied to the now-deleted `<table>`/`#attack-form` markup: `.attacks-table`, `.attacks-table thead th`, `.attacks-table tbody tr`, `.attacks-table tbody tr:hover`, `.attacks-table td`, `.attacks-table td:first-child`, `.damage-type-badge` if unused elsewhere, `.attack-form`, `.attack-form.open`, `.attack-form .field-input`). Keep `.attack-roll-btn, .damage-roll-btn { ... }`, their `:hover` rules, and `.delete-attack-btn { ... }` — just remove the `opacity: 0` and `tr:hover .delete-attack-btn { opacity: 1; }` rule (replace with always-visible, matching `.skill-roll-btn`'s precedent):

Find:
```css
.delete-attack-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  transition: all var(--transition-fast);
  opacity: 0;
}

tr:hover .delete-attack-btn { opacity: 1; }
.delete-attack-btn:hover { color: var(--color-hp); }
```

Replace with:
```css
.delete-attack-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  transition: all var(--transition-fast);
}

.delete-attack-btn:hover { color: var(--color-hp); }
```

**Step 2: Add weapon-card CSS**

Add this new block where the deleted `ATTACKS TABLE` section used to be:

```css
/* =============================================
   WEAPON CARDS
   ============================================= */
.weapon-card {
  background: var(--bg-card);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
}

.weapon-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.weapon-card-title { display: flex; flex-direction: column; gap: 2px; }

.weapon-card-label {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-primary);
}

.weapon-card-tags {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.weapon-card-header-controls {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.weapon-card-ammo {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--gold);
  font-size: 0.9rem;
}

.weapon-action-rows {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border-top: 1px solid var(--border-subtle);
  padding-top: var(--space-sm);
}

.weapon-action-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: 32px;
}

.weapon-action-label {
  flex: 0 0 130px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.weapon-action-meta {
  flex: 1;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.weapon-attachments {
  border-top: 1px solid var(--border-subtle);
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
}

.weapon-attachment-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 2px 0;
}

.weapon-attachment-label { font-size: 0.8rem; color: var(--text-secondary); }

.weapon-attachment-note {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-style: italic;
  margin-top: 2px;
}
```

**Step 3: Manual visual check**

Open the Combat tab in a browser with at least two weapons added (one melee with no ammo, one ranged with ammo + an attachment equipped). Confirm: cards are visually distinct from each other with consistent spacing, action rows line up legibly, the delete (✕) button is visible without hovering, and nothing visually overlaps at a narrow (mobile-width) viewport.

**Step 4: Commit**

```bash
git add style.css
git commit -m "style: add weapon card layout, remove dead attacks-table CSS"
```

---

### Task 8: Full regression smoke test + push to main

**Files:** none (verification only)

**Step 1: Run the full existing dice/advantage verification surface once more**

Since Task 3 changed shared code (`openAdvantageModal`/`confirmAdvantageRoll`) used by the Ability/Skill/Initiative/non-burst-weapon roll paths from earlier in this session, re-confirm those still work via a quick manual pass: open the Abilities tab, Shift-click a stat's roll button (modal opens, Disadvantage starts at 0, confirming sends exactly 1 roll labeled plainly at net 0). Do the same for a Skill roll and for Initiative.

**Step 2: Full weapons-system smoke test in the browser**

- Create a character, add a Monodagger (melee, no ammo) — confirm its 3 actions (Slash/Stab/Throw) each have Attack+Damage buttons and no ammo display.
- Add a Machine Pistol — confirm Single-Shot/Three-Round Burst/Full-Auto/Reload all behave as verified in Tasks 5-6.
- Equip Drum Magazine — confirm magazine shows `current/100` and the `light`/`concealable` tags disappear from the header.
- Delete a weapon — confirm the confirm() prompt appears and it's removed from the list and from `localStorage` after reload.
- Reload the whole page — confirm every weapon, its ammo, and its equipped attachments persist exactly as left.

**Step 3: Push**

```bash
git push
```

(This project deploys directly from `main` via GitHub Pages — no separate worktree/PR ceremony has been used for in-session work this far, but confirm with the user before pushing if this plan was executed in a worktree per Task 0/brainstorming convention.)
