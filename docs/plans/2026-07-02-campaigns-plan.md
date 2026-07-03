# Campaigns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Campaigns players can join: every signed-in account sees every campaign's sheets; only the owning player (or the campaign's GM) can edit a sheet.

**Architecture:** Two new Supabase tables (`campaigns`, `characters`) readable by any authenticated account, writable per-row by owner/GM via RLS. Cloud characters live in the existing in-memory `CHARACTERS` map tagged with `_cloud: {campaign_id, owner_id}`; the tag routes the existing debounced save to a Supabase upsert instead of localStorage (which filters `_cloud` entries out). Other players' sheets render through the normal renderers, then a post-render pass disables all controls (view-only). No realtime — viewers refresh.

**Tech Stack:** Vanilla JS, supabase-js v2 via CDN (index.html gains it, same guarded pattern as admin.html), Supabase Postgres + RLS + email/password auth, `node --test` for pure helpers.

**Reference design:** `docs/plans/2026-07-02-campaigns-design.md` — read it first.

**Conventions from this repo:** run tests with `node --test` from the repo root (NOT `node --test tests/`). Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Headless smoke checks use `"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --virtual-time-budget=10000 --dump-dom <url>` against a local static server (see Task 3). Line anchors below are as of commit `9a9fe2e` — search for the quoted code, don't trust offsets.

---

### Task 1: Database schema + RLS (SQL file, user runs it, curl verification)

**Files:**
- Create: `campaigns-setup.sql` (untracked one-time artifact, like `supabase-setup.sql`)

**Step 1: Write the file**

```sql
-- NNG campaigns: schema + RLS (paste into Supabase SQL Editor, run once)
create table public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  gm_id      uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.characters (
  id          text primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id    uuid not null references auth.users(id),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.campaigns  enable row level security;
alter table public.characters enable row level security;

create policy "Members read campaigns"  on public.campaigns  for select to authenticated using (true);
create policy "Create own campaign"     on public.campaigns  for insert to authenticated with check (gm_id = auth.uid());
create policy "GM updates campaign"     on public.campaigns  for update to authenticated using (gm_id = auth.uid());
create policy "GM deletes campaign"     on public.campaigns  for delete to authenticated using (gm_id = auth.uid());

create policy "Members read characters" on public.characters for select to authenticated using (true);
create policy "Own characters insert"   on public.characters for insert to authenticated with check (owner_id = auth.uid());
create policy "Owner or GM update"      on public.characters for update to authenticated
  using (owner_id = auth.uid()
         or exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid()));
create policy "Owner or GM delete"      on public.characters for delete to authenticated
  using (owner_id = auth.uid()
         or exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid()));
```

(Known accepted looseness for a trusted group: the update policy has no `with check`, so an owner could hand a character to someone else by changing `owner_id`. Fine here.)

**Step 2: USER runs it** — Supabase dashboard → SQL Editor → paste → Run. Also: Authentication → Users → Add user for each player (email + password). This is a human step; pause and ask.

**Step 3: Verify RLS from the shell** (anon key is in `supabase-config.js`)

```bash
ANON=$(grep -o "SUPABASE_ANON_KEY = '[^']*'" "d:/Code/Character Sheet NNG/supabase-config.js" | cut -d"'" -f2)
URL=https://fjhkqiuopbwdzvuomoxp.supabase.co
# anonymous read: policies are `to authenticated`, so anon sees zero rows, not an error
curl -s "$URL/rest/v1/campaigns?select=id" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
# expect: []
curl -s -X POST "$URL/rest/v1/campaigns" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"name":"evil","gm_id":"00000000-0000-0000-0000-000000000000"}'
# expect: RLS violation error (42501)
```

**Step 4: No commit** (file stays untracked; `git status` should show it under untracked alongside `supabase-setup.sql`).

---

### Task 2: Pure helpers `canEditCharacter` + `stripCloudMeta` in util.js (TDD)

**Files:**
- Modify: `util.js`
- Modify: `tests/util.test.js`

