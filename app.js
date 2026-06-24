// =============================================
// TTRPG CHARACTER SHEET — MAIN APP
// =============================================

'use strict';

// -----------------------------------------------
// STATE
// -----------------------------------------------
let CONFIG       = null;   // loaded from nng.json
let CHARACTERS   = {};     // { [id]: characterObject }
let ACTIVE_ID    = null;   // currently open character id
let SAVE_TIMER   = null;   // debounce handle for autosave

const STORAGE_CHARS_KEY  = 'ttrpg_characters';
const STORAGE_ACTIVE_KEY = 'ttrpg_active_id';
const CONFIG_URL         = 'config/nng.json';

// -----------------------------------------------
// BOOTSTRAP
// -----------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  CONFIG = await loadConfig(CONFIG_URL);
  loadAllCharacters();
  renderRoster();
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
  localStorage.setItem(STORAGE_CHARS_KEY, JSON.stringify(CHARACTERS));
}

function scheduleSave() {
  const indicator = document.getElementById('save-indicator');
  if (indicator) { indicator.className = 'save-indicator saving'; indicator.querySelector('.save-dot-label').textContent = 'Saving…'; }
  clearTimeout(SAVE_TIMER);
  SAVE_TIMER = setTimeout(() => {
    saveAllCharacters();
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
  CONFIG.skills.forEach(s => { skills[s.id] = { origin: 0, rank: 0 }; });

  return {
    id,
    name:        'New Character',
    origin:      '',
    level:       1,
    core_stats:  stats,
    resources,
    armor: { head: 0, body: 0 },
    speed: 30,
    initiative_bonus: 0,
    skills,
    perks:        [],
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

// -----------------------------------------------
// RENDER FULL SHEET
// -----------------------------------------------
function renderSheet() {
  const char = getChar();
  renderTopBar(char);
  renderTabNav();
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
        if (key === 'level') recalcDerivedStats();
      }
      scheduleSave();
    });
  });

  buildTextEntryList(document.getElementById('perks-list'), char.perks, {
    maxCount: 10,
    secondFieldLabel: 'Description',
    secondFieldType: 'text',
    addButtonLabel: '+ Add Perk',
    onChange: () => renderTabInfo(getChar())
  });
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
  addSectionHeader('Derived', 'mt-md');
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
  const skillsHeader = document.createElement('div');
  skillsHeader.className = 'skill-row';
  skillsHeader.style.fontSize = '0.75rem';
  skillsHeader.style.color = 'var(--text-muted)';
  skillsHeader.innerHTML = `<span></span><span>Skill</span><span>Origin</span><span>Rank</span><span>Total</span>`;
  panel.appendChild(skillsHeader);

  const skillsWrap = document.createElement('div');
  skillsWrap.className = 'skills-columns';
  CONFIG.skills.forEach(s => skillsWrap.appendChild(buildSkillRow(s, char)));
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
  const maxVal = resDef.derived_max ? deriveMaxHP(char) : res.max;
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
  const maxVal = resDef.derived_max ? deriveMaxHP(char) : res.max;
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
  const maxVal = resDef.derived_max ? deriveMaxHP(char) : res.max;
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
    <input class="ability-score-input" type="number" min="0" max="20"
           value="${val}" data-stat="${statDef.id}" id="stat-input-${statDef.id}">
    <button class="ability-roll-btn" data-roll-stat="${statDef.id}">🎲 Test</button>
  `;

  card.querySelector('.ability-score-input').addEventListener('change', e => {
    const newVal = Math.max(0, Math.min(20, parseInt(e.target.value) || 0));
    getChar().core_stats[statDef.id] = newVal;
    recalcDerivedStats();
    scheduleSave();
  });

  card.querySelector('.ability-roll-btn').addEventListener('click', () => {
    const curVal = getChar().core_stats[statDef.id] ?? 0;
    const formula = buildTestFormula(curVal);
    window.Roll20Bridge.sendToRoll20({ label: `${statDef.label} Test`, formula, characterName: getChar()?.name || 'Character' });
  });

  return card;
}

function buildSkillRow(skillDef, char) {
  const row = document.createElement('div');
  row.className = 'skill-row';
  const skillData = char.skills[skillDef.id] || { origin: 0, rank: 0 };
  const total = (skillData.origin || 0) + (skillData.rank || 0);

  row.innerHTML = `
    <button class="skill-roll-btn" data-roll-skill="${skillDef.id}" title="Roll ${skillDef.label}">🎲</button>
    <span class="skill-name">${skillDef.label}</span>
    <input class="currency-input" style="width:40px" type="number" min="0" value="${skillData.origin || 0}" data-skill-origin="${skillDef.id}">
    <input class="currency-input" style="width:40px" type="number" min="0" max="12" value="${skillData.rank || 0}" data-skill-rank="${skillDef.id}">
    <span class="skill-bonus" id="skill-total-${skillDef.id}">${total}</span>
  `;

  row.querySelector('[data-skill-origin]').addEventListener('change', e => {
    getChar().skills[skillDef.id].origin = parseInt(e.target.value) || 0;
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

  row.querySelector('[data-roll-skill]').addEventListener('click', () => {
    const s = getChar().skills[skillDef.id];
    const total2 = (s.origin || 0) + (s.rank || 0);
    const formula = buildTestFormula(total2);
    window.Roll20Bridge.sendToRoll20({ label: skillDef.label, formula, characterName: getChar()?.name || 'Character' });
  });

  return row;
}

function getSkillTotal(skillId, char) {
  const s = char.skills[skillId] || { origin: 0, rank: 0 };
  return (s.origin || 0) + (s.rank || 0);
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
    <table class="attacks-table" id="attacks-table">
      <thead>
        <tr>
          <th>Weapon</th>
          <th>Skill</th>
          <th>Attack</th>
          <th>Damage</th>
          <th>Range</th>
          <th>Ammo</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="attacks-tbody"></tbody>
    </table>
    <div class="flex gap-sm mt-md flex-wrap">
      <button class="btn btn-secondary" id="add-weapon-btn">＋ Add Weapon</button>
    </div>
    <div class="attack-form mt-md" id="attack-form">
      <input class="field-input" id="atk-name"   placeholder="Weapon name" style="flex:2">
      <input class="field-input" id="atk-damage" placeholder="Damage (e.g. 2d6)" style="flex:1">
      <input class="field-input" id="atk-range"  placeholder="Range" style="flex:1">
      <input class="field-input" id="atk-ammo-max" placeholder="Ammo max" type="number" min="0" style="flex:1">
      <button class="btn btn-primary" id="atk-save-btn">Add</button>
      <button class="btn btn-secondary" id="atk-cancel-btn">Cancel</button>
    </div>
  `;

  buildCombatStatsRow(char);
  renderAttacksTable(char);

  document.getElementById('add-weapon-btn').addEventListener('click', () => {
    document.getElementById('attack-form').classList.toggle('open');
  });
  document.getElementById('atk-cancel-btn').addEventListener('click', () => {
    document.getElementById('attack-form').classList.remove('open');
  });
  document.getElementById('atk-save-btn').addEventListener('click', () => {
    const name = document.getElementById('atk-name').value.trim();
    if (!name) return;
    const ammoMax = parseInt(document.getElementById('atk-ammo-max').value) || 0;
    getChar().weapons.push({
      id:      'weapon_' + Date.now(),
      label:   name,
      damage:  document.getElementById('atk-damage').value || '1d4',
      range:   document.getElementById('atk-range').value,
      skill_id: CONFIG.skills[0].id,
      ammo:    ammoMax > 0 ? { current: ammoMax, max: ammoMax } : null
    });
    scheduleSave();
    document.getElementById('attack-form').classList.remove('open');
    document.getElementById('atk-name').value     = '';
    document.getElementById('atk-damage').value   = '';
    document.getElementById('atk-range').value    = '';
    document.getElementById('atk-ammo-max').value = '';
    renderAttacksTable(getChar());
  });
}

