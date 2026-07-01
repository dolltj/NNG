# Admin Perks Section Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Perks section to `admin.html` where official perks can be viewed and edited (creating local overrides) and new custom perks can be created, mirroring the existing weapons/attachments management UX.

**Architecture:** Extend `weapon-store.js` with perk CRUD + `getPerksMergedConfig` (using the existing `_mergeList` helper, same id-keyed override pattern as weapons/attachments). `admin.html`/`admin.js` get a new Perks section with `renderPerksList`/`renderPerkForm` following the same Official/Edited/Custom badge + Delete/Revert pattern. `app.js` merges custom perks into `PERKS_CONFIG` at bootstrap (one new line) and shows a `🔧` prefix for custom perks in the in-game dictionary dropdown.

**Tech Stack:** Plain JS/HTML/CSS, no framework, no build step, no permanent test suite (this project's established convention — verification via throwaway Node scripts, deleted after passing).

Execution happens in a dedicated worktree (`.worktrees/admin-perks`, branch `admin-perks`), set up by the controlling session before Task 1 is dispatched, per `superpowers:using-git-worktrees`. All file paths below are relative to that worktree root.

---

### Task 1: Extend `weapon-store.js` with perk CRUD + merge

**Files:**
- Modify: `weapon-store.js`

**Step 1: Add the perk storage key, private load/save helpers, and CRUD functions**

Inside the IIFE, after the existing `const STORAGE_KEY = 'ttrpg_custom_weapon_config';` line, add:

```js
  const PERK_STORAGE_KEY = 'ttrpg_custom_perk_config';

  function _loadPerks() {
    try {
      const raw = localStorage.getItem(PERK_STORAGE_KEY);
      const parsed = JSON.parse(raw || 'null');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function _savePerks(perks) {
    localStorage.setItem(PERK_STORAGE_KEY, JSON.stringify(perks));
  }

  function getCustomPerks() {
    return _loadPerks();
  }

  function saveCustomPerk(perk) {
    const perks = _loadPerks();
    const idx = perks.findIndex(p => p.id === perk.id);
    if (idx >= 0) perks[idx] = perk; else perks.push(perk);
    _savePerks(perks);
  }

  function deleteCustomPerk(id) {
    _savePerks(_loadPerks().filter(p => p.id !== id));
  }

  function getPerksMergedConfig(basePerks) {
    return _mergeList(basePerks, _loadPerks());
  }
```

Note: `getPerksMergedConfig` reuses the existing private `_mergeList` helper (already in the file) — no duplication needed.

**Step 2: Update `exportAll` to include perks**

Change:
```js
  function exportAll() {
    return _load();
  }
```
to:
```js
  function exportAll() {
    const wa = _load();
    return { weapons: wa.weapons, attachments: wa.attachments, perks: _loadPerks() };
  }
```

**Step 3: Export the four new perk functions**

Change the `window.WeaponStore = { ... }` block from:
```js
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
```
to:
```js
  window.WeaponStore = {
    getCustomWeapons,
    getCustomAttachments,
    saveCustomWeapon,
    saveCustomAttachment,
    deleteCustomWeapon,
    deleteCustomAttachment,
    getMergedConfig,
    getCustomPerks,
    saveCustomPerk,
    deleteCustomPerk,
    getPerksMergedConfig,
    exportAll
  };
```

**Step 4: Verify with a throwaway Node script**

Load `weapon-store.js` into a vm sandbox with a fake `localStorage`. Exercise:
- Empty store: `getCustomPerks()` returns `[]`.
- `saveCustomPerk({id:'custom_blade', name:'Custom Blade', level:1, ...})` → `getCustomPerks()` returns 1 entry.
- `saveCustomPerk({id:'custom_blade', ...changed field...})` → upserts (still 1 entry, updated).
- `deleteCustomPerk('custom_blade')` → `getCustomPerks()` returns `[]`.
- `getPerksMergedConfig([{id:'a', name:'A Official', level:1, effect:'...', action:null}, {id:'b', name:'B', level:2, effect:'...', action:null}])` with a custom store having an override for `'a'` and a new perk `'c'`: result has 3 entries, `a` is at index 0 with `_overridden:true`, `b` at index 1 with no flag, `c` appended with `_custom:true`.
- `exportAll()` with weapons/attachments already in their stores returns `{weapons:[...], attachments:[...], perks:[...]}` (all three keys present, existing weapons/attachments unaffected).
- `Object.keys(window.WeaponStore)` equals exactly 12 expected names (the original 8 + 4 new perk functions).

Delete the script after it passes.

**Step 5: Commit**

```bash
git add weapon-store.js
git commit -m "feat: extend weapon-store.js with perk CRUD and merge for admin perks section"
```

---

### Task 2: Add Perks section to `admin.html`

**Files:**
- Modify: `admin.html`

**Step 1: Update title and description, add Perks section**

Change the `<title>` from:
```html
  <title>Weapon Admin — NNG Sheet</title>
```
to:
```html
  <title>Config Admin — NNG Sheet</title>
```

Change the `<meta name="description">` from:
```html
  <meta name="description" content="Builder for custom weapons and attachments for the NNG character sheet.">
```
to:
```html
  <meta name="description" content="Builder for custom weapons, attachments, and perks for the NNG character sheet.">
```

Change the `<h1>` in the header from:
```html
      <h1 class="top-bar-title">Weapon &amp; Attachment Admin</h1>
```
to:
```html
      <h1 class="top-bar-title">Config Admin</h1>
```

After the existing attachment section (the closing `</div>` of `attachment-form-container`), add:
```html
      <div class="section-header mt-lg">Perks</div>
      <div id="perks-list"></div>
      <button class="btn btn-primary mt-md" id="new-perk-btn">＋ New Perk</button>
      <div id="perk-form-container"></div>
```

Full expected `<main>` after this task:
```html
    <main class="tab-content">
      <div class="section-header">Weapons</div>
      <div id="weapons-list"></div>
      <button class="btn btn-primary mt-md" id="new-weapon-btn">＋ New Weapon</button>
      <div id="weapon-form-container"></div>

      <div class="section-header mt-lg">Attachments</div>
      <div id="attachments-list"></div>
      <button class="btn btn-primary mt-md" id="new-attachment-btn">＋ New Attachment</button>
      <div id="attachment-form-container"></div>

      <div class="section-header mt-lg">Perks</div>
      <div id="perks-list"></div>
      <button class="btn btn-primary mt-md" id="new-perk-btn">＋ New Perk</button>
      <div id="perk-form-container"></div>
    </main>
```

**Step 2: Verify**

```bash
node -e "
const html = require('fs').readFileSync('admin.html', 'utf8');
console.log(
  html.includes('id=\"perks-list\"'),
  html.includes('id=\"perk-form-container\"'),
  html.includes('id=\"new-perk-btn\"'),
  html.includes('Config Admin')
)"
```
Expected: `true true true true`

**Step 3: Commit**

```bash
git add admin.html
git commit -m "chore: add perks section to admin.html, rename to Config Admin"
```

---

### Task 3: Wire perks into `admin.js`

**Files:**
- Modify: `admin.js`

Read the current `admin.js` carefully before editing to confirm exact line numbers (which may differ slightly from when this plan was written). Key landmarks: `let BASE_WEAPON_CONFIG = null;` near the top; the `DOMContentLoaded` handler (lines ~12-23); `getAllWeapons()`/`getAllAttachments()` functions; the end of file after `renderAttachmentsList()` closes.

**Step 1: Add `BASE_PERK_CONFIG` global**

After `let BASE_WEAPON_CONFIG = null;`, add:
```js
let BASE_PERK_CONFIG = null;
```

**Step 2: Add perk fetch + button wiring to the bootstrap handler**

Inside `DOMContentLoaded`, after the existing weapon-config fetch block and before the existing `renderWeaponsList();` call, add a perk-config fetch:

Change the current bootstrap from:
```js
window.addEventListener('DOMContentLoaded', async () => {
  const resp = await fetch('config/weapons.json');
  if (!resp.ok) throw new Error(`Failed to load config/weapons.json: ${resp.status}`);
  BASE_WEAPON_CONFIG = await resp.json();

  renderWeaponsList();
  renderAttachmentsList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
});
```
to:
```js
window.addEventListener('DOMContentLoaded', async () => {
  const resp = await fetch('config/weapons.json');
  if (!resp.ok) throw new Error(`Failed to load config/weapons.json: ${resp.status}`);
  BASE_WEAPON_CONFIG = await resp.json();

  const perkResp = await fetch('config/perks.json');
  if (!perkResp.ok) throw new Error(`Failed to load config/perks.json: ${perkResp.status}`);
  BASE_PERK_CONFIG = await perkResp.json();

  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('new-perk-btn').addEventListener('click', () => renderPerkForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
});
```

**Step 3: Add `getAllPerks()` alongside the other `getAll*` helpers**

After the existing `getAllAttachments()` function, add:
```js
function getAllPerks() {
  return WeaponStore.getPerksMergedConfig(BASE_PERK_CONFIG);
}
```

**Step 4: Add `renderPerksList()` and `renderPerkForm()` at the end of the file (after line 482, the closing `}` of `renderAttachmentForm`)**

```js
function renderPerksList() {
  const wrap = document.getElementById('perks-list');
  wrap.innerHTML = '';
  const perks = getAllPerks();
  if (perks.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  perks.forEach(perk => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    const badge = perk._overridden
      ? '<span class="admin-item-badge badge-edited">Edited</span>'
      : perk._custom
        ? ''
        : '<span class="admin-item-badge badge-official">Official</span>';
    const canDelete = perk._overridden || perk._custom;
    const deleteBtnHtml = canDelete
      ? `<button class="delete-item-btn" data-delete title="${perk._overridden ? 'Revert to official version' : 'Delete'}">✕</button>`
      : '';
    row.innerHTML = `
      <span class="admin-item-label">${perk._custom ? '🔧 ' : ''}${escHtml(perk.name)}</span>
      ${badge}
      <span class="admin-item-meta">Lv ${perk.level}</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      ${deleteBtnHtml}
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderPerkForm(perk));
    const deleteBtn = row.querySelector('[data-delete]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const msg = perk._overridden
          ? `Revert "${perk.name}" to its official version?`
          : `Delete custom perk "${perk.name}"?`;
        if (!confirm(msg)) return;
        WeaponStore.deleteCustomPerk(perk.id);
        renderPerksList();
      });
    }
    wrap.appendChild(row);
  });
}

