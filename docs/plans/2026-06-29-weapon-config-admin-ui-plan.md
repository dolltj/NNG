# Weapon/Attachment Config Admin UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a separate `admin.html` page where players without GitHub access can build custom weapons/attachments through a form, have them immediately usable in their own browser's games via a runtime merge into `WEAPON_CONFIG`, and export them as a JSON file to hand to the repo owner for merging into `config/weapons.json`.

**Architecture:** A new shared module `weapon-store.js` owns all custom-item storage (a new localStorage key, shaped exactly like `config/weapons.json`), merge-with-base-config, and export logic — loaded by both `index.html` (so the character sheet's existing `WEAPON_CONFIG` gets custom items merged in at bootstrap, with zero changes to any of the existing weapon-card/rolling code from the prior `weapon-attachment-config` work) and the new `admin.html` (so the builder reads/writes the same store). `admin.html` is a self-contained second mini-app (`admin.js`) reusing `style.css` for visual consistency but with no dependency on `app.js`/`dice.js`/`roll20-bridge.js`, since it doesn't roll dice or touch character data.

**Tech Stack:** Plain JS, no build step, no framework — matches the rest of this project. Verification uses throwaway Node scripts (loaded via `vm`, fake `localStorage`/DOM shims, deleted after passing) for pure logic, and manual/real-browser checks for UI wiring — this project has no permanent test suite by design.

---

### Task 1: `weapon-store.js` — custom-item storage, merge, export

**Files:**
- Create: `weapon-store.js`

**Step 1: Write the module**

```js
// =============================================
// WEAPON STORE
// Manages custom (player-authored) weapons and
// attachments in localStorage, and merges them
// with the base config/weapons.json dictionary
// at runtime. Shared between index.html (the
// character sheet) and admin.html (the builder).
// =============================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ttrpg_custom_weapon_config';

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        weapons: (parsed && Array.isArray(parsed.weapons)) ? parsed.weapons : [],
        attachments: (parsed && Array.isArray(parsed.attachments)) ? parsed.attachments : []
      };
    } catch {
      return { weapons: [], attachments: [] };
    }
  }

  function _save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getCustomWeapons() {
    return _load().weapons;
  }

  function getCustomAttachments() {
    return _load().attachments;
  }

  function saveCustomWeapon(weapon) {
    const data = _load();
    const idx = data.weapons.findIndex(w => w.id === weapon.id);
    if (idx >= 0) data.weapons[idx] = weapon;
    else data.weapons.push(weapon);
    _save(data);
  }

  function saveCustomAttachment(attachment) {
    const data = _load();
    const idx = data.attachments.findIndex(a => a.id === attachment.id);
    if (idx >= 0) data.attachments[idx] = attachment;
    else data.attachments.push(attachment);
    _save(data);
  }

  function deleteCustomWeapon(id) {
    const data = _load();
    data.weapons = data.weapons.filter(w => w.id !== id);
    _save(data);
  }

  function deleteCustomAttachment(id) {
    const data = _load();
    data.attachments = data.attachments.filter(a => a.id !== id);
    _save(data);
  }

  function getMergedConfig(baseConfig) {
    const custom = _load();
    return {
      weapons: [
        ...(baseConfig.weapons || []),
        ...custom.weapons.map(w => ({ ...w, _custom: true }))
      ],
      attachments: [
        ...(baseConfig.attachments || []),
        ...custom.attachments.map(a => ({ ...a, _custom: true }))
      ]
    };
  }

  function exportAll() {
    return _load();
  }

  window.WeaponStore = {
    getCustomWeapons,
    getCustomAttachments,
    saveCustomWeapon,
    saveCustomAttachment,
    deleteCustomWeapon,
    deleteCustomAttachment,
    getMergedConfig,
    exportAll
  };
})();
```

Note: `getMergedConfig` tags each custom item with `_custom: true` so downstream UI (Task 2) can visually distinguish them — this is the only deviation from a byte-identical copy of the stored data.

**Step 2: Verify with a throwaway Node script**

This module only needs `localStorage`, no other DOM. Write a script to your scratch directory (delete after it passes):

```js
const vm = require('vm');
const fs = require('fs');

function makeFakeLocalStorage() {
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
}

const sandbox = { console, localStorage: makeFakeLocalStorage() };
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('weapon-store.js', 'utf8'), sandbox);

const WeaponStore = sandbox.window.WeaponStore;

// Starts empty
console.assert(WeaponStore.getCustomWeapons().length === 0, 'should start with no custom weapons');

// Save + retrieve
WeaponStore.saveCustomWeapon({ id: 'my_sword', label: 'My Sword', actions: [] });
console.assert(WeaponStore.getCustomWeapons().length === 1, 'should have 1 custom weapon after save');
console.assert(WeaponStore.getCustomWeapons()[0].label === 'My Sword', 'label should round-trip');

// Upsert by id (not duplicate)
WeaponStore.saveCustomWeapon({ id: 'my_sword', label: 'My Renamed Sword', actions: [] });
console.assert(WeaponStore.getCustomWeapons().length === 1, 'saving same id should upsert, not duplicate');
console.assert(WeaponStore.getCustomWeapons()[0].label === 'My Renamed Sword', 'upsert should update the label');

// Delete
WeaponStore.deleteCustomWeapon('my_sword');
console.assert(WeaponStore.getCustomWeapons().length === 0, 'delete should remove it');

// Merge: base + custom, tagged
WeaponStore.saveCustomWeapon({ id: 'custom1', label: 'Custom Blade', actions: [] });
const merged = WeaponStore.getMergedConfig({ weapons: [{ id: 'official1', label: 'Official Sword' }], attachments: [] });
console.assert(merged.weapons.length === 2, 'merged should have 1 official + 1 custom, got ' + merged.weapons.length);
console.assert(merged.weapons.find(w => w.id === 'official1')._custom === undefined, 'official weapon should not be tagged _custom');
console.assert(merged.weapons.find(w => w.id === 'custom1')._custom === true, 'custom weapon should be tagged _custom');

// Corrupt localStorage doesn't throw
sandbox.localStorage.setItem('ttrpg_custom_weapon_config', 'not valid json{{{');
console.assert(WeaponStore.getCustomWeapons().length === 0, 'corrupt storage should fall back to empty, not throw');

console.log('All weapon-store assertions passed');
```

Note: `window.WeaponStore = ...` requires a `window` global in the sandbox for the IIFE to attach to — add `sandbox.window = sandbox;` before `vm.createContext(sandbox)` if `window` isn't otherwise defined (since this file runs in a real browser where `window` always exists, but the Node sandbox needs it stubbed).

Run: `node <path-to-script>`
Expected: `All weapon-store assertions passed`

Delete the script once it passes — this project has no permanent test suite by design.

**Step 3: Commit**

```bash
git add weapon-store.js
git commit -m "feat: add weapon-store.js for custom weapon/attachment storage and merge"
```

---

### Task 2: Wire the merge into the character sheet

**Files:**
- Modify: `index.html` (add a script tag)
- Modify: `app.js` (bootstrap, renderTabCombat's add-weapon dropdown, buildAttachmentsSection's add-attachment dropdown, renderRoster)

**Step 1: Load `weapon-store.js` in `index.html`**

In `index.html`, find:
```html
  <!-- Scripts (order matters: dice → bridge → app) -->
  <script src="dice.js"></script>
  <script src="roll20-bridge.js"></script>
  <script src="app.js"></script>
```

Replace with:
```html
  <!-- Scripts (order matters: dice → bridge → weapon-store → app) -->
  <script src="dice.js"></script>
  <script src="roll20-bridge.js"></script>
  <script src="weapon-store.js"></script>
  <script src="app.js"></script>
```

**Step 2: Merge custom items into `WEAPON_CONFIG` at bootstrap**

In `app.js`, find:
```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  loadAllCharacters();
  renderRoster();
});
```

Replace with:
```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  WEAPON_CONFIG = window.WeaponStore.getMergedConfig(WEAPON_CONFIG);
  loadAllCharacters();
  renderRoster();
});
```

**Step 3: Tag custom items with "🔧 " in the two Add-dropdowns**

In `app.js`'s `renderTabCombat`, find:
```js
        ${(WEAPON_CONFIG.weapons || []).map(w => `<option value="${w.id}">${escHtml(w.label)}</option>`).join('')}
```
Replace with:
```js
        ${(WEAPON_CONFIG.weapons || []).map(w => `<option value="${w.id}">${w._custom ? '🔧 ' : ''}${escHtml(w.label)}</option>`).join('')}
```

In `app.js`'s `buildAttachmentsSection`, find:
```js
        ${available.map(a => `<option value="${a.id}">${escHtml(a.label)}</option>`).join('')}
```
Replace with:
```js
        ${available.map(a => `<option value="${a.id}">${a._custom ? '🔧 ' : ''}${escHtml(a.label)}</option>`).join('')}
```

**Step 4: Add a "⚙ Manage Weapons" link to the roster screen**

In `app.js`'s `renderRoster`, find:
```js
  screen.innerHTML = `
    <h1 class="roster-title">⚔ Character Vault</h1>
    <p class="roster-subtitle">${CONFIG.system} · Select or create a character</p>
    <div class="roster-grid" id="roster-grid"></div>
  `;
```
Replace with:
```js
  screen.innerHTML = `
    <h1 class="roster-title">⚔ Character Vault</h1>
    <p class="roster-subtitle">${CONFIG.system} · Select or create a character</p>
    <div class="roster-grid" id="roster-grid"></div>
    <a class="roster-admin-link" href="admin.html">⚙ Manage Weapons</a>
  `;
```

(The `.roster-admin-link` CSS class is added in Task 6 — this link will render unstyled-but-functional until then, which is fine for incremental development.)

**Step 5: Verify**

Since `WeaponStore`/`escHtml`/the dropdown-building code don't exist in isolation easily testable without a full app load, do this verification via a throwaway Node `vm` script that loads `weapon-store.js` + `dice.js` + `app.js` together (same multi-file-sandbox pattern used in the prior `weapon-attachment-config` plan's Task 5 verification), with a fake `localStorage` pre-seeded with one custom weapon (e.g. `{id: 'my_custom_gun', label: 'My Custom Gun', magazine_size: 10, actions: [{id:'shoot', label:'Shoot', range: 20, damage: '1d6', ammo_cost: 1}]}`), then assert:
- After simulating the bootstrap sequence (or just calling `WeaponStore.getMergedConfig` directly on the real `config/weapons.json` content the way the bootstrap does), `WEAPON_CONFIG.weapons` contains both official weapons and `my_custom_gun`.
- `findWeaponDef('my_custom_gun')` (from the existing Task 2 work in the prior plan) resolves it correctly.
- `resolveWeapon({weapon_id: 'my_custom_gun', attachments: []})` returns a valid resolved view (proves the entire existing weapon-card pipeline works unmodified against a custom weapon).