function buildCombatStatsRow(char) {
  const wrap = document.getElementById('combat-stats-row');
  wrap.innerHTML = '';

  const chips = [
    { label: 'Head Armor',       value: char.armor.head,      field: 'head' },
    { label: 'Body Armor',       value: char.armor.body,      field: 'body' },
    { label: 'Speed',            value: char.speed,           field: 'speed' },
    { label: 'Initiative Bonus', value: char.initiative_bonus, field: 'initiative_bonus' }
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
      else if (chip.field === 'initiative_bonus') getChar().initiative_bonus = v;
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
    const agi = getChar().core_stats.agility ?? 0;
    const bonus = getChar().initiative_bonus ?? 0;
    const mod = agi + bonus;
    const formula = mod >= 0 ? `1d10 + ${mod}` : `1d10 - ${Math.abs(mod)}`;
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula, characterName: getChar()?.name || 'Character' });
  });
}

function renderAttacksTable(char) {
  const tbody = document.getElementById('attacks-tbody');
  tbody.innerHTML = '';

  (char.weapons || []).forEach(weapon => {
    const tr = document.createElement('tr');
    const ammoText = weapon.ammo ? `${weapon.ammo.current}/${weapon.ammo.max}` : '—';

    tr.innerHTML = `
      <td><strong>${escHtml(weapon.label)}</strong></td>
      <td>
        <select class="field-input" data-weapon-skill="${weapon.id}" style="font-size:0.8rem">
          ${CONFIG.skills.map(s => `<option value="${s.id}" ${s.id === weapon.skill_id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </td>
      <td><button class="attack-roll-btn" data-wpn-id="${weapon.id}">🎲 2d10</button></td>
      <td><button class="damage-roll-btn" data-wpn-id="${weapon.id}">⚔ ${escHtml(weapon.damage)}</button></td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${escHtml(weapon.range || '—')}</td>
      <td style="font-size:0.8rem;color:var(--text-muted)">
        ${weapon.ammo
          ? `<input class="currency-input" style="width:50px" type="number" min="0" max="${weapon.ammo.max}" value="${weapon.ammo.current}" data-ammo-current="${weapon.id}">/${weapon.ammo.max}`
          : '—'}
      </td>
      <td><button class="delete-attack-btn" data-wpn-id="${weapon.id}" title="Remove">✕</button></td>
    `;

    tr.querySelector('[data-weapon-skill]').addEventListener('change', e => {
      weapon.skill_id = e.target.value;
      scheduleSave();
    });

    tr.querySelector('.attack-roll-btn').addEventListener('click', () => {
      const total = getSkillTotal(weapon.skill_id, getChar());
      const formula = buildTestFormula(total);
      window.Roll20Bridge.sendToRoll20({ label: `${weapon.label} — Attack`, formula, characterName: getChar()?.name || 'Character' });
    });

    tr.querySelector('.damage-roll-btn').addEventListener('click', () => {
      window.Roll20Bridge.sendToRoll20({ label: `${weapon.label} — Damage`, formula: weapon.damage, characterName: getChar()?.name || 'Character' });
    });

    const ammoInput = tr.querySelector('[data-ammo-current]');
    if (ammoInput) {
      ammoInput.addEventListener('change', e => {
        weapon.ammo.current = Math.max(0, Math.min(weapon.ammo.max, parseInt(e.target.value) || 0));
        scheduleSave();
        renderAttacksTable(getChar());
      });
    }

    tr.querySelector('.delete-attack-btn').addEventListener('click', () => {
      if (!confirm(`Remove weapon "${weapon.label}"?`)) return;
      const c = getChar();
      c.weapons = c.weapons.filter(w => w.id !== weapon.id);
      scheduleSave();
      renderAttacksTable(c);
    });

    tbody.appendChild(tr);
  });
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
// EXPORT / IMPORT
// -----------------------------------------------
function exportCharacter() {
  const char = getChar();
  const blob = new Blob([JSON.stringify(char, null, 2)], { type: 'application/json' });
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
    const text = await file.text();
    const char = JSON.parse(text);
    char.id = char.id || ('char_' + Date.now());
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
// UTILITY
// -----------------------------------------------
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Expose for HTML onclick attributes
window.showRoster     = showRoster;
window.exportCharacter = exportCharacter;
window.importCharacter = importCharacter;
