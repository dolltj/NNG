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
    <div class="roster-grid" id="roster-grid"></div>
  `;
  const grid = document.getElementById('roster-grid');

  // Existing characters
  Object.values(CHARACTERS).forEach(char => {
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
}

function showRoster() {
  ACTIVE_ID = null;
  localStorage.removeItem(STORAGE_ACTIVE_KEY);
  document.getElementById('roster-screen').style.display = 'flex';
  document.getElementById('app-screen').classList.remove('active');
  renderRoster();
}

// -----------------------------------------------
// OPEN A CHARACTER
// -----------------------------------------------
function openCharacter(id) {
  ACTIVE_ID = id;
  localStorage.setItem(STORAGE_ACTIVE_KEY, id);
  document.getElementById('roster-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('active');
  renderSheet();
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
  renderTabPsycasts(char);
  renderTabEquipment(char);
  renderTabNotes(char);
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

  // --- Derived stats (read-only) ---
  addSectionHeader('Recovery', 'mt-md');
  const derivedRow = document.createElement('div');
  derivedRow.className = 'combat-stats-row';
  derivedRow.innerHTML = `
    <div class="combat-stat-chip">
      <span class="combat-stat-chip-label">Injury Threshold</span>
      <span class="combat-stat-chip-value">${deriveInjuryThreshold(char)}</span>
    </div>
    <div class="combat-stat-chip">
      <span class="combat-stat-chip-label">Recovery Rate</span>
      <span class="combat-stat-chip-value">${deriveRecoveryRate(char)}</span>
    </div>
  `;
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

  // --- Critical Injuries ---
  addSectionHeader('Critical Injuries', 'mt-md');
  const critInjuriesWrap = document.createElement('div');
  critInjuriesWrap.id = 'critical-injuries-list';
  panel.appendChild(critInjuriesWrap);
  buildTextEntryList(critInjuriesWrap, char.critical_injuries, {
    maxCount: Infinity,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Critical Injury',
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

function recalcDerivedStats() {
  renderTabAbilities(getChar());
}

// -----------------------------------------------
// TAB: COMBAT
// -----------------------------------------------
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
        ${(WEAPON_CONFIG.weapons || []).map(w => `<option value="${w.id}">${w._custom ? '🔧 ' : ''}${escHtml(w.label)}</option>`).join('')}
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
    const characterName = rollCharacterName(getChar());
    const isBurstFire = !!action.burst_fire;
    const burstDisadvantageApplies = isBurstFire && !resolved.burst_disadvantage_removed;
    const attackCount = isBurstFire ? (action.attack_count || 1) : 1;

    if (e.shiftKey) {
      openAdvantageModal({
        label, baseDieCount: 2, modifier, characterName,
        attackCount, presetDisadvantage: burstDisadvantageApplies ? 1 : 0
      });
    } else if (isBurstFire) {
      const formula = burstDisadvantageApplies
        ? buildAdvantageFormula(2, modifier, 0, 1)
        : buildTestFormula(modifier);
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

function buildCombatStatsRow(char) {
  const wrap = document.getElementById('combat-stats-row');
  wrap.innerHTML = '';

  const chips = [
    { label: 'Head Armor', value: char.armor.head, field: 'head' },
    { label: 'Body Armor', value: char.armor.body, field: 'body' },
    { label: 'Speed',      value: char.speed,       field: 'speed' }
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
      else getChar().armor[chip.field] = v;
      scheduleSave();
    });
    wrap.appendChild(el);
  });

  const initEl = document.createElement('div');
  initEl.className = 'combat-stat-chip';
  initEl.innerHTML = `
    <span class="combat-stat-chip-label">Initiative</span>
    <span class="combat-stat-chip-value combat-stat-chip-value-row">
      <input type="number" value="${char.initiative_bonus}" data-combat-field="initiative_bonus" style="width:40px">
      <button class="ability-roll-btn" id="roll-initiative-btn" title="Roll 1d10 + AGI + Bonus">🎲</button>
    </span>`;
  initEl.querySelector('input').addEventListener('change', e => {
    getChar().initiative_bonus = parseInt(e.target.value) || 0;
    scheduleSave();
  });
  initEl.querySelector('#roll-initiative-btn').addEventListener('click', e => {
    const agi = getChar().core_stats.agility ?? 0;
    const bonus = getChar().initiative_bonus ?? 0;
    const mod = agi + bonus;
    const characterName = rollCharacterName(getChar());
    if (e.shiftKey) {
      openAdvantageModal({ label: 'Initiative', baseDieCount: 1, modifier: mod, characterName });
      return;
    }
    const formula = mod >= 0 ? `1d10 + ${mod}` : `1d10 - ${Math.abs(mod)}`;
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula, characterName });
  });
  wrap.appendChild(initEl);
}

// -----------------------------------------------
// TAB: PSYCASTS
// -----------------------------------------------
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
      name: def.name,
      description: '',
      prerequisite: def.prerequisite,
      effect: def.effect,
      action: def.action
    });
    scheduleSave();
    renderTabInfo(getChar());
  });
}

// Expose for HTML onclick attributes
window.showRoster     = showRoster;
window.exportCharacter = exportCharacter;
window.importCharacter = importCharacter;