function renderPerkForm(existingPerk) {
  const container = document.getElementById('perk-form-container');
  container.innerHTML = '';

  const actionType = existingPerk?.action?.type || 'none';

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" id="p-name" value="${escHtml(existingPerk?.name || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Level</label>
        <input class="field-input" id="p-level" type="number" min="1" max="99" value="${existingPerk?.level ?? 1}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Prerequisite</label>
      <input class="field-input" id="p-prerequisite" value="${escHtml(existingPerk?.prerequisite || '')}">
    </div>
    <div class="field-group">
      <label class="field-label">Effect</label>
      <textarea class="field-input" id="p-effect">${escHtml(existingPerk?.effect || '')}</textarea>
    </div>
    <div class="section-header mt-md">Granted Action (optional)</div>
    <div class="field-group">
      <label class="field-label">Type</label>
      <select class="field-input" id="p-action-type">
        <option value="none" ${actionType === 'none' ? 'selected' : ''}>None</option>
        <option value="Action" ${actionType === 'Action' ? 'selected' : ''}>Action</option>
        <option value="Reaction" ${actionType === 'Reaction' ? 'selected' : ''}>Reaction</option>
        <option value="Quick Action" ${actionType === 'Quick Action' ? 'selected' : ''}>Quick Action</option>
      </select>
    </div>
    <div id="p-action-fields">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="p-action-label" value="${escHtml(existingPerk?.action?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="p-action-text">${escHtml(existingPerk?.action?.text || '')}</textarea>
      </div>
    </div>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="p-save-btn">Save Perk</button>
      <button class="btn btn-secondary" id="p-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  function updateActionVisibility() {
    const show = document.getElementById('p-action-type').value !== 'none';
    document.getElementById('p-action-fields').style.display = show ? '' : 'none';
  }
  document.getElementById('p-action-type').addEventListener('change', updateActionVisibility);
  updateActionVisibility();

  document.getElementById('p-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('p-save-btn').addEventListener('click', () => {
    const name = document.getElementById('p-name').value.trim();
    if (!name) { alert('Name is required.'); return; }

    const officialIds = (BASE_PERK_CONFIG || []).map(p => p.id);
    const customIds = WeaponStore.getCustomPerks().map(p => p.id).filter(id => id !== existingPerk?.id);
    // Reusing existingPerk.id here is what turns "Edit" on an Official row
    // into an override (see getPerksMergedConfig in weapon-store.js) —
    // there's no separate "create override" action, this line IS it.
    const id = existingPerk?.id || uniqueId(slugify(name), [...officialIds, ...customIds]);

    const type = document.getElementById('p-action-type').value;
    const action = type === 'none' ? null : {
      type,
      label: document.getElementById('p-action-label').value.trim(),
      text: document.getElementById('p-action-text').value.trim()
    };

    WeaponStore.saveCustomPerk({
      id,
      name,
      level: parseInt(document.getElementById('p-level').value) || 1,
      prerequisite: document.getElementById('p-prerequisite').value.trim(),
      effect: document.getElementById('p-effect').value.trim(),
      action
    });

    container.innerHTML = '';
    renderPerksList();
  });
}
```

**Step 5: Verify with a throwaway Node script**

Use the same vm-based DOM-shim approach established in prior plans. Load real `weapon-store.js` + `admin.js` together with a minimal `document`/`localStorage`/`fetch` shim (`fetch('config/weapons.json')` resolves the real weapons.json, `fetch('config/perks.json')` resolves the real perks.json). Exercise:

- On clean load, `renderPerksList()` shows all 15 official perks, each with an "Official" badge and no delete button.
- Edit "Tough as Nails" (a null-action official perk), change its effect text, save → `WeaponStore.getCustomPerks()` has 1 entry with `id: 'tough_as_nails'`. Re-render → row shows "Edited" badge, updated effect, revert button.
- Revert "Tough as Nails" → `WeaponStore.getCustomPerks()` is empty, row shows "Official" badge again.
- Create new custom perk "Iron Will" (no action, level 1) → appears with 🔧 prefix, no badge, "Delete" button.
- Open perk form with an official Action perk (e.g. "Adrenaline Rush"): action type select shows "Action", label/text fields are visible with existing values.
- Open perk form with a null-action perk (e.g. "Tough as Nails"): action type select shows "None", label/text fields are hidden.
- `node --check admin.js` passes.

Delete the script after it passes.

**Step 6: Commit**

```bash
git add admin.js
git commit -m "feat: add perks list and builder form to admin.js"
```

---

### Task 4: Wire perks merge into `app.js` bootstrap + add 🔧 prefix in dropdown

**Files:**
- Modify: `app.js:30-31` (bootstrap) and `app.js:1327` (dictionary dropdown option template)

Read the current `app.js` to confirm exact line numbers before editing.

**Step 1: Add the bootstrap merge line**

After `PERKS_CONFIG = await loadConfig(PERKS_CONFIG_URL);` (currently line 30), add:
```js
  PERKS_CONFIG = window.WeaponStore.getPerksMergedConfig(PERKS_CONFIG);
