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
let ACTIVE_ROLL  = null;   // current roll result for the overlay

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
        ${char.race    ? `<span>${escHtml(char.race)}</span>` : ''}
        ${char.class   ? `<span>${escHtml(char.class)}</span>` : ''}
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
  renderTabSpells(char);
  renderTabEquipment(char);
  renderTabNotes(char);
  renderDiceOverlay();
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
      ${infoField('Player Name',    'player_name', char.player_name)}
      ${infoSelect('Race', 'race', char.race, CONFIG.races)}
      ${infoSelect('Class', 'class', char.class, CONFIG.classes.map(c => c.label))}
      ${infoField('Subclass / Archetype', 'subclass', char.subclass)}
      ${infoNumberField('Level', 'level', char.level, 1, 20)}
      ${infoSelect('Alignment', 'alignment', char.alignment, CONFIG.alignments)}
      ${infoField('Background', 'background', char.background)}
      ${infoNumberField('Experience Points', 'experience', char.experience, 0)}
    </div>

    <div class="section-header mt-lg">Appearance</div>
    <div class="char-info-grid">
      ${infoField('Age',    'age',    char.age)}
      ${infoField('Height', 'height', char.height)}
      ${infoField('Weight', 'weight', char.weight)}
      ${infoField('Eyes',   'eyes',   char.eyes)}
      ${infoField('Skin',   'skin',   char.skin)}
      ${infoField('Hair',   'hair',   char.hair)}
    </div>

    <div class="section-header mt-lg">Personality</div>
    <div class="char-info-grid">
      ${infoTextarea('Personality Traits', 'traits',     char.traits)}
      ${infoTextarea('Ideals',             'ideals',     char.ideals)}
      ${infoTextarea('Bonds',              'bonds',      char.bonds)}
      ${infoTextarea('Flaws',              'flaws',      char.flaws)}
    </div>
    ${infoTextarea('Physical Appearance / Backstory', 'appearance', char.appearance, true)}
    ${infoTextarea('Features & Traits', 'features', char.features, true)}
  `;

  // Wire up change listeners
  panel.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', (e) => {
      const key = e.target.dataset.field;
      let val = e.target.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value;
      getChar()[key] = val;
      if (key === 'name') {
        document.getElementById('top-bar-title').textContent = val || 'Unnamed';
        renderRoster(); // Keep roster in sync
      }
      if (key === 'level') recalcDerivedStats();
      scheduleSave();
    });
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

function infoSelect(label, field, value, options) {
  const opts = options.map(o => `<option value="${escHtml(o)}" ${o === value ? 'selected' : ''}>${escHtml(o)}</option>`).join('');
  return `<div class="field-group">
    <label class="field-label">${label}</label>
    <select class="field-input" data-field="${field}">
      <option value="">— Select —</option>
      ${opts}
    </select>
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

  // --- Resources ---
  panel.innerHTML += `<div class="section-header">Resources</div>`;
  const resGrid = document.createElement('div');
  resGrid.className = 'resources-grid';
  CONFIG.tracked_resources.forEach(r => {
    resGrid.appendChild(buildResourceCard(r, char));
  });
  panel.appendChild(resGrid);

  // --- Combat stats row ---
  panel.innerHTML += `<div class="section-header mt-md">Combat</div>`;
  panel.appendChild(buildCombatStatsRow(char));

  // --- Ability Scores ---
  panel.innerHTML += `<div class="section-header mt-md">Ability Scores</div>`;
  const abGrid = document.createElement('div');
  abGrid.className = 'ability-scores-grid';
  CONFIG.core_stats.forEach(s => abGrid.appendChild(buildAbilityCard(s, char)));
  panel.appendChild(abGrid);

  // --- Saving Throws ---
  panel.innerHTML += `<div class="section-header mt-md">Saving Throws</div>`;
  const savesGrid = document.createElement('div');
  savesGrid.className = 'saves-grid';
  CONFIG.saving_throws.forEach(s => savesGrid.appendChild(buildSaveRow(s, char)));
  panel.appendChild(savesGrid);

  // --- Skills ---
  panel.innerHTML += `<div class="section-header mt-md">Skills</div>`;
  const skillsWrap = document.createElement('div');
  skillsWrap.className = 'skills-columns';
  CONFIG.skills.forEach(s => skillsWrap.appendChild(buildSkillRow(s, char)));
  panel.appendChild(skillsWrap);

  // --- Conditions ---
  panel.innerHTML += `<div class="section-header mt-md">Conditions</div>`;
  const condWrap = document.createElement('div');
  condWrap.className = 'conditions-grid';
  CONFIG.conditions.forEach(c => condWrap.appendChild(buildConditionChip(c, char)));
  panel.appendChild(condWrap);
}

