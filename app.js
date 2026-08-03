// =============================================
// TTRPG CHARACTER SHEET — MAIN APP
// =============================================

'use strict';

// -----------------------------------------------
// STATE
// -----------------------------------------------
let CONFIG        = null;   // loaded from nng.json
let WEAPON_CONFIG  = null;  // loaded from weapons.json — { weapons: [], attachments: [] }
let PERKS_CONFIG  = null;   // loaded from perks.json — array of perk dictionary entries
let CHARACTERS    = {};     // { [id]: characterObject }
let ACTIVE_ID     = null;   // currently open character id
let SAVE_TIMER    = null;   // debounce handle for autosave
let CURRENT_USER = null;   // supabase user object when signed in
let CAMPAIGNS = [];        // [{id, name, gm_id}]
let CAMPAIGNS_BY_ID = {};  // same, keyed by id
let VIEW_ONLY = false;     // true when the open sheet belongs to someone else

const STORAGE_CHARS_KEY  = 'ttrpg_characters';
const STORAGE_ACTIVE_KEY = 'ttrpg_active_id';
const CONFIG_URL         = 'config/nng.json';
const WEAPONS_CONFIG_URL  = 'config/weapons.json';
const PERKS_CONFIG_URL    = 'config/perks.json';

// -----------------------------------------------
// BOOTSTRAP
// -----------------------------------------------
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
    openCharacter(lastId); // resume where the player left off
  } else {
    renderRoster();
  }
});

// -----------------------------------------------
// CONFIG LOADER
// -----------------------------------------------
async function loadConfig(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load config: ${url}`);
  return resp.json();
}

// -----------------------------------------------
// CHARACTER STORAGE (localStorage)
// -----------------------------------------------
function loadAllCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_CHARS_KEY);
    CHARACTERS = raw ? JSON.parse(raw) : {};
  } catch {
    CHARACTERS = {};
  }
}

function saveAllCharacters() {
  try {
    const localOnly = {};
    for (const [id, c] of Object.entries(CHARACTERS)) {
      if (!c._cloud) localOnly[id] = c;
    }
    localStorage.setItem(STORAGE_CHARS_KEY, JSON.stringify(localOnly));
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

function scheduleSave() {
  if (VIEW_ONLY) return; // read-only sheets never save (RLS enforces this server-side too)
  const indicator = document.getElementById('save-indicator');
  if (indicator) { indicator.className = 'save-indicator saving'; indicator.querySelector('.save-dot-label').textContent = 'Saving…'; }
  clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(async () => {
    if (!await persistCharacter(getChar())) return;
    if (indicator) {
      indicator.className = 'save-indicator saved';
      indicator.querySelector('.save-dot-label').textContent = 'Saved';
      setTimeout(() => {
        indicator.className = 'save-indicator';
        indicator.querySelector('.save-dot-label').textContent = 'Auto-save on';
      }, 2000);
    }
  }, 600);
}

function newCharacter() {
  const id = 'char_' + Date.now();
  const char = buildDefaultCharacter(id);
  CHARACTERS[id] = char;
  saveAllCharacters();
  return id;
}

function deleteCharacter(id) {
  delete CHARACTERS[id];
  saveAllCharacters();
  if (ACTIVE_ID === id) {
    ACTIVE_ID = null;
    localStorage.removeItem(STORAGE_ACTIVE_KEY);
    showRoster();
  }
}

function buildDefaultCharacter(id) {
  const stats = {};
  CONFIG.core_stats.forEach(s => { stats[s.id] = s.default; });

  const resources = {};
  CONFIG.tracked_resources.forEach(r => {
    resources[r.id] = { current: r.default_current, max: r.default_max ?? null };
  });

  const skills = {};
  CONFIG.skills.forEach(s => { skills[s.id] = { bonus: 0, rank: 0 }; });

  return {
    id,
    name:        'New Character',
    player_name: '',
    origin:      '',
    level:       1,
    core_stats:  stats,
    resources,
    armor: { head: 0, body: 0 },
    speed: 30,
    initiative_bonus: 0,
    skills,
    perks:        [],
    show_all_perks: false,
    origin_perk:  { name: '', description: '' },
    injuries:           [],
    critical_injuries:  [],
    conditions:         [],
    weapons:      [],
    psycasts:     [],
    equipment:    [],
    notes:        ''
  };
}

// -----------------------------------------------
// ROSTER SCREEN
// -----------------------------------------------
function renderRoster() {
  const screen = document.getElementById('roster-screen');
  screen.innerHTML = `
    <h1 class="roster-title">⚔ Character Vault</h1>
    <p class="roster-subtitle">${CONFIG.system} · Select or create a character</p>
    <div class="roster-section-header">My Characters <span class="roster-section-note">(this device only)</span></div>
    <div class="roster-grid" id="roster-grid"></div>
    <div id="campaign-area"></div>
  `;
  const grid = document.getElementById('roster-grid');

  // Existing local characters (cloud characters opened this session are in
  // CHARACTERS too, but they belong to the campaign grids, not this one)
  Object.values(CHARACTERS).filter(c => !c._cloud).forEach(char => {
    const card = document.createElement('div');
    card.className = 'roster-card';
    card.innerHTML = `
      <button class="roster-card-delete" title="Delete character" data-id="${char.id}">✕</button>
      <div class="roster-card-name">${escHtml(char.name)}</div>
      <div class="roster-card-info">
        ${char.origin  ? `<span>${escHtml(char.origin)}</span>` : ''}
        <span>Lv ${char.level}</span>
      </div>
    `;
    card.addEventListener('click', (e) => {
      if (!e.target.matches('.roster-card-delete')) openCharacter(char.id);
    });
    card.querySelector('.roster-card-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${char.name}"? This cannot be undone.`)) {
        deleteCharacter(char.id);
        renderRoster();
      }
    });
    grid.appendChild(card);
  });

  // New character button
  const newBtn = document.createElement('button');
  newBtn.className = 'roster-new-btn';
  newBtn.innerHTML = `<span class="plus-icon">＋</span><span>New Character</span>`;
  newBtn.addEventListener('click', () => {
    const id = newCharacter();
    openCharacter(id);
  });
  grid.appendChild(newBtn);

  renderCampaignArea();
}

function showRoster() {
  ACTIVE_ID = null;
  VIEW_ONLY = false;
  localStorage.removeItem(STORAGE_ACTIVE_KEY);
  document.getElementById('roster-screen').style.display = 'flex';
  document.getElementById('app-screen').classList.remove('active');
  renderRoster();
}

// -----------------------------------------------
// CAMPAIGNS (roster section)
// -----------------------------------------------
async function renderCampaignArea() {
  const area = document.getElementById('campaign-area');
  if (!area) return;
  // renderRoster also fires while the sheet is open (e.g. name edits update
  // the roster behind it) — don't refetch campaigns invisibly for those.
  if (document.getElementById('roster-screen').style.display === 'none') return;
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
  if (CAMPAIGNS.length === 0) {
    blocks.innerHTML = '<p class="campaign-note">No campaigns yet — create one below.</p>';
  }
  CAMPAIGNS.forEach(campaign => {
    blocks.appendChild(buildCampaignBlock(campaign, characters.filter(r => r.campaign_id === campaign.id)));
  });
  const orphans = characters.filter(r => !r.campaign_id);
  if (orphans.length > 0) {
    blocks.appendChild(buildOrphanBlock(orphans));
  }

  addMoveButtonsToLocalCards();
}

function cloudRowToChar(row) {
  const base = buildDefaultCharacter(row.id);
  const data = row.data || {};
  return {
    ...base,
    ...data,
    // Deep-merge collections so new keys added to CONFIG are always present
    core_stats:  { ...base.core_stats,  ...(data.core_stats  || {}) },
    resources:   { ...base.resources,   ...(data.resources   || {}) },
    skills:      { ...base.skills,      ...(data.skills      || {}) },
    armor:       { ...base.armor,       ...(data.armor       || {}) },
    origin_perk: { ...base.origin_perk, ...(data.origin_perk || {}) },
    id:     row.id,
    _cloud: { campaign_id: row.campaign_id, owner_id: row.owner_id }
  };
}