**Step 1: Write the failing tests** (append to `tests/util.test.js`; the require line at the top becomes `const { escHtml, canEditCharacter, stripCloudMeta } = require('../util.js');`)

```js
test('canEditCharacter: local characters are always editable', () => {
  assert.strictEqual(canEditCharacter({ name: 'A' }, null, {}), true);
  assert.strictEqual(canEditCharacter({ name: 'A' }, 'user-1', {}), true);
});

test('canEditCharacter: cloud characters editable by owner', () => {
  const char = { _cloud: { campaign_id: 'c1', owner_id: 'user-1' } };
  assert.strictEqual(canEditCharacter(char, 'user-1', {}), true);
  assert.strictEqual(canEditCharacter(char, 'user-2', {}), false);
  assert.strictEqual(canEditCharacter(char, null, {}), false);
});

test('canEditCharacter: campaign GM can edit any sheet in their campaign', () => {
  const char = { _cloud: { campaign_id: 'c1', owner_id: 'user-1' } };
  const campaignsById = { c1: { id: 'c1', gm_id: 'gm-9' } };
  assert.strictEqual(canEditCharacter(char, 'gm-9', campaignsById), true);
  assert.strictEqual(canEditCharacter(char, 'gm-9', {}), false);
});

test('stripCloudMeta removes _cloud and nothing else', () => {
  const char = { id: 'x', name: 'A', _cloud: { campaign_id: 'c1', owner_id: 'u1' } };
  assert.deepStrictEqual(stripCloudMeta(char), { id: 'x', name: 'A' });
  assert.deepStrictEqual(stripCloudMeta({ id: 'y' }), { id: 'y' });
});
```

**Step 2: Run `node --test` — expect 4 new FAILs** (not a function / not exported).

**Step 3: Implement in `util.js`** (inside the IIFE, after `escHtml`; extend both export lines)

```js
  /**
   * Whether userId may edit this character: local characters always,
   * cloud characters only for their owner or the campaign's GM.
   */
  function canEditCharacter(char, userId, campaignsById) {
    if (!char._cloud) return true;
    if (!userId) return false;
    if (char._cloud.owner_id === userId) return true;
    const campaign = (campaignsById || {})[char._cloud.campaign_id];
    return !!(campaign && campaign.gm_id === userId);
  }

  /** Character data as stored/exported — without the runtime _cloud tag. */
  function stripCloudMeta(char) {
    const { _cloud, ...rest } = char;
    return rest;
  }
```

and:

```js
  if (typeof window !== 'undefined') {
    window.escHtml = escHtml;
    window.canEditCharacter = canEditCharacter;
    window.stripCloudMeta = stripCloudMeta;
  }
  if (typeof module !== 'undefined') module.exports = { escHtml, canEditCharacter, stripCloudMeta };
```

**Step 4: Run `node --test` — all pass (11 total).**

**Step 5: Commit**

```bash
git add util.js tests/util.test.js
git commit -m "feat: add canEditCharacter/stripCloudMeta helpers for campaigns"
```

---

### Task 3: `campaign-store.js` + index.html wiring

**Files:**
- Create: `campaign-store.js`
- Modify: `index.html` (script block)

**Step 1: Create `campaign-store.js`**

