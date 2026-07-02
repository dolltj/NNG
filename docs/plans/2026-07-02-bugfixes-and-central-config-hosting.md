# Bugfixes & Central Config Hosting (Supabase) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 10 findings from the 2026-07-02 whole-repo code review, then move weapon/attachment/perk configs from per-browser localStorage to a Supabase table so the GM can publish config changes that every player receives.

**Architecture:** The app stays a static site on GitHub Pages (`https://dolltj.github.io/NNG/`) with no build step. A Supabase project (free tier) holds one `configs` table with two jsonb rows (`weapons`, `perks`). Players read it anonymously via plain `fetch` against Supabase's REST API (no SDK on the player page); if unreachable, the app falls back to the bundled `config/*.json` files. The admin page loads `supabase-js` from a CDN for auth: the GM signs in with email/password and a "Publish to Everyone" button upserts the merged config. Row-Level Security enforces the split: everyone can `select`, only authenticated users can write, and public signups are disabled so only the GM account exists. The existing WeaponStore localStorage layer is kept, reinterpreted as "unpublished local drafts": admin edits stage locally exactly as today, and Publish promotes them to canon and clears the drafts.

**Tech Stack:** Vanilla JS, GitHub Pages, Supabase (Postgres + RLS + REST + auth), `supabase-js` v2 via CDN (admin page only), `node --test` (Node 18+, zero dependencies) for pure-logic tests.

**Prior decisions honored** (from `docs/plans/2026-06-23-hosting-and-roll20-integration-design.md`): static hosting, no build step, character data stays in each player's localStorage (Export/Import buttons remain the backup path). Character sync is explicitly out of scope; Supabase makes it possible later.

**Review findings addressed** (see the 2026-07-02 review): (1) unvalidated character import, (2) reload crash when `ammo` is null, (3) admin re-slugs action ids breaking attachment effects, (4) unguarded `saveAllCharacters`, (5) resource-bar click with no max zeroes the value, (6) duplicate tab-nav listeners, (7) `escHtml` ×3, (8) dead dice-evaluator code, (9) `STORAGE_ACTIVE_KEY` written but never read, (10) resource-max derivation duplicated ×4.

**Line numbers** below refer to the files as of commit `675c3ea` and drift as tasks land — search for the quoted code, don't trust raw offsets.

---

### Task 1: Minimal test harness (`node --test`)