function buildCampaignBlock(campaign, rows) {
  const block = document.createElement('div');
  block.className = 'campaign-block';
  const isGM = campaign.gm_id === CURRENT_USER.id;
  block.innerHTML = `
    <div class="campaign-block-header">${escHtml(campaign.name)}${isGM
      ? ' <span class="admin-item-badge badge-official">GM</span> <button class="delete-item-btn" data-del-campaign title="Delete campaign (characters are kept)">✕</button>'
      : ''}</div>
    <div class="roster-grid"></div>`;
  const grid = block.querySelector('.roster-grid');

  const delCampaignBtn = block.querySelector('[data-del-campaign]');
  if (delCampaignBtn) delCampaignBtn.addEventListener('click', async () => {
    if (!confirm(`Delete campaign "${campaign.name}"?\n\nIts characters are NOT deleted — they move to "Not in a campaign", where their owners can re-home them.`)) return;
    try {
      await window.CampaignStore.deleteCampaign(campaign.id);
      renderCampaignArea();
    } catch (err) { alert(`Couldn't delete campaign: ${err.message}`); }
  });

  rows.forEach(row => {
    const char = cloudRowToChar(row);
    const mine = row.owner_id === CURRENT_USER.id;
    const editable = canEditCharacter(char, CURRENT_USER.id, CAMPAIGNS_BY_ID);
    const card = document.createElement('div');
    card.className = 'roster-card' + (editable ? '' : ' roster-card-readonly');
    card.innerHTML = `
      ${editable ? `<button class="roster-card-delete" title="Delete character permanently">✕</button>` : ''}
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
      if (!confirm(`Delete "${char.name}" permanently?\n\nTo keep the character, use "⇄ Move…" → Remove from campaign instead, or Export a copy first.`)) return;
      try {
        await window.CampaignStore.deleteCharacter(char.id);
        delete CHARACTERS[char.id];
        renderCampaignArea();
      } catch (err) { alert(`Couldn't delete: ${err.message}`); }
    });
    if (editable) {
      const move = document.createElement('button');
      move.className = 'btn btn-secondary roster-card-move';
      move.textContent = '⇄ Move…';
      move.addEventListener('click', e => {
        e.stopPropagation();
        CHARACTERS[char.id] = char;
        openMoveModal(char.id);
      });
      card.appendChild(move);
    }
    if (isGM) {
      const assign = document.createElement('button');
      assign.className = 'btn btn-secondary roster-card-move';
      assign.textContent = '👤 Assign…';
      assign.addEventListener('click', e => {
        e.stopPropagation();
        CHARACTERS[char.id] = char;
        openAssignModal(char.id);
      });
      card.appendChild(assign);
    }
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

// Characters whose campaign was deleted: still cloud-owned, editable only by
// their owner (canEditCharacter treats a missing campaign as owner-only,
// mirroring RLS), re-homeable via the same move modal local cards use.
function buildOrphanBlock(rows) {
  const block = document.createElement('div');
  block.className = 'campaign-block';
  block.innerHTML = `
    <div class="campaign-block-header">Not in a campaign</div>
    <div class="roster-grid"></div>`;
  const grid = block.querySelector('.roster-grid');

  rows.forEach(row => {
    const char = cloudRowToChar(row);
    const mine = row.owner_id === CURRENT_USER.id;
    const card = document.createElement('div');
    card.className = 'roster-card' + (mine ? '' : ' roster-card-readonly');
    card.innerHTML = `
      ${mine ? `<button class="roster-card-delete" title="Delete character">✕</button>` : ''}
      <div class="roster-card-name">${escHtml(char.name)}</div>
      <div class="roster-card-info">
        <span>${escHtml(char.player_name || (mine ? 'you' : 'party member'))}</span>
        <span>Lv ${char.level}</span>
        ${mine ? '' : '<span title="View only">👁</span>'}
      </div>`;
    card.addEventListener('click', e => {
      if (e.target.matches('.roster-card-delete')) return;
      CHARACTERS[char.id] = char;
      openCharacter(char.id);
    });
    if (mine) {
      card.querySelector('.roster-card-delete').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete "${char.name}" permanently? (Export it first if you want a copy.)`)) return;
        try {
          await window.CampaignStore.deleteCharacter(char.id);
          delete CHARACTERS[char.id];
          renderCampaignArea();
        } catch (err) { alert(`Couldn't delete: ${err.message}`); }
      });
      if (CAMPAIGNS.length > 0) {
        const move = document.createElement('button');
        move.className = 'btn btn-secondary roster-card-move';
        move.textContent = '☁ Move to campaign…';
        move.addEventListener('click', e => {
          e.stopPropagation();
          CHARACTERS[char.id] = char;
          openMoveModal(char.id);
        });
        card.appendChild(move);
      }
    }
    grid.appendChild(card);
  });

  return block;
}

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

// One modal for every association change: local→campaign (upload), cloud
// transfer between campaigns, and cloud unassign (campaign_id → null, lands
// in "Not in a campaign"). Ownership is preserved on cloud moves — a GM
// re-homing a player's character must not become its owner.
function openMoveModal(charId) {
  const char = CHARACTERS[charId];
  if (!char) return;
  const prevCloud = char._cloud || null;
  const currentCampaignId = prevCloud ? prevCloud.campaign_id : null;
  const targets = CAMPAIGNS.filter(c => c.id !== currentCampaignId);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">Move "${escHtml(char.name)}"</div>
      <p class="campaign-note">${prevCloud
        ? 'Transfers keep the character in the cloud; removing it leaves it under "Not in a campaign".'
        : `The character will live in the campaign and leave this device's local list. (Export/Import brings it back.)`}</p>
      <div class="modal-actions" style="flex-direction:column; align-items:stretch">
        ${targets.map(c => `<button class="btn btn-primary" data-camp="${c.id}">${escHtml(c.name)}</button>`).join('')}
        ${currentCampaignId ? '<button class="btn btn-secondary" data-camp="">⊘ Remove from campaign</button>' : ''}
        <button class="btn btn-secondary" data-cancel>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('[data-cancel]').addEventListener('click', () => backdrop.remove());
  backdrop.querySelectorAll('[data-camp]').forEach(btn => {
    btn.addEventListener('click', async () => {
      char._cloud = {
        campaign_id: btn.dataset.camp || null,
        owner_id: prevCloud ? prevCloud.owner_id : CURRENT_USER.id
      };
      if (await persistCharacter(char)) {
        saveAllCharacters(); // for local origins: drops it from localStorage now that it's cloud-tagged
        backdrop.remove();
        renderRoster();
      } else {
        if (prevCloud) char._cloud = prevCloud;
        else delete char._cloud;
        alert('Move failed — nothing changed.');
      }
    });
  });
}

async function openAssignModal(charId) {
  const char = CHARACTERS[charId];
  if (!char) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">Assign "${escHtml(char.name)}" to player</div>
      <p class="campaign-note">Select a player to become the owner of this character.</p>
      <div style="margin-bottom:12px" id="assign-select-wrap">Loading players…</div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="assign-confirm-btn" disabled>Assign</button>
        <button class="btn btn-secondary" data-cancel>Cancel</button>
      </div>
      <div id="assign-status" style="margin-top:8px;color:#c0392b;font-size:0.85em"></div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('[data-cancel]').addEventListener('click', () => backdrop.remove());

  const wrap = backdrop.querySelector('#assign-select-wrap');
  const confirmBtn = backdrop.querySelector('#assign-confirm-btn');
  const statusEl = backdrop.querySelector('#assign-status');

  try {
    const users = await window.CampaignStore.listUsers();
    const currentOwnerId = char._cloud ? char._cloud.owner_id : null;
    if (!users.length) {
      wrap.textContent = 'No registered players found.';
    } else {
      const sel = document.createElement('select');
      sel.className = 'text-input';
      sel.style.cssText = 'width:100%;box-sizing:border-box';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.user_id;
        opt.textContent = u.email + (u.user_id === currentOwnerId ? ' (current)' : '');
        if (u.user_id === currentOwnerId) opt.selected = true;
        sel.appendChild(opt);
      });
      wrap.textContent = '';
      wrap.appendChild(sel);
      confirmBtn.disabled = false;
    }
  } catch (err) {
    wrap.textContent = `Could not load players: ${err.message}`;
  }

  confirmBtn.addEventListener('click', async () => {
    const sel = wrap.querySelector('select');
    if (!sel) return;
    const newOwnerId = sel.value;
    confirmBtn.disabled = true;
    statusEl.textContent = '';
    try {
      await window.CampaignStore.reassignCharacter(charId, newOwnerId);
      char._cloud = { ...char._cloud, owner_id: newOwnerId };
      backdrop.remove();
      renderCampaignArea();
    } catch (err) {
      statusEl.textContent = `Assignment failed: ${err.message}`;
      confirmBtn.disabled = false;
    }
  });
}

// -----------------------------------------------
// OPEN A CHARACTER
// -----------------------------------------------
// Perks added before the modifiers feature (or via import) were copied
// without their modifiers — refresh them from the current dictionary by
// name so old sheets get the mechanical effects without re-adding perks.
function backfillPerkModifiers(char) {
  (char.perks || []).forEach(perk => {
    if (perk.modifiers) return;
    const def = (PERKS_CONFIG || []).find(p => p.name === perk.name);
    if (def && def.modifiers) perk.modifiers = def.modifiers;
  });
}

function openCharacter(id) {
  ACTIVE_ID = id;
  backfillPerkModifiers(getChar());
  VIEW_ONLY = !canEditCharacter(getChar(), CURRENT_USER && CURRENT_USER.id, CAMPAIGNS_BY_ID);
  localStorage.setItem(STORAGE_ACTIVE_KEY, id);
  document.getElementById('roster-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('active');
  renderSheet();
  applyViewOnlyMode();
  switchTab('tab-info');
}

function getChar() {
  return CHARACTERS[ACTIVE_ID];
}

/**
 * "Character Name (Player Name)" for Roll20 — omits the
 * parenthetical entirely when no player name is set.
 */
function rollCharacterName(char) {
  const name = char?.name || 'Character';
  const player = (char?.player_name || '').trim();
  return player ? `${name} (${player})` : name;
}

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

// -----------------------------------------------
// RENDER FULL SHEET
// -----------------------------------------------
function renderSheet() {
  const char = getChar();
  renderTopBar(char);
  renderTabInfo(char);
  renderTabAbilities(char);
  renderTabCombat(char);
  renderTabActions(char);
  renderTabPsycasts(char);
  renderTabEquipment(char);
  renderTabNotes(char);
}

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

// -----------------------------------------------
// TOP BAR
// -----------------------------------------------
function renderTopBar(char) {
  document.getElementById('top-bar-title').textContent = char.name;
}

// -----------------------------------------------
// TAB NAVIGATION
// -----------------------------------------------
function renderTabNav() {
  // Tabs are static in HTML; just wire up click handlers
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
  if (tabId === 'tab-actions' && getChar()) {
    // Weapons/perks may have changed on other tabs since the last render.
    renderTabActions(getChar());
    applyViewOnlyMode();
  }
}

// -----------------------------------------------
// TAB: CHARACTER INFO
// -----------------------------------------------
function renderTabInfo(char) {
  const panel = document.getElementById('tab-info');
  panel.innerHTML = `
    <div class="section-header">Identity</div>
    <div class="char-info-grid">
      ${infoField('Character Name', 'name', char.name)}
      ${infoField('Player Name', 'player_name', char.player_name)}
      ${infoField('Origin', 'origin', char.origin)}
      ${infoNumberField('Level', 'level', char.level, 1, 99)}
    </div>

    <div class="section-header mt-lg">Origin Perk</div>
    <div class="char-info-grid">
      ${infoField('Perk Name', 'origin_perk_name', char.origin_perk?.name)}
      ${infoTextarea('Perk Description', 'origin_perk_desc', char.origin_perk?.description)}
    </div>

    <div class="section-header mt-lg">Perks <span style="color:var(--text-muted);font-size:0.8rem">(${(char.perks || []).length}/10)</span></div>
    <div id="perks-list"></div>
  `;

  panel.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const key = e.target.dataset.field;
      const val = e.target.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value;
      if (key === 'origin_perk_name') {
        getChar().origin_perk.name = val;
      } else if (key === 'origin_perk_desc') {
        getChar().origin_perk.description = val;
      } else {
        getChar()[key] = val;
        if (key === 'name') {
          document.getElementById('top-bar-title').textContent = val || 'Unnamed';
          renderRoster();
        }
        if (key === 'level') { recalcDerivedStats(); renderTabInfo(getChar()); }
      }
      scheduleSave();
    });
  });

  buildPerksList(document.getElementById('perks-list'), char);
}