function buildResourceCard(resDef, char) {
  const res = char.resources[resDef.id] || { current: 0, max: resDef.default_max ?? 0 };
  const card = document.createElement('div');
  card.className = 'resource-card';
  card.id = `res-card-${resDef.id}`;

  const hasBoth = resDef.has_max;
  const barHtml = (resDef.show_bar && hasBoth)
    ? `<div class="resource-bar-wrap"><div class="resource-bar-fill" id="res-bar-${resDef.id}"
         style="background:${resDef.color}; width:${calcBarPct(res.current, res.max)}%"></div></div>`
    : '';

  card.innerHTML = `
    <div class="resource-label">${resDef.label}${resDef.die ? ` (${resDef.die})` : ''}</div>
    <div class="resource-controls">
      <button class="resource-btn" data-res="${resDef.id}" data-delta="-1">−</button>
      <span class="resource-value-display" id="res-val-${resDef.id}" title="Click to edit">${res.current}</span>
      <input class="resource-value-input" id="res-input-${resDef.id}" type="number" value="${res.current}">
      ${hasBoth ? `<span class="resource-max">/ <input class="currency-input" id="res-max-${resDef.id}"
          style="width:40px" type="number" value="${res.max ?? 0}" title="Max"></span>` : ''}
      <button class="resource-btn" data-res="${resDef.id}" data-delta="+1">＋</button>
    </div>
    ${barHtml}
  `;

  // ±1 buttons
  card.querySelectorAll('.resource-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta);
      adjustResource(resDef.id, delta, resDef);
    });
  });

  // Click value to edit inline
  const valDisplay = card.querySelector(`#res-val-${resDef.id}`);
  const valInput   = card.querySelector(`#res-input-${resDef.id}`);
  if (valDisplay && valInput) {
    valDisplay.addEventListener('click', () => {
      valDisplay.style.display = 'none';
      valInput.style.display   = 'block';
      valInput.focus(); valInput.select();
    });
    valInput.addEventListener('blur', () => commitResourceEdit(resDef.id, valInput, valDisplay));
    valInput.addEventListener('keydown', e => { if (e.key === 'Enter') valInput.blur(); });
  }

  // Max edit
  const maxInput = card.querySelector(`#res-max-${resDef.id}`);
  if (maxInput) {
    maxInput.addEventListener('change', () => {
      getChar().resources[resDef.id].max = parseInt(maxInput.value) || 0;
      updateResourceDisplay(resDef.id, resDef);
      scheduleSave();
    });
  }

  updateResourceCardState(card, resDef, res);
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
  const res = getChar().resources[resId];
  let newVal = (res.current || 0) + delta;
  if (resDef.has_max && res.max != null) newVal = Math.min(newVal, res.max);
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
  const bar  = document.getElementById(`res-bar-${resId}`);
  if (bar) bar.style.width = calcBarPct(res.current, res.max) + '%';
  const card = document.getElementById(`res-card-${resId}`);
  if (card) updateResourceCardState(card, resDef, res);
}

function updateResourceCardState(card, resDef, res) {
  if (resDef.id === 'hp') {
    const pct = calcBarPct(res.current, res.max);
    card.classList.toggle('low-hp', pct <= 25 && res.max > 0);
    const bar = card.querySelector(`#res-bar-${resDef.id}`);
    if (bar) {
      bar.style.backgroundColor = pct <= 25 ? 'var(--color-hp-low)' : resDef.color;
    }
  }
}

function calcBarPct(current, max) {
  if (!max || max === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / max) * 100)));
}