The repo has no test infra. Several upcoming fixes are pure functions we can test in Node with zero dependencies. DOM-bound fixes use manual browser checks instead (this project's established convention).

**Files:**
- Create: `tests/dice.test.js` (placeholder assertion so the runner has something to chew)

**Step 1: Verify Node is available**

Run: `node --version`
Expected: v18 or newer (built-in `node:test`). If Node is missing, install the current LTS first.

**Step 2: Create a smoke test against existing dice.js exports**

```js
// tests/dice.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const dice = require('../dice.js');

test('deriveMaxHP: 50 + (STR + FOR) * level', () => {
  const char = { core_stats: { strength: 2, fortitude: 3 }, level: 4 };
  assert.strictEqual(dice.deriveMaxHP(char), 50 + 5 * 4);
});

test('buildTestFormula formats positive/negative/zero modifiers', () => {
  assert.strictEqual(dice.buildTestFormula(3), '2d10 + 3');
  assert.strictEqual(dice.buildTestFormula(-2), '2d10 - 2');
  assert.strictEqual(dice.buildTestFormula(0), '2d10');
});
```

**Step 3: Run it**

Run: `node --test tests/`
Expected: 2 passing tests.

**Step 4: Commit**

```bash
git add tests/dice.test.js
git commit -m "test: add zero-dependency node:test harness with dice.js smoke tests"
```

---

### Task 2: Shared `util.js` — one `escHtml` (finding 7)

`escHtml` is implemented verbatim in `app.js:1361`, `admin.js:58`, and `roll20-bridge.js:95` (`_escapeHtml`). Consolidate into one shared file, and add single-quote escaping while we're the only ones touching it (none of the three copies escape `'`; currently safe only because every template uses double-quoted attributes — make it not depend on that).

**Files:**
- Create: `util.js`
- Create: `tests/util.test.js`
- Modify: `app.js` (delete `escHtml`, lines ~1358–1368)
- Modify: `admin.js` (delete `escHtml`, lines ~58–65)
- Modify: `roll20-bridge.js` (delete `_escapeHtml` lines ~95–101, repoint its 2 call sites at `window.escHtml`)
- Modify: `index.html`, `admin.html` (script tags)

**Step 1: Write the failing test**

```js
// tests/util.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { escHtml } = require('../util.js');

test('escapes &, <, >, ", and single quote', () => {
  assert.strictEqual(
    escHtml(`<img src="x" onerror='a&b'>`),
    '&lt;img src=&quot;x&quot; onerror=&#39;a&amp;b&#39;&gt;'
  );
});

test('null/undefined become empty string, numbers are stringified', () => {
  assert.strictEqual(escHtml(null), '');
  assert.strictEqual(escHtml(undefined), '');
  assert.strictEqual(escHtml(42), '42');
});
```

**Step 2: Run it — expect failure**

Run: `node --test tests/`
Expected: FAIL, `Cannot find module '../util.js'`.

**Step 3: Create `util.js`**

```js
// =============================================
// SHARED UTILITIES
// DOM-free helpers used by index.html, admin.html,
// and roll20-bridge.js. Loaded before every other
// script on both pages; node-requirable for tests.
// =============================================
(function () {
  'use strict';

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (typeof window !== 'undefined') window.escHtml = escHtml;
  if (typeof module !== 'undefined') module.exports = { escHtml };
})();
```

**Step 4: Run tests — expect pass**

Run: `node --test tests/`
Expected: all passing.

**Step 5: Wire it into both pages and delete the three copies**

- `index.html`: the script block becomes
  ```html
  <script src="util.js"></script>
  <script src="dice.js"></script>
  <script src="roll20-bridge.js"></script>
  <script src="weapon-store.js"></script>
  <script src="app.js"></script>
  ```
- `admin.html`: script block becomes
  ```html
  <script src="util.js"></script>
  <script src="weapon-store.js"></script>
  <script src="admin.js"></script>
  ```
- `app.js`: delete the `escHtml` function (under `// UTILITY`). All existing calls resolve to the global.
- `admin.js`: delete its `escHtml` function. Same.
- `roll20-bridge.js`: delete `_escapeHtml` and change its two uses in `_renderRollLog` to `window.escHtml(...)`.

**Step 6: Manual browser verification**

Open `index.html` in a browser. Confirm: roster renders, open a character, weapon labels render, send a roll (roll log panel appears, formula text intact). Open `admin.html`: weapon/attachment/perk lists render. Any `escHtml is not defined` in the console means a script-order mistake.

**Step 7: Commit**

```bash
git add util.js tests/util.test.js app.js admin.js roll20-bridge.js index.html admin.html
git commit -m "refactor: consolidate three escHtml copies into shared util.js, escape single quotes"
```

---

### Task 3: `getResourceMax` helper (finding 10)

The expression `resDef.derived_max ? deriveMaxHP(char) : res.max` appears four times in `app.js` (`buildResourceCard` ~467, bar-click handler ~507, `adjustResource` ~554, `updateResourceDisplay` ~568). Extract it into `dice.js` next to `deriveMaxHP`.

**Files:**
- Modify: `dice.js` (add function + export)
- Modify: `app.js` (4 call sites)
- Modify: `tests/dice.test.js` (add tests)

**Step 1: Write the failing tests** (append to `tests/dice.test.js`)

```js
test('getResourceMax: derived resource uses HP formula', () => {
  const char = { core_stats: { strength: 2, fortitude: 3 }, level: 2, resources: {} };
  assert.strictEqual(dice.getResourceMax({ id: 'hp', derived_max: true }, char), 50 + 5 * 2);
});

test('getResourceMax: non-derived resource reads stored max', () => {
  const char = { resources: { fatigue: { current: 10, max: 100 } } };
  assert.strictEqual(dice.getResourceMax({ id: 'fatigue', derived_max: false }, char), 100);
});

test('getResourceMax: missing resource entry -> null', () => {
  assert.strictEqual(dice.getResourceMax({ id: 'shields', derived_max: false }, { resources: {} }), null);
});
```

**Step 2: Run — expect FAIL** (`dice.getResourceMax is not a function`)

**Step 3: Implement in `dice.js`** (after `deriveCarryingCapacity`, and add `getResourceMax` to the `module.exports` list)

```js
/**
 * A tracked resource's effective max: the derived HP formula for
 * derived_max resources, otherwise the character's stored max
 * (null when the character has no entry / no max set).
 */
function getResourceMax(resDef, character) {
  if (resDef.derived_max) return deriveMaxHP(character);
  return character.resources?.[resDef.id]?.max ?? null;
}
```

**Step 4: Run — expect PASS**

**Step 5: Replace the four `app.js` sites**

- `buildResourceCard`: `const maxVal = getResourceMax(resDef, char);`
- bar-click handler: `const maxVal2 = getResourceMax(resDef, char);` (this line moves in Task 4 anyway)
- `adjustResource`: `const maxVal = getResourceMax(resDef, char);`
- `updateResourceDisplay`: `const maxVal = getResourceMax(resDef, char);`

**Step 6: Manual check** — open a character's Abilities tab: HP shows derived max, +/− clamps at it, Fatigue max is editable and clamps.

**Step 7: Commit**

```bash
git add dice.js app.js tests/dice.test.js
git commit -m "refactor: extract getResourceMax, replacing four duplicated derivations"
```

---

### Task 4: Guard resource-bar click when max is unset (finding 5)

`app.js` bar-click handler: `newVal = Math.round(pct * (maxVal2 || 0))` sets `current` to 0 when max is null/0 (e.g. the user blanked Fatigue's max — the max input commits `parseInt || 0`). A click on a 0%-width bar should do nothing, not wipe the value.

**Files:**
- Modify: `app.js` (`buildResourceCard` bar-click listener, ~lines 500–515)

**Step 1: Reproduce (red)** — open Abilities, set Fatigue current to 40, blank/zero its max, click anywhere on the (empty) fatigue bar. Current becomes 0. That's the bug.

**Step 2: Replace the listener body**

```js
    barWrap.addEventListener('click', e => {
      const char = getChar();
      const maxVal2 = getResourceMax(resDef, char);
      if (!maxVal2) return; // no max → a click position maps to nothing
      const rect = barWrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const res2 = char.resources[resDef.id];
      res2.current = Math.max(0, Math.min(maxVal2, Math.round(pct * maxVal2)));
      const display = document.getElementById(`res-val-${resDef.id}`);
      if (display) display.textContent = res2.current;
      updateResourceDisplay(resDef.id, resDef);
      scheduleSave();
    });
```

**Step 3: Verify (green)** — repeat Step 1: click is ignored, current stays 40. Restore max 100: clicking mid-bar sets ~50.

**Step 4: Commit**

```bash
git add app.js
git commit -m "fix: ignore resource-bar clicks when the resource has no max"
```

---

### Task 5: Harden character import (finding 1 — most severe)

`importCharacter()` (`app.js` ~1174–1189) parses without try/catch, does no shape validation, and **saves the object to localStorage before rendering it** — importing the admin page's `custom-config-export.json` by mistake permanently corrupts the roster. Old exports predating fields like `origin_perk` also crash later (`getChar().origin_perk.name` on edit).

**Files:**
- Modify: `app.js` (replace `importCharacter`)

**Step 1: Reproduce (red)** — in the app, click Import and select an export from the admin page (or any `{"foo": 1}` JSON file). Observe the console TypeError and/or the broken roster card that persists across reload. Delete the broken card afterwards.

**Step 2: Replace `importCharacter`**

```js
function importCharacter() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.json';
  input.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      alert(`"${file.name}" is not valid JSON.`);
      return;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || typeof raw.name !== 'string' || typeof raw.core_stats !== 'object') {
      alert(`"${file.name}" doesn't look like a character export from this sheet.`);
      return;
    }

    // Merge onto a fresh default character so fields added to the schema
    // after this file was exported (origin_perk, show_all_perks, new
    // resources/skills, ...) get defaults instead of crashing the sheet.
    const id = (typeof raw.id === 'string' && raw.id) ? raw.id : ('char_' + Date.now());
    const base = buildDefaultCharacter(id);
    const char = { ...base, ...raw, id };
    char.core_stats  = { ...base.core_stats,  ...(raw.core_stats  || {}) };
    char.resources   = { ...base.resources,   ...(raw.resources   || {}) };
    char.skills      = { ...base.skills,      ...(raw.skills      || {}) };
    char.armor       = { ...base.armor,       ...(raw.armor       || {}) };
    char.origin_perk = { ...base.origin_perk, ...(raw.origin_perk || {}) };

    CHARACTERS[char.id] = char;
    saveAllCharacters();
    openCharacter(char.id);
  });
  input.click();
}
```

**Step 3: Verify (green)**

- Import garbage JSON → alert, roster untouched.
- Import the admin export → "doesn't look like a character export" alert, roster untouched.
- Export a real character, delete a few fields from the file by hand (`origin_perk`, `resources`), re-import → opens fine with defaults; editing the Origin Perk name doesn't throw.
- Import an unmodified export → identical character.

**Step 4: Commit**

```bash
git add app.js
git commit -m "fix: validate and normalize imported characters instead of persisting arbitrary JSON"
```

---

### Task 6: Ammo state follows the resolved magazine (finding 2)

`ammo` is created only at add-time from the **base** weapon def (`app.js` ~745), but attachments and admin edits can add/remove a magazine afterwards. Reload then crashes on `weaponInst.ammo.current` when ammo is null. Fix at the right altitude: normalize ammo from the *resolved* weapon whenever a card is built, and don't render Reload for magazine-less weapons.

**Files:**
- Modify: `app.js` (`buildWeaponCard` ~763, `buildActionRow` ~875–889, its caller ~801)

**Step 1: Reproduce (red)** — in `admin.html`, create a weapon with a blank Magazine Size and add a "Reload" action (type Reload). In the app, add it to a character, click Reload → `TypeError: Cannot set properties of null`.

**Step 2: Normalize ammo at the top of `buildWeaponCard`**

```js
function buildWeaponCard(weaponInst, resolved) {
  // Ammo tracks the *resolved* magazine — attachments and admin edits can
  // add or remove a magazine after the weapon was added to the sheet.
  if (resolved.magazine_size != null && !weaponInst.ammo) {
    weaponInst.ammo = { current: resolved.magazine_size };
  } else if (resolved.magazine_size == null && weaponInst.ammo) {
    weaponInst.ammo = null;
  }
  const card = document.createElement('div');
  ...
```

**Step 3: Skip Reload rows when there's nothing to reload** — in `buildActionRow`:

```js
  if (action.is_reload) {
    if (resolved.magazine_size == null) return null; // no magazine → no reload row
    ...
```

and make the caller in `buildWeaponCard` tolerate it:

```js
  resolved.actions.forEach(action => {
    const actionRow = buildActionRow(weaponInst, resolved, action);
    if (actionRow) actionsWrap.appendChild(actionRow);
  });
```

**Step 4: Verify (green)**

- The Task-6 repro weapon: no Reload row, no crash.
- Machine Pistol: ammo counter and Reload still work; firing Single-Shot decrements ammo.
- Add Extended Magazine to a Machine Pistol on an existing character: counter max becomes 30 after re-render; remove it: current clamps back to 20 (existing behavior, now null-safe).

**Step 5: Commit**

```bash
git add app.js
git commit -m "fix: derive ammo state from resolved magazine; skip reload for magazine-less weapons"
```

---

### Task 7: Stop re-keying action ids on admin save (finding 3)

`admin.js` `readAction()` (~lines 133/136) regenerates `id: slugify(label)` on every save. Attachment effects target actions **by id** (`action_hit_bonus` on `single_shot`, `action_save_dv_bonus` on `full_auto` in `config/weapons.json`), so relabeling an action in an override silently orphans those effects.

**Files:**
- Modify: `admin.js` (`buildActionRowForm`, weapon save handler)

**Step 1: Reproduce (red)** — Admin: Edit the official Machine Pistol, change "Single-Shot" label to "Aimed Shot", Save. In the app (reload it), add a Machine Pistol + MRDS. The +1 hit bonus no longer applies (attack modifier unchanged by MRDS). Revert the override afterwards.

**Step 2: Preserve existing ids in `buildActionRowForm`**

At the top of the function:

```js
function buildActionRowForm(action = {}) {
  const row = document.createElement('div');
  row.className = 'admin-action-row';
  // Existing actions keep their id even when relabeled — attachment effects
  // (action_hit_bonus / action_save_dv_bonus) target actions by id.
  const existingId = action.id || null;
```

In `readAction`, both branches:

```js
    const label = get('label').value.trim();
    if (t === 'reload') {
      return { id: existingId || slugify(label), label, is_reload: true };
    }
    const a = {
      id: existingId || slugify(label),
      ...
```

**Step 3: Reject duplicate action ids at save** — in the `w-save-btn` handler, after `const actions = actionRows.map(...)`:

```js
    const seen = new Set();
    for (const a of actions) {
      if (seen.has(a.id)) {
        alert(`Two actions resolve to the same id ("${a.id}") — give them different labels.`);
        return;
      }
      seen.add(a.id);
    }
```

**Step 4: Verify (green)** — repeat Step 1: relabel "Single-Shot" → "Aimed Shot", save, reload app: MRDS +1 still applies to the relabeled action. Also try adding two new actions both labeled "Shoot" → save is rejected with the alert.

**Step 5: Commit**

```bash
git add admin.js
git commit -m "fix: preserve action ids across admin edits so attachment effects stay targeted"
```

---

### Task 8: Guard `saveAllCharacters` (finding 4)

`localStorage.setItem` can throw (quota, storage disabled). Today that's an uncaught exception and — in the debounced path — an indicator stuck on "Saving…" while nothing persisted. The load path (`loadAllCharacters`) is already guarded; mirror it.

**Files:**
- Modify: `app.js` (`saveAllCharacters` ~57, `scheduleSave` ~61)
- Modify: `style.css` (one rule near the existing `.save-indicator` styles)

**Step 1: Implement**

```js
function saveAllCharacters() {
  try {
    localStorage.setItem(STORAGE_CHARS_KEY, JSON.stringify(CHARACTERS));
    return true;
  } catch (err) {
    console.error('Failed to save characters:', err);
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
      indicator.className = 'save-indicator error';
      indicator.querySelector('.save-dot-label').textContent = 'Save FAILED — storage full?';
    }
    return false;
  }
}
```

In `scheduleSave`, bail before the "Saved" UI when the write failed:

```js
  SAVE_TIMER = setTimeout(() => {
    if (!saveAllCharacters()) return;
    if (indicator) {
      ...
```

**Step 2: Style the error state** — in `style.css`, next to the existing `.save-indicator.saved` / `.saving` rules, add:

```css
.save-indicator.error .save-dot { background: #e74c3c; }
.save-indicator.error .save-dot-label { color: #e74c3c; }
```

**Step 3: Verify** — in DevTools console: `const orig = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }`, then edit a field. Expected: red "Save FAILED" indicator, console error, no uncaught exception. Restore with `Storage.prototype.setItem = orig`, edit again → "Saved".

**Step 4: Commit**

```bash
git add app.js style.css
git commit -m "fix: surface localStorage save failures instead of silently losing data"
```

---

### Task 9: Wire tab navigation once (finding 6)

`renderTabNav()` adds a fresh click listener to the six static `.tab-btn` elements on every `renderSheet()` — one more stack of handlers per character opened.

**Files:**
- Modify: `app.js` (bootstrap ~26, `renderSheet` ~280, `renderTabNav` comment)

**Step 1: Move the call** — delete `renderTabNav();` from `renderSheet()`; add it once in the DOMContentLoaded bootstrap (before `renderRoster()`), with the comment updated:

```js
  loadAllCharacters();
  renderTabNav(); // static buttons in index.html — wire exactly once
  renderRoster();
```

**Step 2: Verify** — console: `getEventListeners(document.querySelector('.tab-btn')).click.length` (Chrome) after opening 3 different characters. Expected: 1 (previously 3). Tabs still switch.

**Step 3: Commit**

```bash
git add app.js
git commit -m "fix: attach tab-nav listeners once instead of per renderSheet"
```

---

### Task 10: Delete the dead dice evaluator (finding 8)

`rollDie`, `parseDiceToken`, `evaluateDiceExpression`, `formatMod` (~100 lines of `dice.js`) have no callers — all rolling is delegated to Roll20 as formula strings. The "for unit testing" export comment referenced tests that never existed (until Task 1, which tests only the live functions).

**Files:**
- Modify: `dice.js` (delete lines ~7–95 and ~163–169; trim `module.exports`)

**Step 1: Prove they're dead**

Run: `grep -rnE "rollDie|parseDiceToken|evaluateDiceExpression|formatMod" --include="*.js" --include="*.html" .`
Expected: hits only inside `dice.js` itself (and `tests/` must not reference them).

**Step 2: Delete** the four functions and their JSDoc; `module.exports` becomes:

```js
if (typeof module !== 'undefined') {
  module.exports = {
    deriveMaxHP, deriveInjuryThreshold, deriveRecoveryRate,
    deriveCarryingCapacity, getResourceMax,
    buildTestFormula, buildAdvantageFormula
  };
}
```

**Step 3: Verify** — `node --test tests/` passes; open the app, roll an ability test and a weapon attack (both still work — they never used the evaluator).

**Step 4: Commit**

```bash
git add dice.js
git commit -m "refactor: delete unused dice-expression evaluator"
```

---

### Task 11: Resume the last-open character (finding 9)

`STORAGE_ACTIVE_KEY` is written on open and cleared on delete but never read — the "come back to your sheet" feature it implies was never finished. Finish it (5 lines) rather than deleting the key.

**Files:**
- Modify: `app.js` (bootstrap)

**Step 1: Implement** — in the DOMContentLoaded handler, replace the final `renderRoster();` with:

```js
  const lastId = localStorage.getItem(STORAGE_ACTIVE_KEY);
  if (lastId && CHARACTERS[lastId]) {
    openCharacter(lastId); // resume where the player left off
  } else {
    renderRoster();
  }
```

(Note: `showRoster()` re-renders the roster on demand, so skipping the initial `renderRoster()` in the resume branch is safe.)

**Step 2: Verify** — open a character, reload the page → sheet reopens directly. Click "← Characters", reload → hmm, roster? No: the active key persists until delete. Decide the UX explicitly: **back-to-roster should clear the resume key.** Add to `showRoster()`:

```js
function showRoster() {
  ACTIVE_ID = null;
  localStorage.removeItem(STORAGE_ACTIVE_KEY);
  ...
```

Then re-verify: open character → reload → sheet. Back to roster → reload → roster. Delete active character → roster, no crash.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: resume last-open character on load (STORAGE_ACTIVE_KEY was write-only)"
```

---

### Task 12: Supabase project setup + seed (manual, no code)

**Step 1: Create the project** — at https://supabase.com: New project (free tier), name `nng-config`, pick a nearby region. From Project Settings → API, note the **Project URL** (`https://<ref>.supabase.co`) and the **anon/publishable key**. The anon key is designed to be public — access control lives in RLS.

**Step 2: Create the table and policies** — SQL Editor, run:

```sql
create table public.configs (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.configs enable row level security;

create policy "Public read"
  on public.configs for select
  using (true);

create policy "Authenticated write"
  on public.configs for all
  to authenticated
  using (true) with check (true);
```

**Step 3: Lock down auth** — Authentication → Sign In / Providers: keep Email enabled, **disable "Allow new users to sign up"**. Authentication → Users → Add user: create the GM account (email + strong password). Only this account will be able to publish.

**Step 4: Seed the two rows** — SQL Editor (dollar-quoting keeps embedded quotes in descriptions safe):

```sql
insert into public.configs (key, data) values
  ('weapons', $json$ <paste the full contents of config/weapons.json here> $json$::jsonb),
  ('perks',   $json$ <paste the full contents of config/perks.json here> $json$::jsonb);
```

**Step 5: Verify the public read path from the shell**

```bash
curl -s "https://<ref>.supabase.co/rest/v1/configs?select=key" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
```

Expected: `[{"key":"weapons"},{"key":"perks"}]`

Also verify writes are rejected anonymously:

```bash
curl -s -X POST "https://<ref>.supabase.co/rest/v1/configs" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" -d '{"key":"evil","data":{}}'
```

Expected: an RLS policy violation error, not a 201.

**Step 6: Nothing to commit** — record the Project URL and anon key for Task 13.

---

### Task 13: `supabase-config.js` + `remote-config.js` (player-side fetch, no SDK)

**Files:**
- Create: `supabase-config.js`
- Create: `remote-config.js`

**Step 1: Create `supabase-config.js`** (committed on purpose; see comment)

```js
// =============================================
// SUPABASE PROJECT CONSTANTS
// The anon key is public by design — it only grants
// what Row-Level Security allows (read configs).
// Writes require a signed-in session (admin page).
// =============================================
window.SUPABASE_URL = 'https://<ref>.supabase.co';
window.SUPABASE_ANON_KEY = '<anon-key>';
```

**Step 2: Create `remote-config.js`**

```js
// =============================================
// REMOTE CONFIG
// Reads canonical configs from Supabase via its
// REST API (plain fetch — no SDK needed for reads).
// Falls back to the bundled config/*.json so the
// sheet still opens at the table with no network
// or a Supabase outage.
// =============================================
(function () {
  'use strict';

  async function fetchRemoteConfig(key) {
    const resp = await fetch(
      `${window.SUPABASE_URL}/rest/v1/configs?key=eq.${encodeURIComponent(key)}&select=data`,
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!resp.ok) throw new Error(`configs fetch failed: HTTP ${resp.status}`);
    const rows = await resp.json();
    if (!rows.length) throw new Error(`no config row for "${key}"`);
    return rows[0].data;
  }

  async function loadConfigWithFallback(key, bundledUrl) {
    try {
      return await fetchRemoteConfig(key);
    } catch (err) {
      console.warn(`[RemoteConfig] using bundled ${bundledUrl}:`, err.message);
      const resp = await fetch(bundledUrl);
      if (!resp.ok) throw new Error(`Failed to load config: ${bundledUrl}`);
      return resp.json();
    }
  }

  window.RemoteConfig = { fetchRemoteConfig, loadConfigWithFallback };
})();
```

**Step 3: Verify in isolation** — serve the folder (`python -m http.server` or open via Pages later), console:

```js
await window.RemoteConfig.fetchRemoteConfig('weapons')
```

Expected: the seeded weapons object. Then temporarily break `window.SUPABASE_URL` and confirm `loadConfigWithFallback('weapons', 'config/weapons.json')` returns the bundled file with the console warning.

**Step 4: Commit**

```bash
git add supabase-config.js remote-config.js
git commit -m "feat: add Supabase remote-config reader with bundled fallback"
```

---

### Task 14: App loads configs remote-first (and in parallel)

**Files:**
- Modify: `app.js` (bootstrap ~26–34)
- Modify: `index.html` (script tags)

**Step 1: Add scripts to `index.html`** (order matters — before `app.js`):

```html
  <script src="util.js"></script>
  <script src="supabase-config.js"></script>
  <script src="remote-config.js"></script>
  <script src="dice.js"></script>
  <script src="roll20-bridge.js"></script>
  <script src="weapon-store.js"></script>
  <script src="app.js"></script>
```

**Step 2: Rewrite the bootstrap** — the three configs are independent; fetch them in parallel (the current code awaits them sequentially):

```js
window.addEventListener('DOMContentLoaded', async () => {
  const [nng, weapons, perks] = await Promise.all([
    loadConfig(CONFIG_URL), // system config stays bundled — schema changes need code changes anyway
    window.RemoteConfig.loadConfigWithFallback('weapons', WEAPONS_CONFIG_URL),
    window.RemoteConfig.loadConfigWithFallback('perks', PERKS_CONFIG_URL)
  ]);
  CONFIG = nng;
  WEAPON_CONFIG = window.WeaponStore.getMergedConfig(weapons);
  PERKS_CONFIG = window.WeaponStore.getPerksMergedConfig(perks);
  loadAllCharacters();
  renderTabNav(); // static buttons in index.html — wire exactly once
  const lastId = localStorage.getItem(STORAGE_ACTIVE_KEY);
  if (lastId && CHARACTERS[lastId]) {
    openCharacter(lastId);
  } else {
    renderRoster();
  }
});
```

(Player-side WeaponStore merging is unchanged: players can still keep personal homebrew locally on top of the published canon.)

**Step 3: Verify** — serve locally: sheet loads, weapons/perks come from Supabase (Network tab shows the `rest/v1/configs` calls). Kill the network (DevTools offline) and reload: warns and falls back to bundled configs, sheet still opens.

**Step 4: Commit**

```bash
git add app.js index.html
git commit -m "feat: load weapon/perk configs from Supabase (parallel, with bundled fallback)"
```

---

### Task 15: Admin sign-in + "Publish to Everyone"

The admin keeps its exact current editing flow — WeaponStore localStorage entries become "unpublished drafts". Publish merges drafts over the canon, uploads to Supabase, then clears the drafts (they're canon now).

**Files:**
- Modify: `admin.html` (SDK script, auth/publish UI)
- Modify: `admin.js` (load remote-first, auth, publish)
- Modify: `weapon-store.js` (add `clearAllCustom`)

**Step 1: `admin.html`** — add to the script block (before `admin.js`):

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="util.js"></script>
  <script src="supabase-config.js"></script>
  <script src="remote-config.js"></script>
  <script src="weapon-store.js"></script>
  <script src="admin.js"></script>
```

and replace the header's `top-bar-actions` div:

```html
      <div class="top-bar-actions" id="auth-bar">
        <input class="field-input" id="auth-email" type="email" placeholder="GM email" style="width:180px">
        <input class="field-input" id="auth-password" type="password" placeholder="Password" style="width:140px">
        <button class="btn btn-secondary" id="sign-in-btn">Sign In</button>
        <button class="btn btn-primary" id="publish-btn" style="display:none">⬆ Publish to Everyone</button>
        <button class="btn btn-secondary" id="export-btn">↓ Export Custom Items</button>
      </div>
```

**Step 2: `weapon-store.js`** — add and expose:

```js
  /** Drop all local drafts — called after a successful publish, when the
   *  drafts have become the canonical config. */
  function clearAllCustom() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERK_STORAGE_KEY);
  }
```

(add `clearAllCustom` to the `window.WeaponStore` object)

**Step 3: `admin.js`** — top of file, add the client; in the DOMContentLoaded handler, load remote-first and restore any session:

```js
const sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
```

```js
window.addEventListener('DOMContentLoaded', async () => {
  [BASE_WEAPON_CONFIG, BASE_PERK_CONFIG] = await Promise.all([
    window.RemoteConfig.loadConfigWithFallback('weapons', 'config/weapons.json'),
    window.RemoteConfig.loadConfigWithFallback('perks', 'config/perks.json')
  ]);

  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('new-perk-btn').addEventListener('click', () => renderPerkForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
  document.getElementById('sign-in-btn').addEventListener('click', signIn);
  document.getElementById('publish-btn').addEventListener('click', publishConfigs);

  // supabase-js persists sessions in localStorage — restore silently.
  const { data: { session } } = await sb.auth.getSession();
  if (session) showSignedIn(session.user.email);
});
```

Add the auth/publish functions:

```js
function showSignedIn(email) {
  document.getElementById('auth-email').style.display = 'none';
  document.getElementById('auth-password').style.display = 'none';
  const btn = document.getElementById('sign-in-btn');
  btn.textContent = email;
  btn.disabled = true;
  document.getElementById('publish-btn').style.display = '';
}

async function signIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { alert(`Sign-in failed: ${error.message}`); return; }
  showSignedIn(data.user.email);
}

async function publishConfigs() {
  if (!confirm('Publish the current weapon, attachment, and perk lists as the official config for all players?')) return;

  const stripFlags = list => list.map(({ _custom, _overridden, ...item }) => item);
  const merged = WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG);
  const weaponsData = { weapons: stripFlags(merged.weapons), attachments: stripFlags(merged.attachments) };
  const perksData = stripFlags(WeaponStore.getPerksMergedConfig(BASE_PERK_CONFIG));

  const now = new Date().toISOString();
  const { error } = await sb.from('configs').upsert([
    { key: 'weapons', data: weaponsData, updated_at: now },
    { key: 'perks',   data: perksData,   updated_at: now }
  ]);
  if (error) { alert(`Publish failed: ${error.message}`); return; }

  // Drafts are canon now — clear them and rebase the lists on the new canon.
  WeaponStore.clearAllCustom();
  BASE_WEAPON_CONFIG = weaponsData;
  BASE_PERK_CONFIG = perksData;
  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();
  alert('Published. Players get the update next time they load the sheet.');
}
```

**Step 4: Verify end-to-end**

1. Serve locally, open `admin.html`: lists show the *published* (Supabase) config.
2. Sign in with a wrong password → alert. Sign in with the GM account → email shows, Publish appears.
3. Create a custom weapon ("Test Blaster"), see its 🔧 draft badge, click Publish → confirm → success alert; badge disappears (it's canon now).
4. Open `index.html` in a **different browser/profile** (clean localStorage): Test Blaster appears in the Add Weapon dropdown.
5. In Supabase Table Editor: `configs.weapons.updated_at` moved, data contains Test Blaster, and no `_custom`/`_overridden` keys exist anywhere in `data`.
6. Reload admin → session restored, still signed in.
7. Delete the Test Blaster draft-style (edit canon → it becomes an override draft → publish again) to leave the table clean, or leave it as a group in-joke.

**Step 5: Commit**

```bash
git add admin.html admin.js weapon-store.js
git commit -m "feat: GM sign-in and one-click config publish to Supabase"
```

---

### Task 16: Docs, deploy, live verification

**Files:**
- Modify: `README.md`

**Step 1: Update the README** — add under the existing sections:

```markdown
## Shared configs (weapons, attachments, perks)

The official weapon/attachment/perk lists live in a central Supabase table, not in this repo. Every player's sheet fetches them on load (and falls back to the JSON files bundled here if the service is unreachable).

**For the GM:** open [admin.html](https://dolltj.github.io/NNG/admin.html), sign in (top-right), make your edits — they stage as local drafts marked 🔧/Edited — then click **⬆ Publish to Everyone**. Players receive the change the next time they load the sheet.

**For players:** nothing to do. You can still add personal homebrew via your own browser's admin page without signing in; unpublished items stay local to your browser.

Character sheets themselves remain local to each player's browser (use Export/Import to back up or move devices).
```

**Step 2: Deploy**

```bash
git push
curl -sI https://dolltj.github.io/NNG/ | head -1
```

Expected: `HTTP/1.1 200 OK` after the Pages build (~1 min).

**Step 3: Live end-to-end check** — on the live URL: sheet loads configs from Supabase (Network tab), admin sign-in works over HTTPS, publish from one machine → visible on another. Confirm the Roll20 clipboard fallback still works on the live site (regression check on the script-tag changes).

**Step 4: Final commit** (if the README needed touch-ups during verification)

```bash
git add README.md
git commit -m "docs: document central config publishing workflow"
git push
```

---

## Out of scope / future work

- **Synced characters** (GM viewing player sheets, cross-device characters): Supabase makes this a natural follow-up — a `characters` table with per-user rows — but it changes the data-ownership model and deserves its own design pass.
- **Config version history**: Supabase keeps only the latest row. If rollback matters, add an `config_history` insert trigger later, or periodically commit exports to the repo.
- **Honorable-mention cleanups from the review** (triplicated admin list renderers, duplicated blob-download helpers, magic-number caps for perks/psycasts): real but low-value; fold into future feature work touching those files rather than churning them now.