function infoField(label, field, value) {
  return `<div class="field-group">
    <label class="field-label">${label}</label>
    <input class="field-input" type="text" data-field="${field}" value="${escHtml(value || '')}">
  </div>`;
}

function infoNumberField(label, field, value, min = 0, max = '') {
  return `<div class="field-group">
    <label class="field-label">${label}</label>
    <input class="field-input" type="number" data-field="${field}" value="${value || 0}" min="${min}" ${max ? `max="${max}"` : ''}>
  </div>`;
}

function infoTextarea(label, field, value, fullWidth = false) {
  return `<div class="field-group ${fullWidth ? 'full-width' : ''}">
    <label class="field-label">${label}</label>
    <textarea class="field-input" data-field="${field}" rows="3">${escHtml(value || '')}</textarea>
  </div>`;
}

// -----------------------------------------------
// TAB: ABILITIES & SKILLS
// -----------------------------------------------
function renderTabAbilities(char) {
  const panel = document.getElementById('tab-abilities');
  panel.innerHTML = '';

  function addSectionHeader(text, extraClass = '') {
    const header = document.createElement('div');
    header.className = `section-header ${extraClass}`.trim();
    header.textContent = text;
    panel.appendChild(header);
  }

  // --- Ability Scores ---
  addSectionHeader('Ability Scores');
  const abGrid = document.createElement('div');
  abGrid.className = 'ability-scores-grid';
  CONFIG.core_stats.forEach(s => abGrid.appendChild(buildAbilityCard(s, char)));
  panel.appendChild(abGrid);

  // --- Resources (HP, Fatigue) ---
  addSectionHeader('Resources', 'mt-md');
  const resGrid = document.createElement('div');
  resGrid.className = 'resources-grid';
  CONFIG.tracked_resources.forEach(r => resGrid.appendChild(buildResourceCard(r, char)));
  panel.appendChild(resGrid);

  // --- Derived stats + rests ---
  addSectionHeader('Recovery', 'mt-md');
  const derivedRow = document.createElement('div');
  derivedRow.className = 'combat-stats-row';
  derivedRow.innerHTML = `
    <div class="combat-stat-chip">
      <span class="combat-stat-chip-label">Injury Threshold</span>
      <span class="combat-stat-chip-value">${deriveInjuryThreshold(char)}</span>
    </div>
    <div class="combat-stat-chip">
      <span class="combat-stat-chip-label">Recovery</span>
      <span class="combat-stat-chip-value">1d10 + ${deriveRecoveryModifier(char)}</span>
    </div>
    <div class="combat-stat-chip">
      <span class="combat-stat-chip-label">Rest</span>
      <span class="combat-stat-chip-value combat-stat-chip-value-row">
        <button class="btn btn-secondary" id="short-rest-btn" title="1 hour — regain 1d10 + FOR + WIL HP and remove one Minor Injury">⏳ Short</button>
        <button class="btn btn-secondary" id="long-rest-btn" title="8 hours — restore all HP and remove all Minor Injuries">🌙 Long</button>
      </span>
    </div>
  `;
  derivedRow.querySelector('#short-rest-btn').addEventListener('click', shortRest);
  derivedRow.querySelector('#long-rest-btn').addEventListener('click', longRest);
  panel.appendChild(derivedRow);

  // --- Skills ---
  addSectionHeader('Skills', 'mt-md');
  const skillsWrap = document.createElement('div');
  skillsWrap.className = 'skills-columns';
  const skillEls = CONFIG.skills.map(s => buildSkillRow(s, char));
  const mid = Math.ceil(skillEls.length / 2);
  [skillEls.slice(0, mid), skillEls.slice(mid)].forEach(half => {
    const col = document.createElement('div');
    col.className = 'skills-column';
    col.appendChild(buildSkillsHeaderRow());
    half.forEach(el => col.appendChild(el));
    skillsWrap.appendChild(col);
  });
  panel.appendChild(skillsWrap);

  // --- Injuries ---
  addSectionHeader('Injuries', 'mt-md');
  const injuriesWrap = document.createElement('div');
  injuriesWrap.id = 'injuries-list';
  panel.appendChild(injuriesWrap);
  buildTextEntryList(injuriesWrap, char.injuries, {
    maxCount: Infinity,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Injury',
    onChange: () => renderTabAbilities(getChar())
  });

  // --- Major Injuries (stored as critical_injuries for back-compat) ---
  const majorCount = (char.critical_injuries || []).length;
  const mjHeader = document.createElement('div');
  mjHeader.className = 'section-header mt-md';
  mjHeader.innerHTML = `Major Injuries
    <button class="ability-roll-btn" id="major-injury-roll-btn"
      title="Dropping to 0 HP: roll 1d10 + your current Major Injuries and consult the Major Injury table">💀 Roll 1d10${majorCount > 0 ? ` + ${majorCount}` : ''}</button>`;
  mjHeader.querySelector('#major-injury-roll-btn').addEventListener('click', () => {
    const n = (getChar().critical_injuries || []).length;
    window.Roll20Bridge.sendToRoll20({
      label: 'Major Injury (0 HP)',
      formula: n > 0 ? `1d10 + ${n}` : '1d10',
      characterName: rollCharacterName(getChar())
    });
  });
  panel.appendChild(mjHeader);
  const critInjuriesWrap = document.createElement('div');
  critInjuriesWrap.id = 'critical-injuries-list';
  panel.appendChild(critInjuriesWrap);
  buildTextEntryList(critInjuriesWrap, char.critical_injuries, {
    maxCount: Infinity,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Major Injury',
    onChange: () => renderTabAbilities(getChar())
  });
}

function buildResourceCard(resDef, char) {
  const res = char.resources[resDef.id] || { current: 0, max: resDef.default_max ?? 0 };
  const maxVal = getResourceMax(resDef, char);
  const card = document.createElement('div');
  card.className = 'resource-card';
  card.id = `res-card-${resDef.id}`;

  const barHtml = resDef.show_bar
    ? `<div class="resource-bar-wrap"><div class="resource-bar-fill" id="res-bar-${resDef.id}"
         style="background:${resDef.color}; width:${calcBarPct(res.current, maxVal)}%"></div></div>`
    : '';

  card.innerHTML = `
    <div class="resource-label">${resDef.label}</div>
    <div class="resource-controls">
      <button class="resource-btn" data-res="${resDef.id}" data-delta="-1">−</button>
      <span class="resource-value-display" id="res-val-${resDef.id}" title="Click to edit">${res.current}</span>
      <input class="resource-value-input" id="res-input-${resDef.id}" type="number" value="${res.current}">
      <span class="resource-max">/ ${
        resDef.derived_max
          ? maxVal
          : `<input class="currency-input" id="res-max-${resDef.id}" style="width:40px" type="number" value="${maxVal ?? 0}" title="Max">`
      }</span>
      <button class="resource-btn" data-res="${resDef.id}" data-delta="+1">＋</button>
    </div>
    ${barHtml}
  `;

  card.querySelectorAll('.resource-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta);
      adjustResource(resDef.id, delta, resDef);
    });
  });

  const barWrap = card.querySelector('.resource-bar-wrap');
  if (barWrap) {
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
  }

  const valDisplay = card.querySelector(`#res-val-${resDef.id}`);
  const valInput   = card.querySelector(`#res-input-${resDef.id}`);
  valDisplay.addEventListener('click', () => {
    valDisplay.style.display = 'none';
    valInput.style.display   = 'block';
    valInput.focus(); valInput.select();
  });
  valInput.addEventListener('blur', () => commitResourceEdit(resDef.id, valInput, valDisplay));
  valInput.addEventListener('keydown', e => { if (e.key === 'Enter') valInput.blur(); });

  const maxInput = card.querySelector(`#res-max-${resDef.id}`);
  if (maxInput) {
    maxInput.addEventListener('change', () => {
      getChar().resources[resDef.id].max = parseInt(maxInput.value) || 0;
      updateResourceDisplay(resDef.id, resDef);
      scheduleSave();
    });
  }

  updateResourceCardState(card, resDef, res, maxVal);
  return card;
}

function commitResourceEdit(resId, input, display) {
  const val = parseInt(input.value) || 0;
  getChar().resources[resId].current = val;
  display.textContent = val;
  display.style.display = 'block';
  input.style.display   = 'none';
  const resDef = CONFIG.tracked_resources.find(r => r.id === resId);
  updateResourceDisplay(resId, resDef);
  scheduleSave();
}