function buildCombatStatsRow(char) {
  const wrap = document.createElement('div');
  wrap.className = 'combat-stats-row';

  const profBonus = getProficiencyBonus(char.level || 1, CONFIG);
  const dexMod    = computeModifier(char.core_stats.dexterity || 10);
  const initBonus = (char.combat.initiative_bonus || 0) + dexMod;
  const passPerc  = 10 + getSkillBonus('perception', char);

  const chips = [
    { label: 'Proficiency', value: `+${profBonus}`, id: 'prof-bonus', editable: false, cls: 'proficiency-chip' },
    { label: 'Armor Class', value: char.combat.armor_class, id: 'combat-ac', editable: true, field: 'armor_class' },
    { label: 'Initiative',  value: formatMod(initBonus), id: 'combat-init', editable: false },
    { label: 'Speed',       value: char.combat.speed, id: 'combat-speed', editable: true, field: 'speed' },
    { label: 'Passive Perc', value: passPerc, id: 'combat-pp', editable: false }
  ];

  chips.forEach(chip => {
    const el = document.createElement('div');
    el.className = `combat-stat-chip ${chip.cls || ''}`;
    el.id = chip.id;
    el.innerHTML = `
      <span class="combat-stat-chip-label">${chip.label}</span>
      <span class="combat-stat-chip-value">
        ${chip.editable
          ? `<input type="number" value="${chip.value}" data-combat-field="${chip.field}" style="width:48px">`
          : chip.value}
      </span>`;
    if (chip.editable) {
      el.querySelector('input').addEventListener('change', e => {
        getChar().combat[chip.field] = parseInt(e.target.value) || 0;
        scheduleSave();
        refreshCombatStats();
      });
    }
    wrap.appendChild(el);
  });

  return wrap;
}

function refreshCombatStats() {
  const char = getChar();
  const prof = getProficiencyBonus(char.level || 1, CONFIG);
  const dexMod = computeModifier(char.core_stats.dexterity || 10);
  const init = (char.combat.initiative_bonus || 0) + dexMod;
  const pp = 10 + getSkillBonus('perception', char);

  const profEl = document.getElementById('prof-bonus');
  if (profEl) profEl.querySelector('.combat-stat-chip-value').textContent = `+${prof}`;
  const initEl = document.getElementById('combat-init');
  if (initEl) initEl.querySelector('.combat-stat-chip-value').textContent = formatMod(init);
  const ppEl = document.getElementById('combat-pp');
  if (ppEl) ppEl.querySelector('.combat-stat-chip-value').textContent = pp;
}

function buildAbilityCard(statDef, char) {
  const card = document.createElement('div');
  card.className = 'ability-card';
  card.dataset.stat = statDef.id;

  const val = char.core_stats[statDef.id] ?? 10;
  const mod = computeModifier(val);
  const modStr = formatMod(mod);
  const modCls = mod > 0 ? 'positive' : mod < 0 ? 'negative' : 'zero';

  card.innerHTML = `
    <span class="ability-abbr">${statDef.abbr}</span>
    <input class="ability-score-input" type="number" min="1" max="30"
           value="${val}" data-stat="${statDef.id}" id="stat-input-${statDef.id}">
    <span class="ability-modifier ${modCls}" id="stat-mod-${statDef.id}">${modStr}</span>
    <button class="ability-roll-btn" data-roll-stat="${statDef.id}">🎲 Check</button>
  `;

  // Stat change → recompute modifier and dependent skills
  card.querySelector('.ability-score-input').addEventListener('input', e => {
    const newVal = Math.max(1, Math.min(30, parseInt(e.target.value) || 10));
    getChar().core_stats[statDef.id] = newVal;
    updateAbilityModDisplay(statDef.id, newVal);
    refreshAllSkillsAndSaves();
    refreshCombatStats();
    scheduleSave();
  });

  // Roll ability check
  card.querySelector('.ability-roll-btn').addEventListener('click', () => {
    const curVal = getChar().core_stats[statDef.id] ?? 10;
    const curMod = computeModifier(curVal);
    const formula = curMod >= 0 ? `1d20 + ${curMod}` : `1d20 - ${Math.abs(curMod)}`;
    const result  = evaluateDiceExpression(formula);
    showRollModal({
      label: `${statDef.label} Check`,
      type:  'ability',
      formula,
      ...result,
      critStatus: checkCrit(result.rolls)
    });
  });

  return card;
}

function updateAbilityModDisplay(statId, val) {
  const mod    = computeModifier(val);
  const modEl  = document.getElementById(`stat-mod-${statId}`);
  if (!modEl) return;
  modEl.textContent = formatMod(mod);
  modEl.className   = `ability-modifier ${mod > 0 ? 'positive' : mod < 0 ? 'negative' : 'zero'}`;
}

