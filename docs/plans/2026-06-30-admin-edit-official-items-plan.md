# Edit Official Weapons/Attachments in admin.html Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let `admin.html` show official weapons/attachments alongside custom ones, with Edit producing a local override that takes effect in-game immediately, and Delete on an overridden item reverting it to the official version.

**Architecture:** `weapon-store.js`'s `getMergedConfig` changes from plain concatenation to an id-keyed merge (override-by-id instead of always-append), tagging genuinely-new items `_custom: true` (unchanged) and items that override a matching official id `_overridden: true` (new). `admin.html`'s two list sections render the merged list instead of `WeaponStore.getCustomWeapons()`/`getCustomAttachments()` alone, with a small badge per row (Official/Edited, no badge for Custom which keeps its existing 🔧 prefix) and Delete only shown for Edited/Custom rows. No changes needed to `index.html`/`app.js` — `_overridden` is never read there, so an edited official item looks and behaves exactly like the official item always did, just with updated stats.

**Tech Stack:** Plain JS/HTML/CSS, no framework, no build step, no permanent test suite (this project's established convention — verification is via throwaway Node scripts, deleted after passing).

Execution happens in a dedicated worktree (`.worktrees/admin-edit-official-items`, branch `admin-edit-official-items`), set up by the controlling session before Task 1 is dispatched, per `superpowers:using-git-worktrees`. All file paths below are relative to that worktree root.

---

### Task 1: Id-keyed merge in `weapon-store.js`

**Files:**
- Modify: `weapon-store.js:67-79` (the `getMergedConfig` function)

**Step 1: Replace `getMergedConfig`**

Current code:

```js
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
```

Replace with:

```js
  function _mergeList(officialList, customList) {
    const merged = (officialList || []).map(item => ({ ...item }));
    const newItems = [];
    customList.forEach(item => {
      const idx = merged.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        merged[idx] = { ...item, _overridden: true };
      } else {
        newItems.push({ ...item, _custom: true });
      }
    });
    return [...merged, ...newItems];
  }

  function getMergedConfig(baseConfig) {
    const custom = _load();
    return {
      weapons: _mergeList(baseConfig.weapons, custom.weapons),
      attachments: _mergeList(baseConfig.attachments, custom.attachments)
    };
  }
```

`_mergeList` is a new private helper (not exported on `window.WeaponStore`), shared by both the weapons and attachments merge. An official item with no matching custom entry passes through as a plain shallow copy — no `_custom`/`_overridden` flag, which is what makes it render as "Official" in admin.js later. An official item WITH a matching custom-store id is replaced in-place (same array position, preserving dropdown ordering) and tagged `_overridden: true`. A custom-store item with no matching official id is appended at the end and tagged `_custom: true`, exactly as before.

**Step 2: Verify with a throwaway Node script**

```js
// scratchpad/verify-merge.js
const fs = require('fs');
const path = '/tmp/weapon-store-test.js'; // adjust to your scratchpad path
// Load the real weapon-store.js into a sandboxed context with a fake localStorage.
const vm = require('vm');
const src = fs.readFileSync('weapon-store.js', 'utf8');

function makeSandbox(storageData) {
  const store = { ...storageData };
  const sandbox = {
    localStorage: {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; }
    },
    window: {}
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}

// Scenario: official has weapons [a, b]. Custom store has an override for 'a'
// (different label) and a brand new weapon 'c'. No existing custom-only collisions.
const customData = {
  ttrpg_custom_weapon_config: JSON.stringify({
    weapons: [
      { id: 'a', label: 'A Overridden', category: 'Melee', tags: [], actions: [{ id: 'x', label: 'X', range: 1, damage: '1d4' }] },
      { id: 'c', label: 'C New', category: 'Ranged', tags: [], actions: [{ id: 'y', label: 'Y', range: 10, damage: '1d6' }] }
    ],
    attachments: []
  })
};
const sandbox = makeSandbox(customData);
const baseConfig = {
  weapons: [
    { id: 'a', label: 'A Official', category: 'Melee', tags: [], actions: [] },
    { id: 'b', label: 'B Official', category: 'Melee', tags: [], actions: [] }
  ],
  attachments: []
};
const merged = sandbox.window.WeaponStore.getMergedConfig(baseConfig);

console.assert(merged.weapons.length === 3, `expected 3 weapons, got ${merged.weapons.length}`);
const a = merged.weapons.find(w => w.id === 'a');
const b = merged.weapons.find(w => w.id === 'b');
const c = merged.weapons.find(w => w.id === 'c');
console.assert(a.label === 'A Overridden', `a.label wrong: ${a.label}`);
console.assert(a._overridden === true, 'a should be _overridden');
console.assert(a._custom === undefined, 'a should NOT be _custom');
console.assert(b.label === 'B Official', `b.label wrong: ${b.label}`);
console.assert(b._overridden === undefined && b._custom === undefined, 'b should have neither flag');
console.assert(c.label === 'C New', `c.label wrong: ${c.label}`);
console.assert(c._custom === true, 'c should be _custom');
console.assert(c._overridden === undefined, 'c should NOT be _overridden');
// Ordering: a (overridden in place) then b, then c appended.
console.assert(merged.weapons[0].id === 'a' && merged.weapons[1].id === 'b' && merged.weapons[2].id === 'c', 'ordering wrong');

console.log('All assertions passed');
```

Also re-verify the pre-existing no-collision scenario still works (a custom item whose id never matches any official id — the common case from the original admin-UI feature): confirm it still gets `_custom: true` and is appended, with official items passing through completely unaffected (no flags added to them when there's no override).

Delete the script after it passes.

**Step 3: Commit**

```bash
git add weapon-store.js
git commit -m "feat: support id-based override merge for editing official weapons/attachments"
```

---

### Task 2: Rename admin.html's list sections to reflect combined content

**Files:**
- Modify: `admin.html`

**Step 1: Update the two list sections**

Find:
```html
        <div class="section-header">Custom Weapons</div>
        <div id="custom-weapons-list"></div>
```
Change to:
```html
        <div class="section-header">Weapons</div>
        <div id="weapons-list"></div>
```

Find:
```html
        <div class="section-header mt-lg">Custom Attachments</div>
        <div id="custom-attachments-list"></div>
```
Change to:
```html
        <div class="section-header mt-lg">Attachments</div>
        <div id="attachments-list"></div>
```

Leave everything else in `admin.html` (`new-weapon-btn`, `weapon-form-container`, `new-attachment-btn`, `attachment-form-container`, `export-btn`, etc.) unchanged.

**Step 2: Verify**

```bash
node -e "const html = require('fs').readFileSync('admin.html', 'utf8'); console.log(html.includes('id=\"weapons-list\"'), html.includes('id=\"attachments-list\"'), !html.includes('custom-weapons-list'), !html.includes('custom-attachments-list'))"
```
Expected: `true true true true`

**Step 3: Commit**

```bash
git add admin.html
git commit -m "chore: rename admin.html list sections from Custom to combined Weapons/Attachments"
```

---

### Task 3: Update `admin.js` to render the merged list with badges

**Files:**
- Modify: `admin.js` — `getAllWeapons()`, `renderCustomWeaponsList` (rename to `renderWeaponsList`), `renderCustomAttachmentsList` (rename to `renderAttachmentsList`), and the bootstrap's two render calls.

Read the current `admin.js` now to confirm exact current line numbers before editing (it was last touched by the admin-UI plan; line numbers below are from that version but may have shifted slightly).

**Step 1: Fix `getAllWeapons()` to use the merged list (fixes a latent duplicate-id bug)**

Current:
```js
function getAllWeapons() {
  return [...(BASE_WEAPON_CONFIG.weapons || []), ...WeaponStore.getCustomWeapons()];
}
```

Replace with:
```js
function getAllWeapons() {
  return WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).weapons;
}

function getAllAttachments() {
  return WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).attachments;
}
```

(This also fixes a real bug introduced by Task 1's merge-semantics change: the old `getAllWeapons()` concatenated `BASE_WEAPON_CONFIG.weapons` and `WeaponStore.getCustomWeapons()` directly, which — once an override can share an id with an official entry — would produce two `<option>` entries with the same `value` but possibly different labels in the attachment form's compatible-weapons multi-select. Routing through `getMergedConfig` dedupes by id, same as everywhere else.)

**Step 2: Replace `renderCustomWeaponsList`**

Current:
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
```

Replace with (note the new function name, `renderWeaponsList`, and the new `weapons-list` container id matching Task 2's HTML rename):
```js
function renderWeaponsList() {
  const wrap = document.getElementById('weapons-list');
  wrap.innerHTML = '';
  const weapons = getAllWeapons();
  if (weapons.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  weapons.forEach(weapon => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    const badge = weapon._overridden
      ? '<span class="admin-item-badge badge-edited">Edited</span>'
      : weapon._custom
        ? ''
        : '<span class="admin-item-badge badge-official">Official</span>';
    const canDelete = weapon._overridden || weapon._custom;
    const deleteBtnHtml = canDelete
      ? `<button class="delete-item-btn" data-delete title="${weapon._overridden ? 'Revert to official version' : 'Delete'}">✕</button>`
      : '';
    row.innerHTML = `
      <span class="admin-item-label">${weapon._custom ? '🔧 ' : ''}${escHtml(weapon.label)}</span>
      ${badge}
      <span class="admin-item-meta">${(weapon.actions || []).length} action${(weapon.actions || []).length === 1 ? '' : 's'}</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      ${deleteBtnHtml}
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderWeaponForm(weapon));
    const deleteBtn = row.querySelector('[data-delete]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const msg = weapon._overridden
          ? `Revert "${weapon.label}" to its official version?`
          : `Delete custom weapon "${weapon.label}"?`;
        if (!confirm(msg)) return;
        WeaponStore.deleteCustomWeapon(weapon.id);
        renderWeaponsList();
      });
    }
    wrap.appendChild(row);
  });
}
```

**Step 3: Replace `renderCustomAttachmentsList`**

Current:
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
```

Replace with:
```js
function renderAttachmentsList() {
  const wrap = document.getElementById('attachments-list');
  wrap.innerHTML = '';
  const attachments = getAllAttachments();
  if (attachments.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  attachments.forEach(att => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    const badge = att._overridden
      ? '<span class="admin-item-badge badge-edited">Edited</span>'
      : att._custom
        ? ''
        : '<span class="admin-item-badge badge-official">Official</span>';
    const canDelete = att._overridden || att._custom;
    const deleteBtnHtml = canDelete
      ? `<button class="delete-item-btn" data-delete title="${att._overridden ? 'Revert to official version' : 'Delete'}">✕</button>`
      : '';
    row.innerHTML = `
      <span class="admin-item-label">${att._custom ? '🔧 ' : ''}${escHtml(att.label)}</span>
      ${badge}
      <span class="admin-item-meta">${(att.compatible_weapons || []).length} compatible weapon(s)</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      ${deleteBtnHtml}
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderAttachmentForm(att));
    const deleteBtn = row.querySelector('[data-delete]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const msg = att._overridden
          ? `Revert "${att.label}" to its official version?`
          : `Delete custom attachment "${att.label}"?`;
        if (!confirm(msg)) return;
        WeaponStore.deleteCustomAttachment(att.id);
        renderAttachmentsList();
      });
    }
    wrap.appendChild(row);
  });
}
```

**Step 4: Update the bootstrap's render calls**

Find:
```js
  renderCustomWeaponsList();
  renderCustomAttachmentsList();
```
Change to:
```js
  renderWeaponsList();
  renderAttachmentsList();
```

**Step 5: Update the two call sites inside the save handlers that re-render after save**

In `renderWeaponForm`'s save handler, find `renderCustomWeaponsList();` (the line right after `container.innerHTML = '';`) and change to `renderWeaponsList();`.

In `renderAttachmentForm`'s save handler, find `renderCustomAttachmentsList();` (the line right after `container.innerHTML = '';`) and change to `renderAttachmentsList();`.

**Step 6: Verify with a throwaway Node script**

Use the established `vm`-based DOM-shim approach (real `admin.js` + `weapon-store.js` loaded together, minimal `document`/`localStorage`/`fetch` shims; `fetch('config/weapons.json')` resolves the real file's content). Exercise:

- On a clean load (no custom store data), `renderWeaponsList()` shows all official weapons, each with an "Official" badge and NO delete button. `getAllWeapons().length` equals `BASE_WEAPON_CONFIG.weapons.length` exactly (no duplicates).
- Click Edit on an official weapon (e.g. the real `monodagger`), change its label, click Save. Confirm: `WeaponStore.getCustomWeapons()` now has one entry with `id: 'monodagger'`. Re-render the list — the `monodagger` row now shows an "Edited" badge, the updated label, and a delete button with title "Revert to official version". The list length is unchanged (still equals the official count — no new row was added, the official row was replaced in place).
- Click the revert/delete button on that Edited row, confirm the dialog (stub `window.confirm` to auto-return `true`), re-render — confirm the row is back to "Official" badge, original label, no delete button, and `WeaponStore.getCustomWeapons()` no longer contains a `monodagger` entry.
- Click "+ New Weapon", create a brand-new weapon with a fresh name (e.g. "Test Spear"), save. Confirm it appears with NO badge, the `🔧 ` label prefix, and a normal "Delete" (not "Revert") button. Confirm deleting it removes it from the list entirely (not reverting to anything, since there's no official counterpart).
- In `renderAttachmentForm`, confirm the compatible-weapons multi-select contains exactly one `<option>` per weapon id (no duplicate `value="monodagger"` entries) both before and after overriding `monodagger`, and that the option's visible label reflects the CURRENT (possibly overridden) label.
- Confirm `node --check admin.js` and `node --check weapon-store.js` both still pass.

Delete the script after it passes.

**Step 7: Commit**

```bash
git add admin.js
git commit -m "feat: show official weapons/attachments in admin.html with Edit and revert"
```

---

### Task 4: CSS for the Official/Edited badges

**Files:**
- Modify: `style.css`

**Step 1: Add new rules**

Add near the existing `.admin-item-row`/`.admin-item-label`/`.admin-item-meta` rules:

```css
.admin-item-badge {
  font-size: 0.6rem;
  font-family: var(--font-display);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}

.badge-official {
  color: var(--text-muted);
  background: var(--bg-surface);
}

.badge-edited {
  color: var(--gold);
  background: var(--gold-glow);
  border-color: var(--gold-dim);
}
```

This mirrors the existing `.skill-stat-badge` pattern already used elsewhere in the file (same font/letter-spacing/padding/radius recipe), so it reads as consistent with the rest of the app rather than a one-off component.

**Step 2: Verify**

```bash
node -e "const css=require('fs').readFileSync('style.css','utf8'); const o=(css.match(/\{/g)||[]).length, c=(css.match(/\}/g)||[]).length; console.log(o, c, o===c ? 'balanced' : 'MISMATCH')"
```
Expected: balanced.

Grep to confirm `admin-item-badge`, `badge-official`, `badge-edited` are all referenced in `admin.js`'s templates with no typos.

If a browser is available, open `admin.html`, confirm Official rows show a muted gray pill-shaped badge, Edited rows show a gold/amber one, and Custom rows show neither (just the 🔧 prefix on the label, as before).

**Step 3: Commit**

```bash
git add style.css
git commit -m "style: add Official/Edited badges for admin.html item rows"
```

---

### Task 5: Full regression smoke test (verification only, no code changes)

**Step 1: Real-browser end-to-end pass (if a browser is available)**

1. Open `admin.html`. Confirm the "Weapons" list shows all 3 official weapons (Monodagger, Machine Pistol, Submachine Gun) each with a gray "Official" badge and no delete button. Same for "Attachments" (6 official attachments).
2. Click Edit on "Machine Pistol". Change its label to "Machine Pistol Mk2" and bump one action's damage value. Save. Confirm: the row now shows "Machine Pistol Mk2" with a gold "Edited" badge and a delete button titled "Revert to official version".
3. Open `index.html`, create a character, go to Combat tab, add a weapon. Confirm the dropdown shows "Machine Pistol Mk2" (the override took effect) with NO 🔧 prefix (since it's an edited official item, not a brand-new custom one). Add it, confirm the weapon card shows the updated action damage.
4. Back in `admin.html`, click the revert button on "Machine Pistol Mk2", confirm the dialog, confirm it reverts to "Machine Pistol" with the "Official" badge and original stats.
5. Reload `index.html`'s Combat tab for the same character (full page reload). Confirm the previously-added weapon instance still resolves (via its stable `weapon_id: 'machine_pistol'`) and now shows the ORIGINAL stats again, since the override was deleted — this exercises the same orphan/re-resolve behavior already established for weapon edits, just via reversion instead of deletion.
6. In `admin.html`, create a brand-new custom weapon ("Test Spear"). Confirm it shows the 🔧 prefix, no badge, and a normal "Delete" button (not "Revert").
7. Open `renderAttachmentForm` (Edit any attachment, or New Attachment), confirm the compatible-weapons multi-select lists each weapon exactly once, with current (possibly overridden) labels, no duplicates.
8. Export Custom Items. Confirm the downloaded JSON's `weapons`/`attachments` arrays reflect whatever overrides/custom items currently exist in the store (e.g. if you re-create the "Machine Pistol Mk2" override before exporting, confirm it appears in the export keyed by id `machine_pistol` — note this is intentionally a *replacement* signal for whoever merges the export later, not a new entry).

**Step 2: Regression check on pre-existing functionality**

- Official-only weapon/attachment flow (no overrides involved): add a Submachine Gun in-game, fire its Burst Fire action, confirm 3 separate rolls with auto-Disadvantage; equip Forward Grip, confirm Disadvantage is removed but roll count stays at 3. This exercises the same `resolveWeapon`/`WEAPON_CONFIG` pipeline from the original weapon-attachment-config feature — confirm the new id-keyed merge logic in `getMergedConfig` hasn't changed behavior for the all-official, no-override case at all.
- Confirm a previously-existing brand-new custom weapon/attachment (created before this plan's changes, if any test data exists from the prior admin-UI plan's regression pass) still appears correctly tagged `_custom` (🔧 prefix, no badge) and not accidentally miscategorized as `_overridden`.
- Confirm Ability/Skill/Initiative rolls, the Advantage/Disadvantage modal, and character CRUD are all unaffected (this plan only touches `weapon-store.js`/`admin.html`/`admin.js`/`style.css`, none of which `app.js`'s non-weapon code paths depend on).

**Step 3: Static checks (always do this regardless of browser availability)**

```bash
node --check app.js
node --check admin.js
node --check weapon-store.js
node -e "JSON.parse(require('fs').readFileSync('config/weapons.json')); console.log('weapons.json OK')"
```

This is verification only — if a real bug is found, stop and report it in detail rather than attempting a fix.

---

## After all tasks: final review and merge

Per `superpowers:subagent-driven-development`, after Task 5 passes, dispatch one final whole-branch code reviewer covering the complete diff (Tasks 1-4) before using `superpowers:finishing-a-development-branch` to merge. Given the recent discovery that GitHub Pages silently failed to deploy the last two merges (fixed via `.nojekyll`), confirm after merging that the live site at `https://dolltj.github.io/NNG/` actually reflects the change — don't assume a successful `git push` alone means it's live; check the Actions tab for a green "pages build and deployment" run against the merge commit.