function adjustResource(resId, delta, resDef) {
  const char = getChar();
  const res = char.resources[resId];
  const maxVal = getResourceMax(resDef, char);
  let newVal = (res.current || 0) + delta;
  if (maxVal != null) newVal = Math.min(newVal, maxVal);
  newVal = Math.max(0, newVal);
  res.current = newVal;
  const display = document.getElementById(`res-val-${resId}`);
  if (display) display.textContent = newVal;
  updateResourceDisplay(resId, resDef);
  scheduleSave();
}

function updateResourceDisplay(resId, resDef) {
  const char = getChar();
  const res  = char.resources[resId];
  const maxVal = getResourceMax(resDef, char);
  const bar  = document.getElementById(`res-bar-${resId}`);
  if (bar) bar.style.width = calcBarPct(res.current, maxVal) + '%';
  const card = document.getElementById(`res-card-${resId}`);
  if (card) updateResourceCardState(card, resDef, res, maxVal);
}

function updateResourceCardState(card, resDef, res, maxVal) {
  if (resDef.id === 'hp') {
    const pct = calcBarPct(res.current, maxVal);
    card.classList.toggle('low-hp', pct <= 25 && maxVal > 0);
    const bar = card.querySelector(`#res-bar-${resDef.id}`);
    if (bar) bar.style.backgroundColor = pct <= 25 ? 'var(--color-hp-low)' : resDef.color;
  }
}

function calcBarPct(current, max) {
  if (!max || max === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

function buildAbilityCard(statDef, char) {
  const card = document.createElement('div');
  card.className = 'ability-card';
  card.dataset.stat = statDef.id;

  const val = char.core_stats[statDef.id] ?? 0;

  card.innerHTML = `
    <span class="ability-abbr">${statDef.abbr}</span>
    <div class="ability-score-controls">
      <button class="resource-btn" data-stat-delta="-1">−</button>
      <input class="ability-score-input" type="number" min="0" max="6"
             value="${val}" data-stat="${statDef.id}" id="stat-input-${statDef.id}">
      <button class="resource-btn" data-stat-delta="1">＋</button>
    </div>
    <button class="ability-roll-btn" data-roll-stat="${statDef.id}">🎲 Test</button>
  `;

  const input = card.querySelector('.ability-score-input');

  function setVal(newVal) {
    newVal = Math.max(0, Math.min(6, newVal));
    getChar().core_stats[statDef.id] = newVal;
    recalcDerivedStats();
    scheduleSave();
  }

  input.addEventListener('change', e => {
    setVal(parseInt(e.target.value) || 0);
  });

  card.querySelectorAll('[data-stat-delta]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setVal((getChar().core_stats[statDef.id] ?? 0) + parseInt(btn.dataset.statDelta));
    });
  });

  card.querySelector('.ability-roll-btn').addEventListener('click', e => {
    const curVal = getChar().core_stats[statDef.id] ?? 0;
    const label = `${statDef.label} Test`;
    const characterName = rollCharacterName(getChar());
    if (e.shiftKey) {
      openAdvantageModal({ label, baseDieCount: 2, modifier: curVal, characterName });
      return;
    }
    const formula = buildTestFormula(curVal);
    window.Roll20Bridge.sendToRoll20({ label, formula, characterName });
  });

  return card;
}

function buildSkillsHeaderRow() {
  const row = document.createElement('div');
  row.className = 'skill-row skills-header-row';
  row.innerHTML = `
    <button class="skill-roll-btn" style="visibility:hidden" tabindex="-1">🎲</button>
    <span class="skill-name">Skill</span>
    <span class="skill-col-label" style="width:44px">Bonus</span>
    <span class="skill-col-label" style="width:44px">Rank</span>
    <span class="skill-bonus skill-col-label">Total</span>
  `;
  return row;
}

function buildSkillRow(skillDef, char) {
  const row = document.createElement('div');
  row.className = 'skill-row';
  const skillData = char.skills[skillDef.id] || { bonus: 0, rank: 0 };
  const total = (skillData.bonus || 0) + (skillData.rank || 0);

  row.innerHTML = `
    <button class="skill-roll-btn" data-roll-skill="${skillDef.id}" title="Roll ${skillDef.label}">🎲</button>
    <span class="skill-name">${skillDef.label}</span>
    <input class="currency-input" style="width:44px" type="number" min="0" value="${skillData.bonus || 0}" data-skill-bonus="${skillDef.id}">
    <input class="currency-input" style="width:44px" type="number" min="0" max="12" value="${skillData.rank || 0}" data-skill-rank="${skillDef.id}">
    <span class="skill-bonus" id="skill-total-${skillDef.id}">${total}</span>
  `;

  row.querySelector('[data-skill-bonus]').addEventListener('change', e => {
    getChar().skills[skillDef.id].bonus = parseInt(e.target.value) || 0;
    refreshSkillTotal(skillDef.id);
    scheduleSave();
  });
  row.querySelector('[data-skill-rank]').addEventListener('change', e => {
    const v = Math.max(0, Math.min(12, parseInt(e.target.value) || 0));
    e.target.value = v;
    getChar().skills[skillDef.id].rank = v;
    refreshSkillTotal(skillDef.id);
    scheduleSave();
  });

  row.querySelector('[data-roll-skill]').addEventListener('click', e => {
    const s = getChar().skills[skillDef.id];
    const total2 = (s.bonus || 0) + (s.rank || 0);
    const characterName = rollCharacterName(getChar());
    if (e.shiftKey) {
      openAdvantageModal({ label: skillDef.label, baseDieCount: 2, modifier: total2, characterName });
      return;
    }
    const formula = buildTestFormula(total2);
    window.Roll20Bridge.sendToRoll20({ label: skillDef.label, formula, characterName });
  });

  return row;
}

function getSkillTotal(skillId, char) {
  const s = char.skills[skillId] || { bonus: 0, rank: 0 };
  return (s.bonus || 0) + (s.rank || 0);
}

function refreshSkillTotal(skillId) {
  const el = document.getElementById(`skill-total-${skillId}`);
  if (el) el.textContent = getSkillTotal(skillId, getChar());
}

// -----------------------------------------------
// RESTS (NNGRules: Resting)
// The recovery die is rolled locally — it mutates
// sheet state, and the Roll20 bridge rolls its own
// dice, so delegating it would desync the numbers.
// -----------------------------------------------
function shortRest() {
  const char = getChar();
  const hp = char.resources.hp;
  if ((hp.current || 0) < 1) { alert('You need at least 1 Hit Point to rest.'); return; }
  const die = Math.floor(Math.random() * 10) + 1;
  const mod = deriveRecoveryModifier(char);
  const healed = Math.min(deriveMaxHP(char), hp.current + die + mod) - hp.current;
  hp.current += healed;
  scheduleSave();
  renderTabAbilities(char);
  const injuryNote = (char.injuries || []).length ? ' Remove one Minor Injury.' : '';
  window.Roll20Bridge.showRollToast(`⏳ Short Rest: 1d10 (${die}) + ${mod} → +${healed} HP.${injuryNote}`, 'success');
}

function longRest() {
  const char = getChar();
  if ((char.resources.hp.current || 0) < 1) { alert('You need at least 1 Hit Point to rest.'); return; }
  if (!confirm('Long Rest (8 hours): restore all Hit Points and remove all Minor Injuries?')) return;
  char.resources.hp.current = deriveMaxHP(char);
  char.injuries = [];
  scheduleSave();
  renderTabAbilities(char);
  window.Roll20Bridge.showRollToast('🌙 Long Rest complete: full HP, Minor Injuries removed.', 'success');
}

function recalcDerivedStats() {
  renderTabAbilities(getChar());
  renderTabCombat(getChar()); // Speed/Initiative chips depend on stats and perk modifiers
}

// -----------------------------------------------
// TAB: COMBAT
// -----------------------------------------------
function renderTabCombat(char) {
  const panel = document.getElementById('tab-combat');
  panel.innerHTML = `
    <div class="section-header">Combat Stats</div>
    <div class="combat-stats-row" id="combat-stats-row"></div>

    <div class="section-header mt-md">Conditions</div>
    <div class="conditions-row" id="conditions-row"></div>

    <div class="section-header mt-md">Weapons</div>
    <div id="weapons-list"></div>
    <div class="flex gap-sm mt-md flex-wrap">
      <select class="field-input" id="add-weapon-select" style="flex:1">
        <option value="">+ Add Weapon…</option>
        ${(WEAPON_CONFIG.weapons || []).map(w => `<option value="${w.id}">${w._custom ? '🔧 ' : ''}${escHtml(w.label)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="add-weapon-btn">Add</button>
    </div>
  `;

  buildCombatStatsRow(char);
  buildConditionsRow(char);
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

function renderWeaponsList(char) {
  const wrap = document.getElementById('weapons-list');
  wrap.innerHTML = '';
  (char.weapons || []).forEach(weaponInst => {
    const resolved = resolveWeapon(weaponInst);
    if (!resolved) return; // orphaned weapon_id with no matching dictionary entry
    wrap.appendChild(buildWeaponCard(weaponInst, resolved));
  });
}

function buildWeaponCard(weaponInst, resolved) {
  // Ammo tracks the *resolved* magazine — attachments and admin edits can
  // add or remove a magazine after the weapon was added to the sheet.
  if (resolved.magazine_size != null && !weaponInst.ammo) {
    weaponInst.ammo = { current: resolved.magazine_size };
  } else if (resolved.magazine_size == null && weaponInst.ammo) {
    weaponInst.ammo = null;
  }
  const card = document.createElement('div');
  card.className = 'weapon-card';

  const ammoHtml = weaponInst.ammo
    ? `<span class="weapon-card-ammo">${weaponInst.ammo.current}/${resolved.magazine_size}</span>`
    : '';

  card.innerHTML = `
    <div class="weapon-card-header">
      <div class="weapon-card-title">
        <span class="weapon-card-label">${escHtml(resolved.label)}</span>
        <span class="weapon-card-tags">${escHtml((resolved.tags || []).join(', '))}${(resolved.tags || []).includes('heavy') && (getChar().core_stats?.strength ?? 0) < 3 ? ' ⚠ Heavy' : ''}</span>
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
    const actionRow = buildActionRow(weaponInst, resolved, action);
    if (actionRow) actionsWrap.appendChild(actionRow);
  });
  card.appendChild(actionsWrap);

  card.appendChild(buildAttachmentsSection(weaponInst, resolved));

  return card;
}