Delete the script after it passes.

**Step 6: Commit**

```bash
git add index.html app.js
git commit -m "feat: merge custom weapons/attachments into WEAPON_CONFIG at bootstrap"
```

---

### Task 3: `admin.html` scaffold + `admin.js` bootstrap/utilities

**Files:**
- Create: `admin.html`
- Create: `admin.js`

**Step 1: Create `admin.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Builder for custom weapons and attachments for the NNG character sheet.">
  <title>Weapon Admin — NNG Sheet</title>
  <link rel="stylesheet" href="style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
</head>
<body>

  <div id="admin-screen">
    <header class="top-bar">
      <a class="top-bar-back" href="index.html">← Character Vault</a>
      <h1 class="top-bar-title">Weapon &amp; Attachment Admin</h1>
      <div class="top-bar-actions">
        <button class="btn btn-secondary" id="export-btn">↓ Export Custom Items</button>
      </div>
    </header>

    <main class="tab-content">
      <div class="section-header">Custom Weapons</div>
      <div id="custom-weapons-list"></div>
      <button class="btn btn-primary mt-md" id="new-weapon-btn">＋ New Weapon</button>
      <div id="weapon-form-container"></div>

      <div class="section-header mt-lg">Custom Attachments</div>
      <div id="custom-attachments-list"></div>
      <button class="btn btn-primary mt-md" id="new-attachment-btn">＋ New Attachment</button>
      <div id="attachment-form-container"></div>
    </main>
  </div>

  <script src="weapon-store.js"></script>
  <script src="admin.js"></script>

</body>
</html>
```