function buildSaveRow(saveDef, char) {
  const row = document.createElement('div');
  row.className = 'save-row';
  const saveData = char.saving_throws[saveDef.id] || { proficient: false };
  const bonus = getSaveBonus(saveDef.id, char);

  row.innerHTML = `
    <div class="proficiency-dot ${saveData.proficient ? 'proficient' : ''}"
         data-save="${saveDef.id}" title="Toggle proficiency"></div>
    <span class="save-label">${saveDef.label}</span>
    <span class="save-bonus ${bonus >= 0 ? '' : ''}" id="save-bonus-${saveDef.id}">${formatMod(bonus)}</span>
    <button class="ability-roll-btn" style="font-size:0.7rem;padding:2px 6px;"
            data-roll-save="${saveDef.id}">🎲</button>
  `;

  row.querySelector('.proficiency-dot').addEventListener('click', e => {
    const sv = getChar().saving_throws[saveDef.id];
    sv.proficient = !sv.proficient;
    e.target.classList.toggle('proficient', sv.proficient);
    refreshSaveBonus(saveDef.id);
    scheduleSave();
  });

  row.querySelector('[data-roll-save]').addEventListener('click', () => {
    const bonus2 = getSaveBonus(saveDef.id, getChar());
    const formula = bonus2 >= 0 ? `1d20 + ${bonus2}` : `1d20 - ${Math.abs(bonus2)}`;
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: `${saveDef.label} Save`, type: 'save', formula, ...result, critStatus: checkCrit(result.rolls) });
  });

  return row;
}

function getSaveBonus(saveId, char) {
  const saveDef = CONFIG.saving_throws.find(s => s.id === saveId);
  if (!saveDef) return 0;
  const statVal = char.core_stats[saveDef.stat] ?? 10;
  const mod     = computeModifier(statVal);
  const saveData = char.saving_throws[saveId] || { proficient: false };
  const prof    = saveData.proficient ? getProficiencyBonus(char.level || 1, CONFIG) : 0;
  return mod + prof;
}

function refreshSaveBonus(saveId) {
  const el = document.getElementById(`save-bonus-${saveId}`);
  if (el) el.textContent = formatMod(getSaveBonus(saveId, getChar()));
}

function buildSkillRow(skillDef, char) {
  const row = document.createElement('div');
  row.className = 'skill-row';
  const skillData = char.skills[skillDef.id] || { proficient: false, expertise: false };
  const statDef   = CONFIG.core_stats.find(s => s.id === skillDef.stat);
  const bonus     = getSkillBonus(skillDef.id, char);

  const dotCls = skillData.expertise ? 'expertise' : skillData.proficient ? 'proficient' : '';

  row.innerHTML = `
    <div class="proficiency-dot ${dotCls}" data-skill="${skillDef.id}" title="Click: proficient | Double-click: expertise"></div>
    <span class="skill-bonus ${bonus >= 0 ? 'positive' : 'negative'}" id="skill-bonus-${skillDef.id}">${formatMod(bonus)}</span>
    <span class="skill-name">${skillDef.label}</span>
    <span class="skill-stat-badge">${statDef?.abbr || '?'}</span>
    <button class="skill-roll-btn" data-roll-skill="${skillDef.id}" title="Roll ${skillDef.label}">🎲</button>
  `;

  // Single click = toggle proficiency, double click = expertise
  const dot = row.querySelector('.proficiency-dot');
  let clickTimer = null;
  dot.addEventListener('click', () => {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      const s = getChar().skills[skillDef.id];
      if (!s.proficient && !s.expertise) {
        s.proficient = true;
      } else if (s.proficient && !s.expertise) {
        s.proficient = false;
      }
      dot.className = `proficiency-dot ${s.expertise ? 'expertise' : s.proficient ? 'proficient' : ''}`;
      refreshSkillBonus(skillDef.id);
      refreshCombatStats();
      scheduleSave();
    }, 220);
  });
  dot.addEventListener('dblclick', () => {
    clearTimeout(clickTimer);
    const s = getChar().skills[skillDef.id];
    s.expertise = !s.expertise;
    if (s.expertise) s.proficient = true;
    dot.className = `proficiency-dot ${s.expertise ? 'expertise' : s.proficient ? 'proficient' : ''}`;
    refreshSkillBonus(skillDef.id);
    scheduleSave();
  });

  row.querySelector('[data-roll-skill]').addEventListener('click', () => {
    const b = getSkillBonus(skillDef.id, getChar());
    const formula = b >= 0 ? `1d20 + ${b}` : `1d20 - ${Math.abs(b)}`;
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: `${skillDef.label}`, type: 'skill', formula, ...result, critStatus: checkCrit(result.rolls) });
  });

  return row;
}