function buildAttachmentsSection(weaponInst, resolved) {
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
        ${available.map(a => `<option value="${a.id}">${a._custom ? '🔧 ' : ''}${escHtml(a.label)}</option>`).join('')}
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

function buildActionRow(weaponInst, resolved, action) {
  const row = document.createElement('div');
  row.className = 'weapon-action-row';

  if (action.is_reload) {
    if (resolved.magazine_size == null) return null; // no magazine → no reload row
    row.innerHTML = `
      <span class="weapon-action-label">${escHtml(action.label)}</span>
      <button class="btn btn-secondary weapon-reload-btn">Reload</button>
    `;
    row.querySelector('.weapon-reload-btn').addEventListener('click', () => {
      weaponInst.ammo.current = resolved.magazine_size;
      markActionUsed('actions'); // reloading is an Action
      scheduleSave();
      refreshWeaponViews(); // ammo shows on both Combat and Actions tabs
    });
    return row;
  }

  const abilityAtRender = weaponAttackAbility(getChar(), resolved);
  const notesParts = [`+${abilityAtRender.value} ${abilityAtRender.stat}`];
  if (action.area_of_effect != null) notesParts.push(`AoE ${action.area_of_effect}`);
  if (action.save_dv != null) notesParts.push(`DV ${action.save_dv} negates`);
  const notesText = notesParts.length ? ` (${notesParts.join(', ')})` : '';

  // Heavy keyword: Disadvantage on attack rolls if STR < 3 (NNGRules)
  const isHeavy = (resolved.tags || []).includes('heavy');
  const heavyPenaltyActive = isHeavy && (getChar().core_stats?.strength ?? 0) < 3;

  const hasAmmo = weaponInst.ammo != null;
  const insufficientAmmo = hasAmmo && action.ammo_cost && weaponInst.ammo.current < action.ammo_cost;
  const isReaction = !!action.is_reaction;
  const costLabel = isReaction ? 'Reaction' : action.action_cost === 2 ? '2 Actions' : '1 Action';
  const isUtility = action.damage == null; // no attack/damage rolls — just mark action used

  const dmgType = action.damage_type || (action.damage != null ? 'standard' : null);
  const dmgTypeMeta = {
    standard: { label: 'Standard', title: 'Absorbed by armor first; overflow to HP' },
    piercing: { label: 'Piercing', title: '½ damage directly to HP, ½ to armor' },
    blunt:    { label: 'Blunt',    title: '2× effective vs. armor — no HP overflow' },
    energy:   { label: 'Energy',   title: 'Bypasses armor entirely — straight to HP' },
    shred:    { label: 'Shred',    title: 'Armor consumed at 2× rate per HP blocked' }
  };
  const dmgBadge = dmgType && dmgTypeMeta[dmgType]
    ? `<span class="dmg-type-badge dmg-type-${dmgType}" title="${dmgTypeMeta[dmgType].title}">${dmgTypeMeta[dmgType].label}</span>`
    : '';

  row.innerHTML = `
    <span class="weapon-action-label">${escHtml(action.label)}</span>
    <span class="weapon-action-cost-badge">${escHtml(costLabel)}</span>
    <span class="weapon-action-meta">Rng ${escHtml(String(action.range ?? '—'))}${escHtml(notesText)}${heavyPenaltyActive ? ' ⚠ Heavy (Disadvantage — STR < 3)' : ''}</span>
    ${isUtility
      ? `<button class="btn btn-secondary weapon-use-btn"${insufficientAmmo ? ' disabled' : ''}>Use</button>`
      : `${dmgBadge}<button class="attack-roll-btn"${insufficientAmmo ? ' disabled' : ''}>🎲 Attack</button>
         <button class="damage-roll-btn">⚔ ${escHtml(action.damage)}</button>`}
    ${action.notes ? `<span class="weapon-action-notes">${escHtml(action.notes)}</span>` : ''}
  `;

  const spendAmmo = () => {
    if (hasAmmo && action.ammo_cost) {
      weaponInst.ammo.current = Math.max(0, weaponInst.ammo.current - action.ammo_cost);
      scheduleSave();
      refreshWeaponViews();
    }
  };

  if (isUtility) {
    row.querySelector('.weapon-use-btn').addEventListener('click', () => {
      if (insufficientAmmo) return;
      markActionUsed(isReaction ? 'reaction' : 'actions');
      window.Roll20Bridge.sendAnnouncement(`${rollCharacterName(getChar())} uses ${resolved.label} — ${action.label}`);
      spendAmmo();
    });
    return row;
  }

  row.querySelector('.attack-roll-btn').addEventListener('click', e => {
    if (insufficientAmmo) return;

    // Recompute at click time — stats can change after the row rendered.
    const ability = weaponAttackAbility(getChar(), resolved);
    const modifier = ability.value + (weaponInst.bonus ?? 0) + (action.hit_bonus || 0);
    const label = `${resolved.label} — ${action.label}`;
    markActionUsed(isReaction ? 'reaction' : 'actions');
    const characterName = rollCharacterName(getChar());
    const isBurstFire = !!action.burst_fire;
    const burstDisadvantageApplies = isBurstFire && (resolved.tags || []).includes('heavy') && !resolved.burst_disadvantage_removed;
    const attackCount = isBurstFire ? (action.attack_count || 1) : 1;
    // Heavy: Disadvantage if STR < 3 (checked at click time in case stats changed)
    const heavyDis = (resolved.tags || []).includes('heavy') && (getChar().core_stats?.strength ?? 0) < 3 ? 1 : 0;
    const totalPresetDis = (burstDisadvantageApplies ? 1 : 0) + heavyDis;

    if (e.shiftKey) {
      openAdvantageModal({
        label, baseDieCount: 2, modifier, characterName,
        attackCount, presetDisadvantage: totalPresetDis
      });
    } else if (isBurstFire || totalPresetDis > 0) {
      const formula = totalPresetDis > 0
        ? buildAdvantageFormula(2, modifier, 0, totalPresetDis)
        : buildTestFormula(modifier);
      for (let i = 1; i <= attackCount; i++) {
        const lbl = attackCount > 1 ? `${label} (${i}/${attackCount})` : label;
        window.Roll20Bridge.sendToRoll20({ label: lbl, formula, characterName });
      }
    } else {
      const formula = buildTestFormula(modifier);
      window.Roll20Bridge.sendToRoll20({ label, formula, characterName });
    }

    spendAmmo();
  });

  row.querySelector('.damage-roll-btn').addEventListener('click', () => {
    // NNGRules: melee damage adds the same ability used for the attack;
    // ranged damage stays bare dice.
    const ability = weaponAttackAbility(getChar(), resolved);
    const formula = (ability.melee && ability.value > 0)
      ? `${action.damage} + ${ability.value}`
      : action.damage;
    window.Roll20Bridge.sendToRoll20({
      label: `${resolved.label} — ${action.label} Damage`,
      formula,
      characterName: rollCharacterName(getChar())
    });
  });

  return row;
}

// Toggleable condition chips (list from CONFIG.conditions — names only for
// now; the rules doc hasn't published the definitions section yet).
function buildConditionsRow(char) {
  const wrap = document.getElementById('conditions-row');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!char.conditions) char.conditions = [];
  (CONFIG.conditions || []).forEach(name => {
    const chip = document.createElement('button');
    chip.className = 'condition-chip' + (char.conditions.includes(name) ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      const c = getChar();
      if (!c.conditions) c.conditions = [];
      c.conditions = c.conditions.includes(name)
        ? c.conditions.filter(x => x !== name)
        : [...c.conditions, name];
      scheduleSave();
      buildConditionsRow(c);
    });
    wrap.appendChild(chip);
  });
}

function buildCombatAbilityBar(char) {
  const wrap = document.getElementById('combat-ability-bar');
  wrap.innerHTML = '';
  CONFIG.core_stats.forEach(s => {
    const val = char.core_stats?.[s.id] ?? 0;
    const chip = document.createElement('div');
    chip.className = 'combat-ability-chip';
    chip.innerHTML = `
      <span class="combat-ability-abbr">${s.abbr}</span>
      <span class="combat-ability-val">${val}</span>
      <button class="ability-roll-btn combat-ability-roll" title="2d10 + ${s.abbr} Test">🎲</button>`;
    chip.querySelector('.combat-ability-roll').addEventListener('click', e => {
      const cur = getChar().core_stats[s.id] ?? 0;
      const label = `${s.abbr} Test`;
      const characterName = rollCharacterName(getChar());
      if (e.shiftKey) {
        openAdvantageModal({ label, baseDieCount: 2, modifier: cur, characterName });
        return;
      }
      window.Roll20Bridge.sendToRoll20({ label, formula: buildTestFormula(cur), characterName });
    });
    wrap.appendChild(chip);
  });
}