**Step 2: Create `admin.js` (bootstrap + shared utilities only — the builder forms are Tasks 4-5)**

```js
// =============================================
// WEAPON ADMIN — builder UI for custom weapons
// and attachments. Reads/writes via WeaponStore
// (weapon-store.js). Self-contained: does not
// depend on app.js, dice.js, or roll20-bridge.js.
// =============================================

'use strict';

let BASE_WEAPON_CONFIG = null;

window.addEventListener('DOMContentLoaded', async () => {
  const resp = await fetch('config/weapons.json');
  BASE_WEAPON_CONFIG = await resp.json();

  renderCustomWeaponsList();
  renderCustomAttachmentsList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
});

function getAllWeapons() {
  return [...(BASE_WEAPON_CONFIG.weapons || []), ...WeaponStore.getCustomWeapons()];
}

function exportCustomItems() {
  const data = WeaponStore.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'custom-weapons-export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(str) {
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function uniqueId(baseId, existingIds) {
  let id = baseId;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `${baseId}_${n}`;
    n++;
  }
  return id;
}

// Stubs — replaced by Task 4 (weapons) and Task 5 (attachments).
function renderCustomWeaponsList() {
  document.getElementById('custom-weapons-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderWeaponForm(_existingWeapon) {}
function renderCustomAttachmentsList() {
  document.getElementById('custom-attachments-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderAttachmentForm(_existingAttachment) {}
```

**Step 3: Verify**