function getSkillBonus(skillId, char) {
  const skillDef  = CONFIG.skills.find(s => s.id === skillId);
  if (!skillDef) return 0;
  const statVal   = char.core_stats[skillDef.stat] ?? 10;
  const mod       = computeModifier(statVal);
  const skillData = char.skills[skillId] || {};
  const prof      = getProficiencyBonus(char.level || 1, CONFIG);
  const profAdd   = skillData.expertise ? prof * 2 : skillData.proficient ? prof : 0;
  return mod + profAdd;
}

function refreshSkillBonus(skillId) {
  const el = document.getElementById(`skill-bonus-${skillId}`);
  if (!el) return;
  const b = getSkillBonus(skillId, getChar());
  el.textContent = formatMod(b);
  el.className   = `skill-bonus ${b >= 0 ? 'positive' : 'negative'}`;
}

function refreshAllSkillsAndSaves() {
  const char = getChar();
  CONFIG.skills.forEach(s => refreshSkillBonus(s.id));
  CONFIG.saving_throws.forEach(s => refreshSaveBonus(s.id));
}

function recalcDerivedStats() {
  refreshAllSkillsAndSaves();
  refreshCombatStats();
}

function buildConditionChip(conditionName, char) {
  const chip = document.createElement('div');
  chip.className = `condition-chip ${char.conditions.includes(conditionName) ? 'active' : ''}`;
  chip.textContent = conditionName;
  chip.addEventListener('click', () => {
    const c = getChar();
    const idx = c.conditions.indexOf(conditionName);
    if (idx === -1) c.conditions.push(conditionName);
    else c.conditions.splice(idx, 1);
    chip.classList.toggle('active', c.conditions.includes(conditionName));
    scheduleSave();
  });
  return chip;
}

// -----------------------------------------------
// TAB: COMBAT / ATTACKS
// -----------------------------------------------
function renderTabCombat(char) {
  const panel = document.getElementById('tab-combat');
  panel.innerHTML = `
    <div class="section-header">Attacks & Actions</div>
    <table class="attacks-table" id="attacks-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Attack Roll</th>
          <th>Damage</th>
          <th>Type</th>
          <th>Range</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="attacks-tbody"></tbody>
    </table>
    <div class="flex gap-sm mt-md flex-wrap">
      <button class="btn btn-secondary" id="add-attack-btn">＋ Add Attack</button>
      <button class="btn btn-secondary" id="roll-initiative-btn">🎲 Roll Initiative</button>
    </div>
    <div class="attack-form mt-md" id="attack-form">
      <input class="field-input" id="atk-name"    placeholder="Attack name" style="flex:2">
      <input class="field-input" id="atk-damage"  placeholder="Damage (e.g. 1d8)" style="flex:1">
      <select class="field-input" id="atk-stat"   style="flex:1">
        ${CONFIG.core_stats.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}
      </select>
      <select class="field-input" id="atk-dmgtype" style="flex:1">
        ${CONFIG.damage_types.map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>
      <input class="field-input" id="atk-range"   placeholder="Range" style="flex:1">
      <label style="display:flex;align-items:center;gap:6px;color:var(--text-secondary);font-size:0.85rem">
        <input type="checkbox" id="atk-prof" checked> Proficient
      </label>
      <button class="btn btn-primary" id="atk-save-btn">Add</button>
      <button class="btn btn-secondary" id="atk-cancel-btn">Cancel</button>
    </div>
  `;

  renderAttacksTable(char);

  document.getElementById('add-attack-btn').addEventListener('click', () => {
    document.getElementById('attack-form').classList.toggle('open');
  });
  document.getElementById('atk-cancel-btn').addEventListener('click', () => {
    document.getElementById('attack-form').classList.remove('open');
  });
  document.getElementById('atk-save-btn').addEventListener('click', () => {
    const name = document.getElementById('atk-name').value.trim();
    if (!name) return;
    const newAtk = {
      id:          'custom_' + Date.now(),
      label:       name,
      attack_stat: document.getElementById('atk-stat').value,
      attack_roll: '1d20',
      damage:      document.getElementById('atk-damage').value || '1d4',
      damage_type: document.getElementById('atk-dmgtype').value,
      proficient:  document.getElementById('atk-prof').checked,
      range:       document.getElementById('atk-range').value,
      notes:       ''
    };
    getChar().attacks.push(newAtk);
    scheduleSave();
    document.getElementById('attack-form').classList.remove('open');
    document.getElementById('atk-name').value   = '';
    document.getElementById('atk-damage').value = '';
    document.getElementById('atk-range').value  = '';
    renderAttacksTable(getChar());
  });

  document.getElementById('roll-initiative-btn').addEventListener('click', () => {
    const char2 = getChar();
    const dexMod = computeModifier(char2.core_stats.dexterity || 10);
    const bonus  = (char2.combat.initiative_bonus || 0) + dexMod;
    const formula = bonus >= 0 ? `1d20 + ${bonus}` : `1d20 - ${Math.abs(bonus)}`;
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: 'Initiative', type: 'initiative', formula, ...result, critStatus: checkCrit(result.rolls) });
  });
}