function buildCombatDefenseRow(char) {
  const wrap = document.getElementById('combat-defense-row');
  wrap.innerHTML = '';
  [
    { label: 'Evade', stat: 'agility',   title: '2d10 + AGI' },
    { label: 'Block', stat: 'fortitude', title: '2d10 + FOR — requires a shield' },
    { label: 'Parry', stat: 'willpower', title: '2d10 + WIL — requires a melee weapon, vs melee only' }
  ].forEach(def => {
    const val = char.core_stats?.[def.stat] ?? 0;
    const btn = document.createElement('button');
    btn.className = 'combat-defense-btn';
    btn.title = def.title;
    btn.innerHTML = `<span class="combat-defense-label">${def.label}</span><span class="combat-defense-mod">2d10+${val}</span><span class="combat-defense-icon">🎲</span>`;
    btn.addEventListener('click', e => {
      const mod = getChar().core_stats[def.stat] ?? 0;
      const characterName = rollCharacterName(getChar());
      if (e.shiftKey) {
        openAdvantageModal({ label: def.label, baseDieCount: 2, modifier: mod, characterName });
        return;
      }
      window.Roll20Bridge.sendToRoll20({ label: def.label, formula: buildTestFormula(mod), characterName });
    });
    wrap.appendChild(btn);
  });
}

function buildCombatStatsRow(char) {
  const wrap = document.getElementById('combat-stats-row');
  wrap.innerHTML = '';

  [
    { label: 'Head Armor', value: char.armor.head, field: 'head' },
    { label: 'Body Armor', value: char.armor.body, field: 'body' },
    { label: 'Speed',      value: char.speed,       field: 'speed' }
  ].forEach(chip => {
    const el = document.createElement('div');
    el.className = 'combat-stat-chip';
    const effSpeed = chip.field === 'speed' ? applyPerkModifiers(char, 'speed', char.speed) : null;
    const suffix = (effSpeed != null && effSpeed !== char.speed)
      ? `<span title="Base ${char.speed} + perk modifiers">→ ${effSpeed}</span>` : '';
    el.innerHTML = `
      <span class="combat-stat-chip-label">${chip.label}</span>
      <span class="combat-stat-chip-value combat-stat-chip-value-row">
        <input type="number" value="${chip.value}" data-combat-field="${chip.field}" style="width:48px">${suffix}
      </span>`;
    el.querySelector('input').addEventListener('change', e => {
      const v = parseInt(e.target.value) || 0;
      if (chip.field === 'speed') getChar().speed = v;
      else getChar().armor[chip.field] = v;
      scheduleSave();
    });
    wrap.appendChild(el);
  });
}

// -----------------------------------------------
// TAB: PSYCASTS
// -----------------------------------------------
// -----------------------------------------------
// TAB: ACTIONS — the "it's my turn" pane.
// Weapon attacks (rollable, same handlers as the
// Combat tab), perk-granted actions, and the
// rulebook's common actions (CONFIG.common_actions).
// Management (add/remove weapons, attachments)
// stays on the Combat tab.
// -----------------------------------------------
function refreshWeaponViews() {
  const char = getChar();
  renderWeaponsList(char);
  if (document.getElementById('tab-actions').classList.contains('active')) {
    renderTabActions(char);
    applyViewOnlyMode();
  }
}

// Per-turn action economy (2 Actions, 1 Quick, 1 Reaction). In-memory only —
// turn pips reset on reload and aren't worth cloud-save churn mid-combat.
let TURN_TRACKER = {};
const TURN_PIP_MAX = { actions: 2, quick: 1, reaction: 1 };
// Mirrors encounter.js TURN_PIP_GROUPS — update both if action economy changes.
const TURN_PIP_GROUPS = [
  { key: 'actions',  label: 'ACT', max: 2 },
  { key: 'quick',    label: 'QK',  max: 1 },
  { key: 'reaction', label: 'RX',  max: 1 }
];
function getTurnTracker(charId) {
  if (!TURN_TRACKER[charId]) TURN_TRACKER[charId] = { actions: 0, quick: 0, reaction: 0 };
  return TURN_TRACKER[charId];
}

/** Action buttons call this so using an ability marks its pip automatically
 *  (capped at the pip count — over-spending is the table's business). */
function markActionUsed(kind) {
  if (!kind || !ACTIVE_ID) return;
  const tracker = getTurnTracker(ACTIVE_ID);
  tracker[kind] = Math.min(TURN_PIP_MAX[kind], (tracker[kind] || 0) + 1);
  const panel = document.getElementById('tab-actions');
  if (panel && panel.classList.contains('active')) {
    renderTabActions(getChar());
    applyViewOnlyMode();
  }
}