Static checks: `node --check admin.js` passes. If a browser is available, open `admin.html` directly (or via a static server), confirm the page loads with no console errors, the header/back-link/export button render, and clicking "Export Custom Items" downloads a file containing `{"weapons":[],"attachments":[]}` (since nothing's been created yet). If no browser is available, at minimum confirm via a throwaway Node script that `BASE_WEAPON_CONFIG` would load correctly (`JSON.parse(fs.readFileSync('config/weapons.json'))`) and that `escHtml`/`slugify`/`uniqueId` behave correctly in isolation (e.g. `slugify('My Custom Gun') === 'my_custom_gun'`, `uniqueId('foo', ['foo']) === 'foo_2'`).

**Step 4: Commit**

```bash
git add admin.html admin.js
git commit -m "feat: scaffold admin.html page with bootstrap and shared utilities"
```

---

### Task 4: Weapon builder form

**Files:**
- Modify: `admin.js` (replace the `renderCustomWeaponsList`/`renderWeaponForm` stubs; add `buildActionRowForm`)

**Step 1: Add the action-row sub-form builder**

Add to `admin.js`, above the stub functions being replaced:

```js
function buildActionRowForm(action = {}) {
  const row = document.createElement('div');
  row.className = 'admin-action-row';

  const type = action.is_reload ? 'reload'
    : action.burst_fire ? 'burst'
    : (action.area_of_effect != null || action.save_dv != null) ? 'area'
    : 'normal';

  row.innerHTML = `
    <div class="admin-action-row-fields">
      <input class="field-input" placeholder="Action label" data-f="label" value="${escHtml(action.label || '')}" style="flex:2">
      <select class="field-input" data-f="type" style="flex:1">
        <option value="normal" ${type === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="burst" ${type === 'burst' ? 'selected' : ''}>Burst Fire</option>
        <option value="area" ${type === 'area' ? 'selected' : ''}>Area Effect</option>
        <option value="reload" ${type === 'reload' ? 'selected' : ''}>Reload</option>
      </select>
      <button class="delete-item-btn" data-remove title="Remove action">✕</button>
    </div>
    <div class="admin-action-row-fields" data-non-reload>
      <input class="field-input" placeholder="Range" type="number" data-f="range" value="${action.range ?? ''}" style="flex:1">
      <input class="field-input" placeholder="Damage (e.g. 2d6)" data-f="damage" value="${escHtml(action.damage || '')}" style="flex:1">
      <input class="field-input" placeholder="Damage type (optional)" data-f="damage_type" value="${escHtml(action.damage_type || '')}" style="flex:1">
      <input class="field-input" placeholder="Ammo cost (optional)" type="number" data-f="ammo_cost" value="${action.ammo_cost ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-type-fields="burst">
      <input class="field-input" placeholder="Attack count" type="number" data-f="attack_count" value="${action.attack_count ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-type-fields="area">
      <input class="field-input" placeholder="Area of effect" type="number" data-f="area_of_effect" value="${action.area_of_effect ?? ''}" style="flex:1">
      <input class="field-input" placeholder="Save DV" type="number" data-f="save_dv" value="${action.save_dv ?? ''}" style="flex:1">
    </div>
  `;

  function updateVisibility() {
    const t = row.querySelector('[data-f="type"]').value;
    row.querySelector('[data-non-reload]').style.display = t === 'reload' ? 'none' : '';
    row.querySelectorAll('[data-type-fields]').forEach(el => {
      el.style.display = (el.dataset.typeFields === t) ? '' : 'none';
    });
  }
  row.querySelector('[data-f="type"]').addEventListener('change', updateVisibility);
  updateVisibility();

  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());

  row.readAction = function () {
    const get = sel => row.querySelector(`[data-f="${sel}"]`);
    const t = get('type').value;
    const label = get('label').value.trim();
    if (t === 'reload') {
      return { id: slugify(label), label, is_reload: true };
    }
    const a = {
      id: slugify(label),
      label,
      range: parseInt(get('range').value) || 0,
      damage: get('damage').value.trim() || '1d4'
    };
    if (get('damage_type').value.trim()) a.damage_type = get('damage_type').value.trim();
    const ammoCost = parseInt(get('ammo_cost').value);
    if (ammoCost) a.ammo_cost = ammoCost;
    if (t === 'burst') {
      a.burst_fire = true;
      a.attack_count = parseInt(get('attack_count').value) || 1;
    } else if (t === 'area') {
      a.area_of_effect = parseInt(get('area_of_effect').value) || 0;
      a.save_dv = parseInt(get('save_dv').value) || 0;
    }
    return a;
  };

  return row;
}
```

**Step 2: Replace the weapon-list/weapon-form stubs**

Replace:
```js
function renderCustomWeaponsList() {
  document.getElementById('custom-weapons-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderWeaponForm(_existingWeapon) {}
```

with:

```js
function renderCustomWeaponsList() {
  const wrap = document.getElementById('custom-weapons-list');
  wrap.innerHTML = '';
  const weapons = WeaponStore.getCustomWeapons();
  if (weapons.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  weapons.forEach(weapon => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    row.innerHTML = `
      <span class="admin-item-label">${escHtml(weapon.label)}</span>
      <span class="admin-item-meta">${weapon.actions.length} action${weapon.actions.length === 1 ? '' : 's'}</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      <button class="delete-item-btn" data-delete title="Delete">✕</button>
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderWeaponForm(weapon));
    row.querySelector('[data-delete]').addEventListener('click', () => {
      if (!confirm(`Delete custom weapon "${weapon.label}"?`)) return;
      WeaponStore.deleteCustomWeapon(weapon.id);
      renderCustomWeaponsList();
    });
    wrap.appendChild(row);
  });
}