function renderAttacksTable(char) {
  const tbody = document.getElementById('attacks-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  (char.attacks || []).forEach(atk => {
    const atkFormula = buildAttackFormula(atk, char, CONFIG);
    const dmgFormula = buildDamageFormula(atk, char, CONFIG);
    const dmgType    = atk.damage_type || 'physical';
    const dmgColor   = `var(--dmg-${dmgType.replace(/\s+/g, '')}, var(--text-muted))`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(atk.label)}</strong></td>
      <td>
        <button class="attack-roll-btn" data-atk-id="${atk.id}">🎲 ${atkFormula}</button>
      </td>
      <td>
        <button class="damage-roll-btn" data-atk-id="${atk.id}">⚔ ${dmgFormula}</button>
      </td>
      <td><span class="damage-type-badge" style="color:${dmgColor};border-color:${dmgColor}">${escHtml(dmgType)}</span></td>
      <td style="font-size:0.8rem;color:var(--text-muted)">${escHtml(atk.range || '—')}</td>
      <td style="font-size:0.75rem;color:var(--text-muted);max-width:100px">${escHtml(atk.notes || '')}</td>
      <td><button class="delete-attack-btn" data-atk-id="${atk.id}" title="Remove">✕</button></td>
    `;

    tr.querySelector('.attack-roll-btn').addEventListener('click', () => {
      const result = evaluateDiceExpression(atkFormula);
      showRollModal({ label: `${atk.label} — Attack`, type: 'attack', formula: atkFormula, ...result, critStatus: checkCrit(result.rolls) });
    });

    tr.querySelector('.damage-roll-btn').addEventListener('click', () => {
      const result = evaluateDiceExpression(dmgFormula);
      showRollModal({ label: `${atk.label} — Damage`, type: 'damage', formula: dmgFormula, ...result, damageType: dmgType, critStatus: null });
    });

    tr.querySelector('.delete-attack-btn').addEventListener('click', () => {
      if (!confirm(`Remove attack "${atk.label}"?`)) return;
      const c = getChar();
      c.attacks = c.attacks.filter(a => a.id !== atk.id);
      scheduleSave();
      renderAttacksTable(c);
    });

    tbody.appendChild(tr);
  });
}

// -----------------------------------------------
// TAB: SPELLS
// -----------------------------------------------
function renderTabSpells(char) {
  const panel = document.getElementById('tab-spells');
  panel.innerHTML = `<div class="section-header">Spellcasting</div>`;

  const levels = [
    { key: 'cantrips', label: 'Cantrips', slots: 0 },
    { key: 'level1',   label: '1st Level', slots: char.resources.spell_slots?.max || 0 },
    { key: 'level2',   label: '2nd Level', slots: 0 },
    { key: 'level3',   label: '3rd Level', slots: 0 },
    { key: 'level4',   label: '4th Level', slots: 0 },
    { key: 'level5',   label: '5th Level', slots: 0 },
    { key: 'level6',   label: '6th Level', slots: 0 },
    { key: 'level7',   label: '7th Level', slots: 0 },
    { key: 'level8',   label: '8th Level', slots: 0 },
    { key: 'level9',   label: '9th Level', slots: 0 }
  ];

  levels.forEach(lvl => {
    const spells = char.spells[lvl.key] || [];
    const block  = document.createElement('div');
    block.className = 'spell-level-block';
    block.innerHTML = `
      <div class="spell-level-header">
        <span class="spell-level-title">${lvl.label}</span>
      </div>
      <ul class="spell-list" id="spells-${lvl.key}">
        ${spells.map((sp, i) => `
          <li class="spell-item ${sp.prepared ? 'prepared' : ''}" data-idx="${i}" data-lvl="${lvl.key}">
            <div class="spell-prepared-dot" title="Toggle prepared"></div>
            <span class="spell-name">${escHtml(sp.name)}</span>
            ${sp.school ? `<span class="spell-school-badge">${escHtml(sp.school)}</span>` : ''}
            <button class="delete-item-btn" style="opacity:0">✕</button>
          </li>`).join('')}
      </ul>
      <div class="flex gap-sm mt-sm">
        <input class="field-input" placeholder="Spell name" id="spell-input-${lvl.key}" style="flex:2">
        <input class="field-input" placeholder="School" id="spell-school-${lvl.key}" style="flex:1">
        <button class="btn btn-secondary" data-add-spell="${lvl.key}">＋</button>
      </div>
    `;

    // Add spell
    block.querySelector(`[data-add-spell]`).addEventListener('click', () => {
      const nameEl   = block.querySelector(`#spell-input-${lvl.key}`);
      const schoolEl = block.querySelector(`#spell-school-${lvl.key}`);
      const name = nameEl.value.trim();
      if (!name) return;
      getChar().spells[lvl.key].push({ name, school: schoolEl.value.trim(), prepared: false });
      nameEl.value = ''; schoolEl.value = '';
      scheduleSave();
      renderTabSpells(getChar());
    });

    panel.appendChild(block);
  });

  // Wire up prepared toggles and deletes
  panel.querySelectorAll('.spell-item').forEach(item => {
    item.querySelector('.spell-prepared-dot').addEventListener('click', () => {
      const lvl2 = item.dataset.lvl;
      const idx  = parseInt(item.dataset.idx);
      const sp   = getChar().spells[lvl2][idx];
      sp.prepared = !sp.prepared;
      item.classList.toggle('prepared', sp.prepared);
      scheduleSave();
    });

    const delBtn = item.querySelector('.delete-item-btn');
    item.addEventListener('mouseenter', () => delBtn.style.opacity = '1');
    item.addEventListener('mouseleave', () => delBtn.style.opacity = '0');
    delBtn.addEventListener('click', () => {
      const lvl2 = item.dataset.lvl;
      const idx  = parseInt(item.dataset.idx);
      getChar().spells[lvl2].splice(idx, 1);
      scheduleSave();
      renderTabSpells(getChar());
    });
  });
}