```js
// =============================================
// CAMPAIGN STORE
// Auth + campaign/character persistence against
// Supabase, for index.html. Wraps supabase-js
// (CDN); every method throws on error so callers
// surface failures. `available` is false when the
// CDN SDK failed to load — the app then behaves
// exactly like the pre-campaign, local-only sheet.
// =============================================
(function () {
  'use strict';

  const sb = (typeof supabase !== 'undefined')
    ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function _need() {
    if (!sb) throw new Error('Supabase SDK not loaded');
    return sb;
  }

  async function getSession() {
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  async function signIn(email, password) {
    const { data, error } = await _need().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  async function signOut() {
    await _need().auth.signOut();
  }

  async function listCampaigns() {
    const { data, error } = await _need().from('campaigns').select('id,name,gm_id').order('created_at');
    if (error) throw error;
    return data;
  }

  async function createCampaign(name) {
    const session = await getSession();
    const { data, error } = await _need().from('campaigns')
      .insert({ name, gm_id: session.user.id }).select().single();
    if (error) throw error;
    return data;
  }

  async function listCharacters() {
    const { data, error } = await _need().from('characters').select('id,campaign_id,owner_id,data');
    if (error) throw error;
    return data;
  }

  async function fetchCharacter(id) {
    const { data, error } = await _need().from('characters')
      .select('id,campaign_id,owner_id,data').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  /** char must carry a _cloud tag; data is stored without it. */
  async function upsertCharacter(char) {
    const { error } = await _need().from('characters').upsert({
      id: char.id,
      campaign_id: char._cloud.campaign_id,
      owner_id: char._cloud.owner_id,
      data: window.stripCloudMeta(char),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async function deleteCharacter(id) {
    const { error } = await _need().from('characters').delete().eq('id', id);
    if (error) throw error;
  }

  window.CampaignStore = {
    available: !!sb,
    getSession, signIn, signOut,
    listCampaigns, createCampaign,
    listCharacters, fetchCharacter, upsertCharacter, deleteCharacter
  };
})();
```

**Step 2: `index.html`** — script block becomes:

```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="util.js"></script>
  <script src="supabase-config.js"></script>
  <script src="remote-config.js"></script>
  <script src="campaign-store.js"></script>
  <script src="dice.js"></script>
  <script src="roll20-bridge.js"></script>
  <script src="weapon-store.js"></script>
  <script src="app.js"></script>
```

(update the load-order comment above it too)

**Step 3: Verify** — `node --check campaign-store.js`. Start the throwaway static server if not running (`node <scratchpad>/serve.js` pattern from earlier sessions, or any static server on :8123), then headless-Edge dump `http://localhost:8123/index.html` and confirm the roster still renders ("Character Vault", "New Character") — i.e. the new scripts don't break boot.

**Step 4: Commit**

```bash
git add campaign-store.js index.html
git commit -m "feat: add CampaignStore (auth + campaign/character persistence)"
```

---

### Task 4: Save routing — cloud characters persist to Supabase, never to localStorage

**Files:**
- Modify: `app.js`

**Step 1: New state near the top of app.js** (after `let SAVE_TIMER = null;`):

```js
let CURRENT_USER = null;   // supabase user object when signed in
let CAMPAIGNS = [];        // [{id, name, gm_id}]
let CAMPAIGNS_BY_ID = {};  // same, keyed by id
let VIEW_ONLY = false;     // true when the open sheet belongs to someone else
```

**Step 2: `saveAllCharacters` writes only local characters.** The `JSON.stringify(CHARACTERS)` line becomes:

```js
    const localOnly = {};
    for (const [id, c] of Object.entries(CHARACTERS)) {
      if (!c._cloud) localOnly[id] = c;
    }
    localStorage.setItem(STORAGE_CHARS_KEY, JSON.stringify(localOnly));
```

(the surrounding try/catch, indicator error handling, and `return true/false` stay exactly as they are)

**Step 3: Add `persistCharacter` after `saveAllCharacters`** — one async gateway both paths flow through:

```js
/**
 * Persist one character to wherever it lives: Supabase for campaign
 * characters, the shared localStorage blob for local ones.
 * Resolves false (and shows the error indicator) on failure.
 */
async function persistCharacter(char) {
  if (!char || !char._cloud) return saveAllCharacters();
  try {
    await window.CampaignStore.upsertCharacter(char);
    return true;
  } catch (err) {
    console.error('Failed to save character to campaign:', err);
    const indicator = document.getElementById('save-indicator');
    if (indicator) {
      indicator.className = 'save-indicator error';
      indicator.querySelector('.save-dot-label').textContent = 'Save FAILED — are you signed in?';
    }
    return false;
  }
}
```

**Step 4: Route `scheduleSave` through it and guard view-only.** The function becomes:

```js
function scheduleSave() {
  if (VIEW_ONLY) return; // read-only sheets never save (RLS enforces this server-side too)
  const indicator = document.getElementById('save-indicator');
  if (indicator) { indicator.className = 'save-indicator saving'; indicator.querySelector('.save-dot-label').textContent = 'Saving…'; }
  clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(async () => {
    if (!await persistCharacter(getChar())) return;
    if (indicator) {
      ...existing "saved → auto-save on" indicator code, unchanged...
    }
  }, 600);
}
```

Note: `persistCharacter(getChar())` falls back to `saveAllCharacters()` when there's no active char (`getChar()` returns undefined at the roster) — same behavior as today.

**Step 5: Exports must not leak the runtime tag.** In `exportCharacter`, `JSON.stringify(char, null, 2)` becomes `JSON.stringify(stripCloudMeta(char), null, 2)`.

**Step 6: Verify** — `node --check app.js`; `node --test` (11 pass); headless boot of index.html still renders the roster; manually in a browser: create/edit a local character and confirm localStorage saves + "Saved" indicator still work (no cloud involved yet).

**Step 7: Commit**

```bash
git add app.js
git commit -m "feat: route character saves by storage tag (localStorage vs Supabase)"
```

---

### Task 5: Roster sign-in + campaigns section

**Files:**
- Modify: `app.js` (renderRoster + new functions)
- Modify: `style.css`

**Step 1: Restructure `renderRoster`.** Its `screen.innerHTML` template becomes:

```js
  screen.innerHTML = `
    <h1 class="roster-title">⚔ Character Vault</h1>
    <p class="roster-subtitle">${CONFIG.system} · Select or create a character</p>
    <div class="roster-section-header">My Characters <span class="roster-section-note">(this device only)</span></div>
    <div class="roster-grid" id="roster-grid"></div>
    <div id="campaign-area"></div>
  `;
```

Everything else in `renderRoster` stays; add `renderCampaignArea();` as its final line (fire-and-forget async).

**Step 2: Add the campaign area renderer** (new section after `renderRoster`):

```js
// -----------------------------------------------
// CAMPAIGNS (roster section)
// -----------------------------------------------
async function renderCampaignArea() {
  const area = document.getElementById('campaign-area');
  if (!area) return;
  if (!window.CampaignStore.available) {
    area.innerHTML = `<div class="roster-section-header">Campaigns</div>
      <p class="campaign-note">Campaign service unavailable (offline?). Local characters are unaffected.</p>`;
    return;
  }

  const session = await window.CampaignStore.getSession();
  CURRENT_USER = session ? session.user : null;

  if (!CURRENT_USER) {
    area.innerHTML = `
      <div class="roster-section-header">Campaigns</div>
      <div class="campaign-signin">
        <input class="field-input" id="camp-email" type="email" placeholder="Player email">
        <input class="field-input" id="camp-password" type="password" placeholder="Password">
        <button class="btn btn-primary" id="camp-signin-btn">Sign In</button>
      </div>
      <p class="campaign-note">Sign in to see your group's campaigns. Ask the GM for an account.</p>`;
    document.getElementById('camp-signin-btn').addEventListener('click', async () => {
      try {
        await window.CampaignStore.signIn(
          document.getElementById('camp-email').value.trim(),
          document.getElementById('camp-password').value
        );
        renderCampaignArea();
      } catch (err) {
        alert(`Sign-in failed: ${err.message}`);
      }
    });
    return;
  }

  let characters;
  try {
    [CAMPAIGNS, characters] = await Promise.all([
      window.CampaignStore.listCampaigns(),
      window.CampaignStore.listCharacters()
    ]);
  } catch (err) {
    area.innerHTML = `<div class="roster-section-header">Campaigns</div>
      <p class="campaign-note">Couldn't load campaigns: ${escHtml(err.message)}</p>`;
    return;
  }
  CAMPAIGNS_BY_ID = Object.fromEntries(CAMPAIGNS.map(c => [c.id, c]));

  area.innerHTML = `
    <div class="roster-section-header">Campaigns
      <span class="campaign-account">${escHtml(CURRENT_USER.email)} · <a href="#" id="camp-signout">sign out</a></span>
    </div>
    <div id="campaign-blocks"></div>
    <button class="btn btn-secondary mt-md" id="new-campaign-btn">＋ New Campaign</button>`;

  document.getElementById('camp-signout').addEventListener('click', async e => {
    e.preventDefault();
    await window.CampaignStore.signOut();
    CURRENT_USER = null;
    renderRoster();
  });
  document.getElementById('new-campaign-btn').addEventListener('click', async () => {
    const name = (prompt('Campaign name:') || '').trim();
    if (!name) return;
    try { await window.CampaignStore.createCampaign(name); renderCampaignArea(); }
    catch (err) { alert(`Couldn't create campaign: ${err.message}`); }
  });

  const blocks = document.getElementById('campaign-blocks');
  CAMPAIGNS.forEach(campaign => {
    blocks.appendChild(buildCampaignBlock(campaign, characters.filter(r => r.campaign_id === campaign.id)));
  });
  if (CAMPAIGNS.length === 0) {
    blocks.innerHTML = '<p class="campaign-note">No campaigns yet — create one below.</p>';
  }

  addMoveButtonsToLocalCards();
}