function renderWeaponForm(existingWeapon) {
  const container = document.getElementById('weapon-form-container');
  container.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="w-label" value="${escHtml(existingWeapon?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Category</label>
        <input class="field-input" id="w-category" value="${escHtml(existingWeapon?.category || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Tags (comma-separated)</label>
        <input class="field-input" id="w-tags" value="${escHtml((existingWeapon?.tags || []).join(', '))}">
      </div>
      <div class="field-group">
        <label class="field-label">Magazine Size (blank = no magazine)</label>
        <input class="field-input" id="w-magsize" type="number" value="${existingWeapon?.magazine_size ?? ''}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Description</label>
      <textarea class="field-input" id="w-description">${escHtml(existingWeapon?.description || '')}</textarea>
    </div>
    <div class="section-header mt-md">Actions</div>
    <div id="w-actions-list"></div>
    <button class="btn btn-secondary mt-sm" id="w-add-action-btn">＋ Add Action</button>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="w-save-btn">Save Weapon</button>
      <button class="btn btn-secondary" id="w-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  const actionsList = document.getElementById('w-actions-list');
  (existingWeapon?.actions || []).forEach(a => actionsList.appendChild(buildActionRowForm(a)));

  document.getElementById('w-add-action-btn').addEventListener('click', () => {
    actionsList.appendChild(buildActionRowForm());
  });

  document.getElementById('w-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('w-save-btn').addEventListener('click', () => {
    const label = document.getElementById('w-label').value.trim();
    if (!label) { alert('Label is required.'); return; }

    const actionRows = Array.from(actionsList.children);
    if (actionRows.length === 0) { alert('At least one action is required.'); return; }
    const actions = actionRows.map(row => row.readAction());

    const officialIds = (BASE_WEAPON_CONFIG.weapons || []).map(w => w.id);
    const customIds = WeaponStore.getCustomWeapons().map(w => w.id).filter(id => id !== existingWeapon?.id);
    const id = existingWeapon?.id || uniqueId(slugify(label), [...officialIds, ...customIds]);

    const tags = document.getElementById('w-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    const magSizeRaw = document.getElementById('w-magsize').value;
    const magazine_size = magSizeRaw.trim() === '' ? null : (parseInt(magSizeRaw) || null);

    WeaponStore.saveCustomWeapon({
      id,
      label,
      category: document.getElementById('w-category').value.trim(),
      tags,
      description: document.getElementById('w-description').value.trim(),
      magazine_size,
      actions
    });

    container.innerHTML = '';
    renderCustomWeaponsList();
  });
}
```

**Step 3: Verify with a throwaway Node script**

DOM-shim load `admin.js` + `weapon-store.js` together (same pattern as prior plans' DOM-shim verification), with a fake `localStorage`, fake `fetch` returning `config/weapons.json`'s real content for `BASE_WEAPON_CONFIG`, and exercise:
- Calling `renderWeaponForm(null)`, then driving the rendered form's `#w-label` to `"Test Blade"`, adding one action row via `buildActionRowForm()`, setting that row's label/range/damage, then clicking `#w-save-btn` — confirm `WeaponStore.getCustomWeapons()` afterward has 1 entry with `id === 'test_blade'`, `label === 'Test Blade'`, and 1 action.
- Saving a weapon with NO actions added — confirm `alert` is invoked (stub `window.alert` to record calls) and `WeaponStore.getCustomWeapons()` remains unchanged (the early-return guard worked).
- Calling `renderWeaponForm(existingWeapon)` for an already-saved weapon, changing its label, saving again — confirm it upserts (still 1 entry, not 2) and the `id` stays the same as before (not re-slugified to a new id).
- A `buildActionRowForm()` row defaults to `type=normal`; changing the type select to `'burst'` then calling `.readAction()` should produce an object with `burst_fire: true` and an `attack_count`; changing to `'reload'` should produce `{id, label, is_reload: true}` with no other fields.