// -----------------------------------------------
// TAB: EQUIPMENT
// -----------------------------------------------
function renderTabEquipment(char) {
  const panel = document.getElementById('tab-equipment');
  panel.innerHTML = `
    <div class="section-header">Currency</div>
    <div class="currency-row">
      ${buildCurrencyChip('PP', 'pp', char.currency.pp)}
      ${buildCurrencyChip('GP', 'gp', char.currency.gp)}
      ${buildCurrencyChip('EP', 'ep', char.currency.ep)}
      ${buildCurrencyChip('SP', 'sp', char.currency.sp)}
      ${buildCurrencyChip('CP', 'cp', char.currency.cp)}
    </div>

    <div class="section-header">Inventory</div>
    <div class="equipment-list" id="equipment-list">
      ${(char.equipment || []).map((item, i) => `
        <div class="equipment-item" data-idx="${i}">
          <span class="equipment-qty">${item.qty || 1}×</span>
          <span class="equipment-name">${escHtml(item.name)}</span>
          <span style="flex:1;font-size:0.75rem;color:var(--text-muted)">${escHtml(item.notes || '')}</span>
          <button class="delete-item-btn" title="Remove">✕</button>
        </div>`).join('')}
    </div>
    <div class="flex gap-sm mt-md flex-wrap">
      <input class="field-input" placeholder="Item name" id="eq-name" style="flex:2">
      <input class="field-input" placeholder="Qty" id="eq-qty" type="number" min="1" value="1" style="width:70px">
      <input class="field-input" placeholder="Notes" id="eq-notes" style="flex:2">
      <button class="btn btn-secondary" id="eq-add-btn">＋ Add Item</button>
    </div>
  `;

  // Currency listeners
  panel.querySelectorAll('[data-currency]').forEach(el => {
    el.addEventListener('change', () => {
      getChar().currency[el.dataset.currency] = parseInt(el.value) || 0;
      scheduleSave();
    });
  });

  // Delete items
  panel.querySelectorAll('.equipment-item .delete-item-btn').forEach(btn => {
    const item = btn.closest('.equipment-item');
    item.addEventListener('mouseenter', () => btn.style.opacity = '1');
    item.addEventListener('mouseleave', () => btn.style.opacity = '0');
    btn.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      getChar().equipment.splice(idx, 1);
      scheduleSave();
      renderTabEquipment(getChar());
    });
  });

  // Add item
  document.getElementById('eq-add-btn').addEventListener('click', () => {
    const name = document.getElementById('eq-name').value.trim();
    if (!name) return;
    getChar().equipment.push({
      name,
      qty:   parseInt(document.getElementById('eq-qty').value) || 1,
      notes: document.getElementById('eq-notes').value.trim()
    });
    scheduleSave();
    renderTabEquipment(getChar());
  });
}