function renderTabActions(char) {
  const panel = document.getElementById('tab-actions');
  panel.innerHTML = '';

  const addHeader = (text, extra = '') => {
    const h = document.createElement('div');
    h.className = `section-header ${extra}`.trim();
    h.textContent = text;
    panel.appendChild(h);
  };

  // --- Top bar ---
  const topBar = document.createElement('div');
  topBar.className = 'actions-top-bar';

  // Row 1: HP + armor tracking
  const resourcesRow = document.createElement('div');
  resourcesRow.className = 'actions-resources-row';

  const hpCurrent = char.resources?.hp?.current ?? 0;
  const hpMax     = deriveMaxHP(char);
  const hpPct     = hpMax > 0 ? Math.round((hpCurrent / hpMax) * 100) : 0;
  const hpDiv = document.createElement('div');
  hpDiv.className = 'actions-hp-block';
  hpDiv.innerHTML = `
    <span class="actions-res-label">HP</span>
    <button class="resource-btn actions-hp-btn" data-delta="-1">−</button>
    <input type="number" class="currency-input actions-hp-input" value="${hpCurrent}" style="width:50px" id="actions-hp-input">
    <span class="actions-res-sep">/ ${hpMax}</span>
    <button class="resource-btn actions-hp-btn" data-delta="1">＋</button>
    <div class="actions-hp-bar-wrap"><div class="actions-hp-bar" style="width:${hpPct}%"></div></div>
  `;
  const hpInput = hpDiv.querySelector('#actions-hp-input');
  const hpBar   = hpDiv.querySelector('.actions-hp-bar');
  const updateHP = val => {
    const max = deriveMaxHP(getChar());
    val = Math.max(0, Math.min(max, val));
    getChar().resources.hp.current = val;
    hpInput.value = val;
    hpBar.style.width = max > 0 ? `${Math.round(val / max * 100)}%` : '0%';
    hpBar.style.background = val / max < 0.3 ? '#c0392b' : val / max < 0.6 ? '#e67e22' : '#27ae60';
    scheduleSave();
  };
  hpInput.addEventListener('change', e => updateHP(parseInt(e.target.value) || 0));
  hpDiv.querySelectorAll('[data-delta]').forEach(btn =>
    btn.addEventListener('click', () => updateHP((getChar().resources.hp.current ?? 0) + parseInt(btn.dataset.delta)))
  );
  // Set initial bar color
  hpBar.style.background = hpPct < 30 ? '#c0392b' : hpPct < 60 ? '#e67e22' : '#27ae60';
  resourcesRow.appendChild(hpDiv);

  [
    { label: 'HEAD', field: 'head', value: char.armor?.head ?? 0 },
    { label: 'BODY', field: 'body', value: char.armor?.body ?? 0 }
  ].forEach(a => {
    const div = document.createElement('div');
    div.className = 'actions-armor-block';
    div.innerHTML = `
      <span class="actions-res-label">${a.label}</span>
      <input type="number" class="currency-input" value="${a.value}" style="width:50px">
    `;
    div.querySelector('input').addEventListener('change', e => {
      getChar().armor[a.field] = parseInt(e.target.value) || 0;
      scheduleSave();
    });
    resourcesRow.appendChild(div);
  });

  topBar.appendChild(resourcesRow);

  // Row 2: Initiative (left) + compact turn tracker (right)
  const economyRow = document.createElement('div');
  economyRow.className = 'actions-economy-row';

  const initSide = document.createElement('div');
  initSide.className = 'actions-initiative';
  initSide.innerHTML = `
    <span class="combat-stat-chip-label">Initiative</span>
    <span style="font-size:0.75rem;color:var(--text-muted)">bonus</span>
    <input type="number" class="currency-input" value="${char.initiative_bonus ?? 0}" style="width:40px" id="actions-init-input">
    <button class="ability-roll-btn" id="actions-init-btn" title="Roll 2d10 + AGI + bonus">🎲 Roll</button>
  `;
  initSide.querySelector('#actions-init-input').addEventListener('change', e => {
    getChar().initiative_bonus = parseInt(e.target.value) || 0;
    scheduleSave();
  });
  initSide.querySelector('#actions-init-btn').addEventListener('click', e => {
    const agi = getChar().core_stats.agility ?? 0;
    const bonus = getChar().initiative_bonus ?? 0;
    const mod = applyPerkModifiers(getChar(), 'initiative', agi + bonus);
    const characterName = rollCharacterName(getChar());
    if (e.shiftKey) {
      openAdvantageModal({ label: 'Initiative', baseDieCount: 2, modifier: mod, characterName });
      return;
    }
    const formula = mod > 0 ? `2d10 + ${mod}` : mod < 0 ? `2d10 - ${Math.abs(mod)}` : '2d10';
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula, characterName });
  });

  const tracker = getTurnTracker(char.id);
  const trackerSide = document.createElement('div');
  trackerSide.className = 'actions-turn-tracker';
  TURN_PIP_GROUPS.forEach(g => {
    const group = document.createElement('span');
    group.className = 'turn-tracker-group';
    group.innerHTML = `<span class="turn-tracker-label">${g.label}</span>`;
    for (let i = 0; i < g.max; i++) {
      const pip = document.createElement('button');
      pip.className = 'turn-pip' + (tracker[g.key] > i ? ' used' : '');
      pip.title = `${g.label} — click to toggle`;
      pip.addEventListener('click', () => {
        tracker[g.key] = tracker[g.key] > i ? i : i + 1;
        renderTabActions(getChar());
        applyViewOnlyMode();
      });
      group.appendChild(pip);
    }
    trackerSide.appendChild(group);
  });
  const newTurnBtn = document.createElement('button');
  newTurnBtn.className = 'btn btn-secondary';
  newTurnBtn.style.padding = '2px 8px';
  newTurnBtn.textContent = '↻ New Turn';
  newTurnBtn.title = 'Reset all pips (you may trade 1 Action for 2 Quick Actions)';
  newTurnBtn.addEventListener('click', () => {
    TURN_TRACKER[char.id] = { actions: 0, quick: 0, reaction: 0 };
    renderTabActions(getChar());
    applyViewOnlyMode();
  });
  trackerSide.appendChild(newTurnBtn);
  if ((char.conditions || []).length > 0) {
    const cond = document.createElement('span');
    cond.className = 'turn-tracker-conditions';
    cond.title = 'Active conditions — toggle them on the Combat tab';
    cond.textContent = `⚠ ${char.conditions.join(', ')}`;
    trackerSide.appendChild(cond);
  }

  economyRow.appendChild(initSide);
  economyRow.appendChild(trackerSide);
  topBar.appendChild(economyRow);
  panel.appendChild(topBar);

  // --- Ability rolls + defense rolls ---
  const abilityBarEl = document.createElement('div');
  abilityBarEl.className = 'combat-ability-bar';
  abilityBarEl.id = 'combat-ability-bar';
  panel.appendChild(abilityBarEl);
  buildCombatAbilityBar(char);

  const defHeaderEl = document.createElement('div');
  defHeaderEl.className = 'section-header mt-sm';
  defHeaderEl.textContent = 'Defense Rolls';
  panel.appendChild(defHeaderEl);

  const defRowEl = document.createElement('div');
  defRowEl.className = 'combat-defense-row';
  defRowEl.id = 'combat-defense-row';
  panel.appendChild(defRowEl);
  buildCombatDefenseRow(char);

  // --- Weapon attacks ---
  addHeader('Weapon Attacks');
  const weapons = (char.weapons || [])
    .map(inst => ({ inst, resolved: resolveWeapon(inst) }))
    .filter(w => w.resolved);
  if (weapons.length === 0) {
    panel.insertAdjacentHTML('beforeend',
      '<p class="campaign-note">No weapons equipped — add them on the Combat tab.</p>');
  }
  weapons.forEach(({ inst, resolved }) => {
    const block = document.createElement('div');
    block.className = 'weapon-card';
    const ammoHtml = inst.ammo
      ? `<span class="weapon-card-ammo">${inst.ammo.current}/${resolved.magazine_size}</span>` : '';
    block.innerHTML = `
      <div class="weapon-card-header">
        <div class="weapon-card-title"><span class="weapon-card-label">${escHtml(resolved.label)}</span></div>
        <div class="weapon-card-header-controls">${ammoHtml}</div>
      </div>`;
    const rows = document.createElement('div');
    rows.className = 'weapon-action-rows';
    resolved.actions.forEach(action => {
      const rowEl = buildActionRow(inst, resolved, action);
      if (rowEl) rows.appendChild(rowEl);
    });
    block.appendChild(rows);
    panel.appendChild(block);
  });

  // --- Perk actions, then common rulebook actions, grouped by type ---
  const pipKindFor = type => type === 'Quick Action' ? 'quick' : type === 'Reaction' ? 'reaction' : 'actions';
  const perkGroups = { 'Action': [], 'Quick Action': [], 'Reaction': [] };
  (char.perks || []).forEach(perk => {
    const a = perk.action;
    if (a && a.type && perkGroups[a.type]) {
      perkGroups[a.type].push({ label: a.label, text: a.text, source: perk.name, pipKind: pipKindFor(a.type) });
    }
  });
  const commonGroups = { 'Action': [], 'Quick Action': [], 'Reaction': [], 'Grapple': [] };
  (CONFIG.common_actions || []).forEach(a => {
    if (commonGroups[a.type]) commonGroups[a.type].push({ label: a.label, text: a.text, rolls: a.rolls, common: true, pipKind: pipKindFor(a.type) });
  });

  // Roll modifier for an action's 'test' roll. 'best_str_agi' = the rules
  // let the roller pick STR or AGI, and the higher score is always the
  // right pick — the button tooltip names which one applied.
  const testStat = statId => {
    const cs = getChar().core_stats || {};
    if (statId === 'best_str_agi') return Math.max(cs.strength ?? 0, cs.agility ?? 0);
    return cs[statId] ?? 0;
  };

  const buildCard = a => {
    const card = document.createElement('div');
    card.className = 'action-card' + (a.common ? ' action-card-common' : '');
    card.innerHTML = `
      <div class="action-card-title">${escHtml(a.label)}${a.source ? ` <span class="action-card-source">· ${escHtml(a.source)}</span>` : ''}</div>
      <div class="action-card-text">${escHtml(a.text || '')}</div>`;

    const btnRow = document.createElement('div');
    btnRow.className = 'action-card-buttons';
    const rolls = a.rolls || [];
    if (rolls.length === 0) {
      // No dice involved — the button just announces the action in Roll20.
      const btn = document.createElement('button');
      btn.className = 'ability-roll-btn';
      btn.textContent = '📣 Announce';
      btn.addEventListener('click', () => {
        markActionUsed(a.pipKind);
        window.Roll20Bridge.sendAnnouncement({
          label: `uses ${a.label}`,
          characterName: rollCharacterName(getChar())
        });
      });
      btnRow.appendChild(btn);
    } else {
      rolls.forEach((r, rollIdx) => {
        const btn = document.createElement('button');
        btn.className = 'ability-roll-btn';
        btn.textContent = `🎲 ${r.label}`;
        if (r.kind === 'test' && r.stat === 'best_str_agi') btn.title = 'Rolls 2d10 + your higher of STR / AGI';
        btn.addEventListener('click', e => {
          // Only the card's primary roll consumes a pip — follow-up rolls
          // (damage, secondary attacks) are part of the same action.
          if (rollIdx === 0) markActionUsed(a.pipKind);
          const label = `${a.label} — ${r.label}`;
          const characterName = rollCharacterName(getChar());
          if (r.kind === 'dice') {
            window.Roll20Bridge.sendToRoll20({ label, formula: r.formula, characterName });
            return;
          }
          const mod = testStat(r.stat);
          if (e.shiftKey) {
            openAdvantageModal({ label, baseDieCount: 2, modifier: mod, characterName });
            return;
          }
          window.Roll20Bridge.sendToRoll20({ label, formula: buildTestFormula(mod), characterName });
        });
        btnRow.appendChild(btn);
      });
    }
    card.appendChild(btnRow);
    return card;
  };

  // Perk-granted actions first, in their own sections (full-width rows) —
  // these are the character's special abilities. The rulebook's basic
  // actions follow in 3-column grids.
  [['Action', 'Perk Actions'], ['Quick Action', 'Perk Quick Actions'], ['Reaction', 'Perk Reactions']].forEach(([type, title]) => {
    const entries = perkGroups[type];
    if (entries.length === 0) return;
    addHeader(title, 'mt-md');
    const list = document.createElement('div');
    list.className = 'action-card-list';
    entries.forEach(a => list.appendChild(buildCard(a)));
    panel.appendChild(list);
  });

  [['Action', 'Actions'], ['Quick Action', 'Quick Actions'], ['Reaction', 'Reactions'], ['Grapple', 'Grappling']].forEach(([type, title]) => {
    const entries = commonGroups[type];
    if (entries.length === 0) return;
    addHeader(title, 'mt-md');
    const grid = document.createElement('div');
    grid.className = 'action-card-grid';
    entries.forEach(a => grid.appendChild(buildCard(a)));
    panel.appendChild(grid);
  });
}

function renderTabPsycasts(char) {
  const panel = document.getElementById('tab-psycasts');
  panel.innerHTML = `<div class="section-header">Psycasts <span style="color:var(--text-muted);font-size:0.8rem">(${(char.psycasts || []).length}/14)</span></div>
    <div id="psycasts-list"></div>`;

  buildTextEntryList(document.getElementById('psycasts-list'), char.psycasts, {
    maxCount: 14,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Psycast',
    onChange: () => renderTabPsycasts(getChar())
  });
}

// -----------------------------------------------
// TAB: EQUIPMENT
// -----------------------------------------------
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

// -----------------------------------------------
// TAB: NOTES
// -----------------------------------------------
function renderTabNotes(char) {
  const panel = document.getElementById('tab-notes');
  panel.innerHTML = `
    <div class="section-header">Notes</div>
    <textarea class="notes-area" id="notes-area" placeholder="Session notes, lore, reminders…">${escHtml(char.notes || '')}</textarea>
  `;
  document.getElementById('notes-area').addEventListener('input', e => {
    getChar().notes = e.target.value;
    scheduleSave();
  });
}

// -----------------------------------------------
// ADVANTAGE / DISADVANTAGE MODAL
// Shift-click any roll button to open this instead of
// sending immediately. Lets the player add Advantage and/or
// Disadvantage dice before the roll is sent. A plain click
// still sends immediately with no modal, per the normal flow.
// -----------------------------------------------
let PENDING_ADV_ROLL = null;
let ADV_COUNT = 0;
let DIS_COUNT = 0;

function openAdvantageModal(rollInfo) {
  PENDING_ADV_ROLL = rollInfo;
  ADV_COUNT = 0;
  DIS_COUNT = rollInfo.presetDisadvantage || 0;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'advantage-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">${escHtml(rollInfo.label)}</div>
      <div class="advantage-stepper-row">
        <span class="advantage-stepper-label">Advantage</span>
        <button class="resource-btn" id="adv-minus-btn">−</button>
        <span class="advantage-count" id="adv-count-display">0</span>
        <button class="resource-btn" id="adv-plus-btn">＋</button>
      </div>
      <div class="advantage-stepper-row">
        <span class="advantage-stepper-label">Disadvantage</span>
        <button class="resource-btn" id="dis-minus-btn">−</button>
        <span class="advantage-count" id="dis-count-display">0</span>
        <button class="resource-btn" id="dis-plus-btn">＋</button>
      </div>
      <div class="advantage-preview" id="advantage-preview"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="advantage-cancel-btn">Cancel</button>
        <button class="btn btn-primary" id="advantage-roll-btn">🎲 Roll</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeAdvantageModal(); });
  document.getElementById('advantage-cancel-btn').addEventListener('click', closeAdvantageModal);
  document.getElementById('advantage-roll-btn').addEventListener('click', confirmAdvantageRoll);
  document.getElementById('adv-minus-btn').addEventListener('click', () => adjustAdvantageCounts(-1, 0));
  document.getElementById('adv-plus-btn').addEventListener('click', () => adjustAdvantageCounts(1, 0));
  document.getElementById('dis-minus-btn').addEventListener('click', () => adjustAdvantageCounts(0, -1));
  document.getElementById('dis-plus-btn').addEventListener('click', () => adjustAdvantageCounts(0, 1));

  updateAdvantagePreview();
}