Delete the script after it passes.

**Step 4: Commit**

```bash
git add admin.js
git commit -m "feat: add custom weapon builder form with action-type-aware sub-rows"
```

---

### Task 5: Attachment builder form

**Files:**
- Modify: `admin.js` (replace the `renderCustomAttachmentsList`/`renderAttachmentForm` stubs; add `buildEffectRowForm`/`buildNoteRowForm`)

**Step 1: Add the effect-row and note-row sub-form builders**

```js
const EFFECT_TYPE_FIELDS = {
  set_magazine_size: ['value', 'weapon'],
  add_tag: ['tag'],
  remove_tag: ['tag'],
  action_hit_bonus: ['action', 'value'],
  action_save_dv_bonus: ['action', 'value'],
  remove_burst_disadvantage: []
};

function buildEffectRowForm(effect = {}, allWeapons) {
  const row = document.createElement('div');
  row.className = 'admin-action-row';
  const type = effect.type || 'add_tag';

  const weaponOptions = allWeapons.map(w =>
    `<option value="${w.id}" ${effect.weapon === w.id ? 'selected' : ''}>${escHtml(w.label)}</option>`
  ).join('');

  row.innerHTML = `
    <div class="admin-action-row-fields">
      <select class="field-input" data-f="type" style="flex:2">
        ${Object.keys(EFFECT_TYPE_FIELDS).map(t =>
          `<option value="${t}" ${type === t ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`
        ).join('')}
      </select>
      <button class="delete-item-btn" data-remove title="Remove effect">✕</button>
    </div>
    <div class="admin-action-row-fields" data-fields="value">
      <input class="field-input" placeholder="Value" type="number" data-f="value" value="${effect.value ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="tag">
      <input class="field-input" placeholder="Tag name" data-f="tag" value="${escHtml(effect.tag || '')}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="action">
      <input class="field-input" placeholder="Action id (e.g. single_shot)" data-f="action" value="${escHtml(effect.action || '')}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="weapon">
      <select class="field-input" data-f="weapon" style="flex:1">
        <option value="">(applies to any compatible weapon)</option>
        ${weaponOptions}
      </select>
    </div>
  `;

  function updateVisibility() {
    const t = row.querySelector('[data-f="type"]').value;
    const shownFields = EFFECT_TYPE_FIELDS[t] || [];
    row.querySelectorAll('[data-fields]').forEach(el => {
      el.style.display = shownFields.includes(el.dataset.fields) ? '' : 'none';
    });
  }
  row.querySelector('[data-f="type"]').addEventListener('change', updateVisibility);
  updateVisibility();
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());

  row.readEffect = function () {
    const t = row.querySelector('[data-f="type"]').value;
    const eff = { type: t };
    const fields = EFFECT_TYPE_FIELDS[t] || [];
    if (fields.includes('value')) eff.value = parseInt(row.querySelector('[data-f="value"]').value) || 0;
    if (fields.includes('tag')) eff.tag = row.querySelector('[data-f="tag"]').value.trim();
    if (fields.includes('action')) eff.action = row.querySelector('[data-f="action"]').value.trim();
    if (fields.includes('weapon')) {
      const w = row.querySelector('[data-f="weapon"]').value;
      if (w) eff.weapon = w;
    }
    return eff;
  };

  return row;
}

function buildNoteRowForm(note = '') {
  const row = document.createElement('div');
  row.className = 'admin-action-row-fields';
  row.innerHTML = `
    <input class="field-input" placeholder="Note text" data-note value="${escHtml(note)}" style="flex:1">
    <button class="delete-item-btn" data-remove title="Remove note">✕</button>
  `;
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  row.readNote = function () { return row.querySelector('[data-note]').value.trim(); };
  return row;
}
```

**Step 2: Replace the attachment-list/attachment-form stubs**

Replace:
```js
function renderCustomAttachmentsList() {
  document.getElementById('custom-attachments-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderAttachmentForm(_existingAttachment) {}
```

with:

```js
function renderCustomAttachmentsList() {
  const wrap = document.getElementById('custom-attachments-list');
  wrap.innerHTML = '';
  const attachments = WeaponStore.getCustomAttachments();
  if (attachments.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  attachments.forEach(att => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    row.innerHTML = `
      <span class="admin-item-label">${escHtml(att.label)}</span>
      <span class="admin-item-meta">${(att.compatible_weapons || []).length} compatible weapon(s)</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      <button class="delete-item-btn" data-delete title="Delete">✕</button>
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderAttachmentForm(att));
    row.querySelector('[data-delete]').addEventListener('click', () => {
      if (!confirm(`Delete custom attachment "${att.label}"?`)) return;
      WeaponStore.deleteCustomAttachment(att.id);
      renderCustomAttachmentsList();
    });
    wrap.appendChild(row);
  });
}