function buildCurrencyChip(label, key, value) {
  return `<div class="currency-chip">
    <span class="currency-label">${label}</span>
    <input class="currency-input" type="number" min="0" value="${value || 0}" data-currency="${key}">
  </div>`;
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
// DICE ROLL MODAL
// -----------------------------------------------
function renderDiceOverlay() {
  if (document.getElementById('roll-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'roll-overlay';
  overlay.innerHTML = `
    <div class="roll-modal" id="roll-modal">
      <div class="roll-label" id="roll-label">Roll</div>
      <div class="roll-formula" id="roll-formula"></div>
      <div class="roll-dice-display" id="roll-dice-display"></div>
      <div class="roll-total" id="roll-total">0</div>
      <div class="roll-crit-label" id="roll-crit-label"></div>
      <div class="roll-breakdown" id="roll-breakdown"></div>
      <div class="roll-actions">
        <button class="roll-close-btn" id="roll-close-btn">Close</button>
        <button class="roll-send-btn" id="roll-send-btn">🎲 Send to Roll20</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeRollModal(); });
  document.getElementById('roll-close-btn').addEventListener('click', closeRollModal);
  document.getElementById('roll-send-btn').addEventListener('click', () => {
    if (ACTIVE_ROLL && window.Roll20Bridge) {
      window.Roll20Bridge.sendToRoll20({
        ...ACTIVE_ROLL,
        characterName: getChar()?.name || 'Character'
      });
    }
  });
}

function showRollModal(rollData) {
  ACTIVE_ROLL = rollData;
  const overlay  = document.getElementById('roll-overlay');
  const critStatus = rollData.critStatus;

  document.getElementById('roll-label').textContent   = rollData.label || 'Roll';
  document.getElementById('roll-formula').textContent = rollData.formula || '';
  document.getElementById('roll-total').textContent   = rollData.total;
  document.getElementById('roll-breakdown').textContent = rollData.breakdown || '';

  // Dice display
  const diceDisplay = document.getElementById('roll-dice-display');
  diceDisplay.innerHTML = '';
  (rollData.rolls || []).forEach(r => {
    if (r.results.length === 0) {
      // Flat modifier
      const chip = document.createElement('div');
      chip.className = 'die-result';
      chip.style.fontSize = '1rem';
      chip.textContent = r.subtotal >= 0 ? `+${r.subtotal}` : r.subtotal;
      diceDisplay.appendChild(chip);
    } else {
      r.results.forEach(val => {
        const chip = document.createElement('div');
        chip.className = 'die-result';
        chip.textContent = val;
        if (r.faces === 20) {
          if (val === 20) chip.classList.add('crit-hit');
          if (val === 1)  chip.classList.add('crit-fail');
        }
        diceDisplay.appendChild(chip);
      });
    }
  });

  // Crit label
  const critLabel = document.getElementById('roll-crit-label');
  const totalEl   = document.getElementById('roll-total');
  critLabel.className = 'roll-crit-label';
  totalEl.className   = 'roll-total';
  if (critStatus === 'crit_hit') {
    critLabel.textContent = '⚡ CRITICAL HIT!';
    critLabel.classList.add('crit-hit');
    totalEl.classList.add('crit-hit');
  } else if (critStatus === 'crit_fail') {
    critLabel.textContent = '💀 CRITICAL FAIL';
    critLabel.classList.add('crit-fail');
    totalEl.classList.add('crit-fail');
  } else {
    critLabel.textContent = '';
  }

  overlay.classList.add('visible');
  document.addEventListener('keydown', onRollOverlayKey);
}

function closeRollModal() {
  const overlay = document.getElementById('roll-overlay');
  if (overlay) overlay.classList.remove('visible');
  document.removeEventListener('keydown', onRollOverlayKey);
  ACTIVE_ROLL = null;
}

function onRollOverlayKey(e) {
  if (e.key === 'Escape') closeRollModal();
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