function cloudRowToChar(row) {
  return { ...row.data, id: row.id, _cloud: { campaign_id: row.campaign_id, owner_id: row.owner_id } };
}

function buildCampaignBlock(campaign, rows) {
  const block = document.createElement('div');
  block.className = 'campaign-block';
  const isGM = campaign.gm_id === CURRENT_USER.id;
  block.innerHTML = `
    <div class="campaign-block-header">${escHtml(campaign.name)}${isGM ? ' <span class="admin-item-badge badge-official">GM</span>' : ''}</div>
    <div class="roster-grid"></div>`;
  const grid = block.querySelector('.roster-grid');

  rows.forEach(row => {
    const char = cloudRowToChar(row);
    const mine = row.owner_id === CURRENT_USER.id;
    const editable = canEditCharacter(char, CURRENT_USER.id, CAMPAIGNS_BY_ID);
    const card = document.createElement('div');
    card.className = 'roster-card' + (editable ? '' : ' roster-card-readonly');
    card.innerHTML = `
      ${editable ? `<button class="roster-card-delete" title="Remove from campaign">✕</button>` : ''}
      <div class="roster-card-name">${escHtml(char.name)}</div>
      <div class="roster-card-info">
        <span>${escHtml(char.player_name || (mine ? 'you' : 'party member'))}</span>
        <span>Lv ${char.level}</span>
        ${editable ? '' : '<span title="View only">👁</span>'}
      </div>`;
    card.addEventListener('click', e => {
      if (e.target.matches('.roster-card-delete')) return;
      CHARACTERS[char.id] = char;
      openCharacter(char.id);
    });
    const del = card.querySelector('.roster-card-delete');
    if (del) del.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Remove "${char.name}" from the campaign? (Export it first if you want a copy.)`)) return;
      try {
        await window.CampaignStore.deleteCharacter(char.id);
        delete CHARACTERS[char.id];
        renderCampaignArea();
      } catch (err) { alert(`Couldn't delete: ${err.message}`); }
    });
    grid.appendChild(card);
  });

  const newBtn = document.createElement('button');
  newBtn.className = 'roster-new-btn';
  newBtn.innerHTML = `<span class="plus-icon">＋</span><span>New Character here</span>`;
  newBtn.addEventListener('click', async () => {
    const id = 'char_' + Date.now();
    const char = buildDefaultCharacter(id);
    char._cloud = { campaign_id: campaign.id, owner_id: CURRENT_USER.id };
    CHARACTERS[id] = char;
    if (await persistCharacter(char)) openCharacter(id);
    else alert('Could not create the character in the campaign.');
  });
  grid.appendChild(newBtn);
  return block;
}
```

**Step 3: `style.css`** — add near the roster styles:

```css
.roster-section-header { font-family: var(--font-display, inherit); font-size: 1.1rem; margin: 24px 0 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.roster-section-note, .campaign-note { color: var(--text-muted); font-size: 0.8rem; text-transform: none; letter-spacing: normal; }
.campaign-account { float: right; font-size: 0.8rem; text-transform: none; letter-spacing: normal; }
.campaign-signin { display: flex; gap: 8px; flex-wrap: wrap; max-width: 520px; }
.campaign-block { margin-bottom: 20px; }
.campaign-block-header { font-weight: 600; margin: 12px 0 8px; }
.roster-card-readonly { opacity: 0.85; }
```

(If `roster-screen` is a centered flex column, check the section headers/grids stretch full width — adjust with `width: 100%` on `.roster-section-header`, `#campaign-area` if needed.)

**Step 4: Verify** — `node --check app.js`; `node --test`; headless boot (signed out: roster shows "My Characters" header + Campaigns sign-in inputs). Then a real browser: sign in with the GM account, create a campaign, add a character in it, edit a field, reload — the character persists (Supabase Table Editor shows the row and `updated_at` moves on edit).

**Step 5: Commit**

```bash
git add app.js style.css
git commit -m "feat: roster sign-in and campaigns section with party grids"
```

---

### Task 6: Move a local character into a campaign

**Files:**
- Modify: `app.js`

**Step 1: Add move buttons to local cards** (called at the end of `renderCampaignArea` — already referenced there):

```js
function addMoveButtonsToLocalCards() {
  if (!CURRENT_USER || CAMPAIGNS.length === 0) return;
  document.querySelectorAll('#roster-grid .roster-card').forEach(card => {
    const del = card.querySelector('.roster-card-delete');
    if (!del) return; // the "new character" button has no delete
    const id = del.dataset.id;
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary roster-card-move';
    btn.textContent = '☁ Move to campaign…';
    btn.addEventListener('click', e => { e.stopPropagation(); openMoveModal(id); });
    card.appendChild(btn);
  });
}

function openMoveModal(charId) {
  const char = CHARACTERS[charId];
  if (!char) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">Move "${escHtml(char.name)}" to a campaign</div>
      <p class="campaign-note">The character will live in the campaign and leave this device's local list. (Export/Import brings it back.)</p>
      <div class="modal-actions" style="flex-direction:column; align-items:stretch">
        ${CAMPAIGNS.map(c => `<button class="btn btn-primary" data-camp="${c.id}">${escHtml(c.name)}</button>`).join('')}
        <button class="btn btn-secondary" data-cancel>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('[data-cancel]').addEventListener('click', () => backdrop.remove());
  backdrop.querySelectorAll('[data-camp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      char._cloud = { campaign_id: btn.dataset.camp, owner_id: CURRENT_USER.id };
      if (await persistCharacter(char)) {
        saveAllCharacters(); // rewrites localStorage without it (now tagged _cloud)
        backdrop.remove();
        renderRoster();
      } else {
        delete char._cloud; // failed upload — stays local
        alert('Move failed — the character is still local.');
      }
    });
  });
}
```

**Step 2: `style.css`** — `.roster-card-move { margin-top: 8px; font-size: 0.75rem; width: 100%; }`

**Step 3: Verify in a browser** — signed in with ≥1 campaign: local card shows the move button; moving uploads the row (Table Editor), removes it from the local section, shows it in the campaign grid; localStorage (`ttrpg_characters`) no longer contains it. Signed out: no move buttons.

**Step 4: Commit**

```bash
git add app.js style.css
git commit -m "feat: move local characters into a campaign"
```

---

### Task 7: View-only mode for other players' sheets

**Files:**
- Modify: `app.js`

**Step 1: Set the flag in `openCharacter`** — after `ACTIVE_ID = id;`:

```js
  VIEW_ONLY = !canEditCharacter(getChar(), CURRENT_USER && CURRENT_USER.id, CAMPAIGNS_BY_ID);
```

and after `renderSheet();` add `applyViewOnlyMode();` (before `switchTab('tab-info')`).

**Step 2: Implement the post-render pass** (near renderSheet):

```js
// -----------------------------------------------
// VIEW-ONLY MODE
// Someone else's campaign sheet: render normally,
// then disable every control except tab navigation
// and the back button, and offer a Refresh that
// re-pulls their latest save. scheduleSave is also
// VIEW_ONLY-guarded; RLS enforces it server-side.
// -----------------------------------------------
function applyViewOnlyMode() {
  const existing = document.getElementById('view-refresh-btn');
  if (existing) existing.remove();
  if (!VIEW_ONLY) return;

  document.querySelectorAll('#app-screen input, #app-screen select, #app-screen textarea, #app-screen button')
    .forEach(el => {
      if (el.classList.contains('tab-btn') || el.classList.contains('top-bar-back')) return;
      el.disabled = true;
    });

  const actions = document.querySelector('.top-bar-actions');
  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary';
  btn.id = 'view-refresh-btn';
  btn.textContent = '↻ Refresh';
  btn.addEventListener('click', async () => {
    try {
      const row = await window.CampaignStore.fetchCharacter(ACTIVE_ID);
      CHARACTERS[ACTIVE_ID] = cloudRowToChar(row);
      renderSheet();
      applyViewOnlyMode();
    } catch (err) { alert(`Refresh failed: ${err.message}`); }
  });
  actions.prepend(btn);
}
```

Notes for the implementer: the top-bar back control is `<button class="top-bar-back" onclick="showRoster()">` in index.html — it must stay usable (hence the class check). The Export/Import top-bar buttons get disabled by this pass (they're plain buttons) — that matches the design ("everything except tabs"); the refresh button is created after the pass so it stays enabled. `scheduleSave` already returns early when `VIEW_ONLY` (Task 4).

**Step 3: Reset the flag when leaving** — in `showRoster()`, after `ACTIVE_ID = null;` add `VIEW_ONLY = false;`.

**Step 4: Verify** — needs two accounts (or GM + player): as player B open player A's sheet — every field/button disabled, tabs switch, Refresh pulls A's latest edit; as the campaign GM open A's sheet — fully editable; open your own — editable, no Refresh button. `node --check app.js`; `node --test`.

**Step 5: Commit**

```bash
git add app.js
git commit -m "feat: view-only rendering of other players' campaign sheets"
```

---

### Task 8: README, deploy, live two-account test

**Files:**
- Modify: `README.md`

**Step 1: README** — add after the "Shared configs" section:

```markdown
## Campaigns

Signed-in players can put characters into shared campaigns. Everyone with an account sees every campaign's sheets; only the owning player (and the campaign's GM) can edit a sheet — others get a read-only view with a Refresh button.

- Accounts are created by the GM in the Supabase dashboard (there is no self-signup).
- Sign in from the roster screen's Campaigns section.
- "Move to campaign…" on a local character uploads it; it then lives in the cloud and autosaves there. Export/Import still works for backups.
- Characters not in a campaign stay local to your browser, as always.
```

**Step 2: Merge/push** — per this repo's convention, merge the feature branch to `main` and push (ask the user first — pushing main deploys the live site). GitHub Pages legacy build sometimes hangs in "building"; if the live site is stale after ~5 minutes, `POST /repos/dolltj/NNG/pages/builds` with the stored git credential kicks it loose.

**Step 3: Live verification** — headless boot of the live URL; then the real test with the user: GM account + one player account, one campaign, player edits own sheet, GM sees it on refresh and can edit it, player B (or GM in an incognito window with the player account) cannot edit what they don't own, and an anonymous curl still gets `[]` from `/rest/v1/characters`.

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document campaigns"
```

---

## Out of scope (deliberate YAGNI)

- Campaign membership/walls, join codes (design chose visible-to-all-accounts).
- Realtime sync while both sheets are open (refresh-on-demand only).
- Moving a character back out of a campaign (Export/Import covers it).
- Display-name profiles (cards show the sheet's own `player_name` field).
- Multi-device conflict resolution (single owner, last write wins).