function renderAttachmentForm(existingAttachment) {
  const container = document.getElementById('attachment-form-container');
  container.innerHTML = '';

  const allWeapons = getAllWeapons();

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="a-label" value="${escHtml(existingAttachment?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Category</label>
        <input class="field-input" id="a-category" value="${escHtml(existingAttachment?.category || '')}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Description</label>
      <textarea class="field-input" id="a-description">${escHtml(existingAttachment?.description || '')}</textarea>
    </div>
    <div class="section-header mt-md">Compatible Weapons</div>
    <select class="field-input" id="a-compatible" multiple size="6">
      ${allWeapons.map(w =>
        `<option value="${w.id}" ${(existingAttachment?.compatible_weapons || []).includes(w.id) ? 'selected' : ''}>${escHtml(w.label)}</option>`
      ).join('')}
    </select>
    <div class="section-header mt-md">Effects</div>
    <div id="a-effects-list"></div>
    <button class="btn btn-secondary mt-sm" id="a-add-effect-btn">＋ Add Effect</button>
    <div class="section-header mt-md">Notes</div>
    <div id="a-notes-list"></div>
    <button class="btn btn-secondary mt-sm" id="a-add-note-btn">＋ Add Note</button>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="a-save-btn">Save Attachment</button>
      <button class="btn btn-secondary" id="a-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  const effectsList = document.getElementById('a-effects-list');
  (existingAttachment?.effects || []).forEach(e => effectsList.appendChild(buildEffectRowForm(e, allWeapons)));
  document.getElementById('a-add-effect-btn').addEventListener('click', () => {
    effectsList.appendChild(buildEffectRowForm({}, allWeapons));
  });

  const notesList = document.getElementById('a-notes-list');
  (existingAttachment?.notes || []).forEach(n => notesList.appendChild(buildNoteRowForm(n)));
  document.getElementById('a-add-note-btn').addEventListener('click', () => {
    notesList.appendChild(buildNoteRowForm());
  });

  document.getElementById('a-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('a-save-btn').addEventListener('click', () => {
    const label = document.getElementById('a-label').value.trim();
    if (!label) { alert('Label is required.'); return; }

    const officialIds = (BASE_WEAPON_CONFIG.attachments || []).map(a => a.id);
    const customIds = WeaponStore.getCustomAttachments().map(a => a.id).filter(id => id !== existingAttachment?.id);
    const id = existingAttachment?.id || uniqueId(slugify(label), [...officialIds, ...customIds]);

    const compatible_weapons = Array.from(document.getElementById('a-compatible').selectedOptions).map(o => o.value);
    const effects = Array.from(effectsList.children).map(row => row.readEffect());
    const notes = Array.from(notesList.children).map(row => row.readNote()).filter(Boolean);

    WeaponStore.saveCustomAttachment({
      id,
      label,
      category: document.getElementById('a-category').value.trim(),
      compatible_weapons,
      description: document.getElementById('a-description').value.trim(),
      effects,
      notes
    });

    container.innerHTML = '';
    renderCustomAttachmentsList();
  });
}
```

**Step 3: Verify with a throwaway Node script**

Same DOM-shim pattern as Task 4. Exercise:
- `renderAttachmentForm(null)`, set label to `"Test Scope"`, select one compatible weapon (e.g. an official `machine_pistol` id from the real `config/weapons.json`), add one effect row via `buildEffectRowForm({}, allWeapons)`, change its type to `action_hit_bonus`, set `action` to `single_shot` and `value` to `2`, save — confirm `WeaponStore.getCustomAttachments()` has 1 entry with the right `compatible_weapons`, `effects: [{type:'action_hit_bonus', action:'single_shot', value:2}]`.
- Add a note via `buildNoteRowForm()`, set its text, save — confirm `notes` array contains it; confirm an empty/blank note row is filtered out (not saved as `""`).
- `buildEffectRowForm` with type `remove_burst_disadvantage` — confirm `.readEffect()` returns `{type: 'remove_burst_disadvantage'}` with no extra fields (since `EFFECT_TYPE_FIELDS.remove_burst_disadvantage` is `[]`).
- Edit-then-resave an existing custom attachment — confirm upsert (not duplicate), same `id`.

Delete the script after it passes.

**Step 4: Commit**

```bash
git add admin.js
git commit -m "feat: add custom attachment builder form with typed effect rows"
```

---

### Task 6: CSS for the admin page

**Files:**
- Modify: `style.css` (add a new ADMIN PAGE section; add `.roster-admin-link`)

**Step 1: Add `.roster-admin-link`**

Find the `.roster-subtitle`/`.roster-grid` CSS (search for `.roster-subtitle`) and add nearby:

```css
.roster-admin-link {
  display: block;
  text-align: center;
  margin-top: var(--space-lg);
  color: var(--text-muted);
  font-size: 0.8rem;
  text-decoration: none;
}