```

Bootstrap block should now read:
```js
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  WEAPON_CONFIG = await loadConfig(WEAPONS_CONFIG_URL);
  WEAPON_CONFIG = window.WeaponStore.getMergedConfig(WEAPON_CONFIG);
  PERKS_CONFIG = await loadConfig(PERKS_CONFIG_URL);
  PERKS_CONFIG = window.WeaponStore.getPerksMergedConfig(PERKS_CONFIG);
  loadAllCharacters();
  renderRoster();
});
```

**Step 2: Add 🔧 prefix for custom perks in the dictionary dropdown**

Find the dropdown option template inside `buildPerksList` (currently around line 1327):
```js
      ${eligiblePerks.map(p => `<option value="${p.id}">Lv ${p.level} — ${escHtml(p.name)}</option>`).join('')}
```

Change to:
```js
      ${eligiblePerks.map(p => `<option value="${p.id}">Lv ${p.level} — ${p._custom ? '🔧 ' : ''}${escHtml(p.name)}</option>`).join('')}
```

**Step 3: Verify**

```bash
node --check app.js
grep -n "getPerksMergedConfig\|🔧.*_custom" app.js
```
Expected: syntax clean, grep shows both the bootstrap merge line and the updated dropdown option template.

Also write a small throwaway Node vm script verifying that after the bootstrap simulation, `PERKS_CONFIG` from `getPerksMergedConfig` includes both official perks (unflagged) and a sample custom perk (`_custom: true`), with the dropdown option template for the custom one containing "🔧 " while official ones don't.

Delete the script after it passes.

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: merge custom perks into PERKS_CONFIG at bootstrap, flag custom perks in dropdown"
```