function closeAdvantageModal() {
  const backdrop = document.getElementById('advantage-backdrop');
  if (backdrop) backdrop.remove();
  PENDING_ADV_ROLL = null;
}

function adjustAdvantageCounts(deltaAdv, deltaDis) {
  ADV_COUNT = Math.max(0, Math.min(5, ADV_COUNT + deltaAdv));
  DIS_COUNT = Math.max(0, Math.min(5, DIS_COUNT + deltaDis));
  updateAdvantagePreview();
}

function updateAdvantagePreview() {
  document.getElementById('adv-count-display').textContent = ADV_COUNT;
  document.getElementById('dis-count-display').textContent = DIS_COUNT;
  document.getElementById('advantage-preview').textContent =
    buildAdvantageFormula(PENDING_ADV_ROLL.baseDieCount, PENDING_ADV_ROLL.modifier, ADV_COUNT, DIS_COUNT);
}

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

// -----------------------------------------------
// EXPORT / IMPORT
// -----------------------------------------------
function exportCharacter() {
  const char = getChar();
  const blob = new Blob([JSON.stringify(stripCloudMeta(char), null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${char.name.replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

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
    // Imports are always local: a stale/hand-edited _cloud tag would exclude
    // the character from localStorage saves (silent loss if the cloud write
    // is rejected). Move-to-campaign is the only way to tag a character.
    delete char._cloud;

    CHARACTERS[char.id] = char;
    saveAllCharacters();
    openCharacter(char.id);
  });
  input.click();
}

// -----------------------------------------------
// SHARED: simple name(+second field) entry list
// Used by Perks, Psycasts, Injuries, Critical Injuries, Equipment.
// secondFieldType determines the stored property name: 'number' -> weight,
// anything else -> description. This is a closed-world assumption matching
// the known call sites (all of them currently use text+description), not a
// free-form type hint.
// secondFieldLabel/addButtonLabel must be static developer-supplied strings,
// not character/user data, since they're interpolated into innerHTML unescaped.
// -----------------------------------------------
let _entryListCounter = 0;

function buildTextEntryList(container, items, opts) {
  const { maxCount, secondFieldLabel, secondFieldType, addButtonLabel, onChange } = opts;
  const uid = `entry-${_entryListCounter++}`;
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'equipment-list';
  (items || []).forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'equipment-item';
    row.innerHTML = `
      <span class="equipment-name">${escHtml(entry.name)}</span>
      <span style="flex:1;font-size:0.75rem;color:var(--text-muted)">${escHtml(String(entry[secondFieldType === 'number' ? 'weight' : 'description'] ?? ''))}</span>
      <button class="delete-item-btn" title="Remove">✕</button>
    `;
    row.addEventListener('mouseenter', () => row.querySelector('.delete-item-btn').style.opacity = '1');
    row.addEventListener('mouseleave', () => row.querySelector('.delete-item-btn').style.opacity = '0');
    row.querySelector('.delete-item-btn').addEventListener('click', () => {
      items.splice(i, 1);
      scheduleSave();
      onChange();
    });
    list.appendChild(row);
  });
  container.appendChild(list);

  if ((items || []).length >= maxCount) return; // at cap, no add form

  const form = document.createElement('div');
  form.className = 'flex gap-sm mt-md flex-wrap';
  form.innerHTML = `
    <input class="field-input" placeholder="Name" id="${uid}-name" style="flex:2">
    <input class="field-input" placeholder="${secondFieldLabel}" id="${uid}-second" type="${secondFieldType === 'number' ? 'number' : 'text'}" ${secondFieldType === 'number' ? 'min="0"' : ''} style="flex:2">
    <button class="btn btn-secondary" id="${uid}-add">${addButtonLabel}</button>
  `;
  container.appendChild(form);

  form.querySelector(`#${uid}-add`).addEventListener('click', () => {
    const name = form.querySelector(`#${uid}-name`).value.trim();
    if (!name) return;
    const secondVal = form.querySelector(`#${uid}-second`).value;
    const entry = { name };
    entry[secondFieldType === 'number' ? 'weight' : 'description'] = secondFieldType === 'number' ? Math.max(0, parseFloat(secondVal) || 0) : secondVal.trim();
    items.push(entry);
    scheduleSave();
    onChange();
  });
}

// -----------------------------------------------
// PERKS LIST (dedicated renderer — NOT buildTextEntryList)
// Renders both free-form {name, description} perks and
// dictionary-sourced {name, prerequisite, effect, action} perks.
// All mutation handlers re-fetch via getChar() rather than closing
// over the `char` param, to avoid the stale-character-reference bug
// class found in the weapon-attachment-config work.
// -----------------------------------------------
function buildPerksList(container, char) {
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'perks-item-list';
  (char.perks || []).forEach((perk, i) => {
    const row = document.createElement('div');
    row.className = 'perk-item';

    let detailHtml = '';
    if (perk.prerequisite || perk.effect || perk.action) {
      const parts = [];
      if (perk.prerequisite) parts.push(`<strong>Prerequisite.</strong> ${escHtml(perk.prerequisite)}`);
      if (perk.effect) parts.push(`<strong>Effect.</strong> ${escHtml(perk.effect)}`);
      if (perk.action) parts.push(`<strong>${escHtml(perk.action.type)}: ${escHtml(perk.action.label)}.</strong> ${escHtml(perk.action.text)}`);
      detailHtml = `<div class="perk-detail">${parts.join('<br>')}</div>`;
    } else if (perk.description) {
      detailHtml = `<div class="perk-detail">${escHtml(perk.description)}</div>`;
    }

    row.innerHTML = `
      <div class="perk-item-row">
        <span class="perk-item-name">${escHtml(perk.name)}</span>
        <button class="delete-item-btn" title="Remove">✕</button>
      </div>
      ${detailHtml}
    `;
    row.querySelector('.delete-item-btn').addEventListener('click', () => {
      getChar().perks.splice(i, 1);
      recalcDerivedStats(); // removing a perk can lower HP max/IT/Speed
      scheduleSave();
      renderTabInfo(getChar());
    });
    list.appendChild(row);
  });
  container.appendChild(list);

  if ((char.perks || []).length >= 10) return; // at cap, no add forms

  // Free-form add row (same behavior as the old buildTextEntryList call)
  const freeForm = document.createElement('div');
  freeForm.className = 'flex gap-sm mt-md flex-wrap';
  freeForm.innerHTML = `
    <input class="field-input" placeholder="Name" id="perk-ff-name" style="flex:2">
    <input class="field-input" placeholder="Description" id="perk-ff-desc" style="flex:2">
    <button class="btn btn-secondary" id="perk-ff-add">+ Add Perk</button>
  `;
  container.appendChild(freeForm);

  document.getElementById('perk-ff-add').addEventListener('click', () => {
    const name = document.getElementById('perk-ff-name').value.trim();
    if (!name) return;
    const description = document.getElementById('perk-ff-desc').value.trim();
    getChar().perks.push({ name, description });
    scheduleSave();
    renderTabInfo(getChar());
  });

  // Dictionary add row
  const eligiblePerks = (PERKS_CONFIG || []).filter(p => char.show_all_perks || p.level <= (char.level || 1));
  const dictWrap = document.createElement('div');
  dictWrap.className = 'flex gap-sm mt-sm flex-wrap';
  dictWrap.innerHTML = `
    <label class="flex gap-xs" style="align-items:center;font-size:0.8rem;color:var(--text-muted)">
      <input type="checkbox" id="perk-show-all" ${char.show_all_perks ? 'checked' : ''}>
      Show perks above my level
    </label>
    <select class="field-input" id="perk-dict-select" style="flex:1">
      <option value="">+ Add from Dictionary…</option>
      ${eligiblePerks.map(p => `<option value="${p.id}">Lv ${p.level} — ${p._custom ? '🔧 ' : ''}${escHtml(p.name)}</option>`).join('')}
    </select>
    <button class="btn btn-primary" id="perk-dict-add">Add</button>
  `;
  container.appendChild(dictWrap);

  document.getElementById('perk-show-all').addEventListener('change', (e) => {
    getChar().show_all_perks = e.target.checked;
    scheduleSave();
    renderTabInfo(getChar());
  });

  document.getElementById('perk-dict-add').addEventListener('click', () => {
    const select = document.getElementById('perk-dict-select');
    const perkId = select.value;
    if (!perkId) return;
    const def = (PERKS_CONFIG || []).find(p => p.id === perkId);
    if (!def) return;
    getChar().perks.push({
      id: def.id,
      name: def.name,
      description: '',
      prerequisite: def.prerequisite,
      effect: def.effect,
      action: def.action,
      modifiers: def.modifiers
    });
    recalcDerivedStats(); // perk modifiers can change HP/IT/etc. immediately
    scheduleSave();
    renderTabInfo(getChar());
  });
}

// Expose for HTML onclick attributes
window.showRoster     = showRoster;
window.exportCharacter = exportCharacter;
window.importCharacter = importCharacter;