.roster-admin-link:hover {
  color: var(--gold);
}
```

**Step 2: Add the ADMIN PAGE CSS block**

Add a new section near the end of `style.css` (before the final media-query blocks, or wherever a new top-level component section fits the file's existing organization):

```css
/* =============================================
   ADMIN PAGE (admin.html)
   ============================================= */
.admin-form {
  background: var(--bg-card);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin-top: var(--space-sm);
}

.admin-item-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-bottom: 1px solid var(--border-subtle);
}

.admin-item-label {
  flex: 1;
  font-weight: 600;
  color: var(--text-primary);
}

.admin-item-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.admin-action-row {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: var(--space-sm);
  margin-bottom: var(--space-sm);
}

.admin-action-row-fields {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
  flex-wrap: wrap;
}

.admin-action-row-fields:last-child { margin-bottom: 0; }
```

**Step 3: Verify**

If a browser is available, open `admin.html`, click "+ New Weapon", confirm the form renders legibly, switching an action row's type toggles the right fields visible/hidden with no layout breakage, and the "+ New Attachment" form's compatible-weapons multi-select and effect rows render similarly. Check a narrow/mobile viewport doesn't overflow badly (this page reuses `.tab-content`'s existing responsive max-width/padding rules, so it should inherit reasonable behavior, but actually look).

If no browser is available, at minimum re-run `node --check` is not applicable to CSS — instead do a brace-balance sanity check and confirm via `grep` that every new class name used in `admin.js`'s template strings (`admin-form`, `admin-item-row`, `admin-item-label`, `admin-item-meta`, `admin-action-row`, `admin-action-row-fields`) has a corresponding rule in `style.css`.

**Step 4: Commit**

```bash
git add style.css
git commit -m "style: add admin page CSS and roster-screen admin link"
```

---

### Task 7: Full regression smoke test

**Files:** none (verification only)

**Step 1: End-to-end flow, real browser if available**

Open `index.html`'s roster screen, confirm the "⚙ Manage Weapons" link is visible and navigates to `admin.html`. On `admin.html`: build a custom ranged weapon with a magazine size and at least one Normal action and one Burst Fire action; build a custom attachment compatible with that weapon with one `action_hit_bonus` effect and one note. Save both. Confirm both appear in their respective lists with Edit/Delete working.

Navigate back to `index.html`, open a character, go to the Combat tab, open "+ Add Weapon" — confirm the custom weapon appears in the dropdown prefixed with "🔧 ". Add it, confirm its action rows render correctly (including the Burst Fire action sending multiple rolls per the existing burst logic from the prior plan — this is pre-existing code, just confirming it works against a custom weapon too). Open its Attachments section, confirm the custom attachment appears (also "🔧 " prefixed) in the compatible-and-not-equipped list, equip it, confirm the hit bonus is reflected in the Attack roll's formula.

Reload the page — confirm both the character's equipped custom weapon/attachment AND the admin page's custom-items list (on a separate reload of `admin.html`) persisted via `localStorage`.

Back on `admin.html`, click "Export Custom Items" — confirm a `.json` file downloads, open it, confirm its shape is `{"weapons": [...], "attachments": [...]}` containing exactly the custom items created (not the official dictionary), and that this shape is directly compatible with being appended into `config/weapons.json`'s existing `weapons`/`attachments` arrays.

**Step 2: Regression check on existing functionality**

Confirm nothing from the prior `weapon-attachment-config` work regressed: add an official (non-custom) weapon, confirm it has no "🔧 " prefix and behaves identically to before this plan (no behavior change for official items). Confirm the Ability/Skill/Initiative roll buttons and the Advantage modal are completely unaffected (this plan touched only the bootstrap's `WEAPON_CONFIG` assignment and two dropdown template strings in `app.js` — nothing else).

**Step 3: Static checks**

```bash
node --check weapon-store.js
node --check admin.js
node --check app.js
node -e "JSON.parse(require('fs').readFileSync('config/weapons.json','utf8'))"
git status
```

All should pass cleanly with no uncommitted changes.

**Step 4: Report**

Summarize what was tested, how (real browser vs. simulated), and any bugs found. If none found, this branch is ready to merge.