---

### Task 5: Full regression smoke test (verification only, no code changes)

**Step 1: Real-browser end-to-end pass (if a browser is available)**

1. Open `admin.html`. Confirm 3 sections: Weapons, Attachments, Perks. The Perks list shows all 15 official perks with "Official" badges and no delete buttons.
2. Edit "Speed Freak" (level 2, null-action perk) — change its effect text. Save. Confirm "Edited" badge and revert button appear.
3. Open `index.html`, create a character, go to Character tab. Confirm "Speed Freak" appears in the perk dictionary dropdown with the updated effect text when selected and added.
4. Back in `admin.html`, revert "Speed Freak" — confirm it returns to "Official" badge and original text.
5. Create a new custom perk "Iron Will" (level 1, no action). Confirm it appears with 🔧 prefix, no badge, "Delete" button.
6. In `index.html`, go to Character tab, confirm "🔧 Iron Will" appears in the perk dictionary dropdown (since it's a `_custom` perk).
7. Export Custom Items — confirm the downloaded JSON contains `{weapons:[], attachments:[], perks:[{id:'iron_will',...}]}` (weapons/attachments empty if none created this session, perks has the new custom one).
8. Back in `admin.html`, edit "Adrenaline Rush" (level 1, has an Action). Confirm the form shows "Action" pre-selected in the type dropdown and the label/text fields are visible. Change the action label. Save. Confirm "Edited" badge.
9. Revert "Adrenaline Rush", delete "Iron Will". Confirm the Perks list returns to all-Official.

**Step 2: Regression check on pre-existing functionality**

- Weapons/Attachments lists in admin.html still work: Edit, create custom, delete, revert all function as before.
- In-game (index.html): Ability/Skill/Initiative rolls, Combat tab (weapon cards, attack rolls, Burst Fire behavior), Perks dictionary dropdown (official perks still appear at correct levels, level filter toggle still works), all unaffected.
- Existing character data (including previously-saved perks from `char.perks`) loads and saves correctly.

**Step 3: Static checks**

```bash
node --check app.js
node --check admin.js
node --check weapon-store.js
node -e "JSON.parse(require('fs').readFileSync('config/perks.json')); console.log('perks.json OK')"
node -e "JSON.parse(require('fs').readFileSync('config/weapons.json')); console.log('weapons.json OK')"
```

---

## After all tasks: final review and merge

Per `superpowers:subagent-driven-development`, after Task 5 passes, dispatch one final whole-branch code reviewer before using `superpowers:finishing-a-development-branch` to merge. After pushing, confirm the GitHub Pages deployment triggered and succeeded (check the Actions tab) — don't assume a successful `git push` alone means it's live.
