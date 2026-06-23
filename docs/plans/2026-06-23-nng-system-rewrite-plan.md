# NNG System Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the D&D 5e rules engine in this character sheet with the NNG homebrew system, per `docs/plans/2026-06-23-nng-system-rewrite-design.md`.

**Architecture:** Same vanilla-JS, no-build-step, three-script shell (`dice.js` → `roll20-bridge.js` → `app.js`) as today. `dice.js` gains pure, Node-testable NNG formula functions (no DOM dependency) replacing the D&D ones. `app.js`'s per-tab render functions are rewritten against a new character data shape and `config/nng.json`. `roll20-bridge.js` and the app shell (roster, save/export/import, toasts) are untouched.

**Tech Stack:** Vanilla JS, plain Node (`node:assert`) for dice-formula unit tests — no framework/package.json added.

**Reference design:** `docs/plans/2026-06-23-nng-system-rewrite-design.md`

---

### Task 1: Rewrite `dice.js` formula functions for NNG

**Files:**
- Modify: `dice.js:96-168` (replace `buildAttackFormula`, `buildDamageFormula`, `checkCrit`, `getProficiencyBonus`, `computeModifier`)
- Test: `test-dice.js` (new, temporary — plain Node script, deleted at the end of Task 1)

**Step 1: Write the failing test**

Create `test-dice.js` in the project root:

```js
const assert = require('node:assert');
const {
  deriveMaxHP, deriveInjuryThreshold, deriveRecoveryRate,
  deriveCarryingCapacity, buildTestFormula
} = require('./dice.js');

// deriveMaxHP = 50 + (STR + FOR) * level
assert.strictEqual(deriveMaxHP({ core_stats: { strength: 5, fortitude: 3 }, level: 2 }), 66);
assert.strictEqual(deriveMaxHP({ core_stats: { strength: 0, fortitude: 0 }, level: 1 }), 50);

// deriveInjuryThreshold = 10 + FOR
assert.strictEqual(deriveInjuryThreshold({ core_stats: { fortitude: 4 } }), 14);

// deriveRecoveryRate = 10 + (FOR + WIL)
assert.strictEqual(deriveRecoveryRate({ core_stats: { fortitude: 4, willpower: 2 } }), 16);

// deriveCarryingCapacity = 10 + STR
assert.strictEqual(deriveCarryingCapacity({ core_stats: { strength: 6 } }), 16);

// buildTestFormula
assert.strictEqual(buildTestFormula(5), '2d10 + 5');
assert.strictEqual(buildTestFormula(-3), '2d10 - 3');
assert.strictEqual(buildTestFormula(0), '2d10');

console.log('All dice.js NNG formula tests passed.');
```

**Step 2: Run it to confirm it fails**

Run: `node test-dice.js`

Expected: throws, because `dice.js` doesn't export anything yet (it's a plain browser script with global functions, no `module.exports`) and the new functions don't exist.

**Step 3: Add NNG formula functions and a Node/browser-compatible export**

In `dice.js`, replace lines 96–168 (from `/** Build the full attack roll formula... */` through the end of `formatMod`) with:

```js
/**
 * NNG derived stats — pure formulas off core_stats + level.
 */
function deriveMaxHP(character) {
  const str  = character.core_stats?.strength  ?? 0;
  const fort = character.core_stats?.fortitude ?? 0;
  const level = character.level || 1;
  return 50 + (str + fort) * level;
}

function deriveInjuryThreshold(character) {
  return 10 + (character.core_stats?.fortitude ?? 0);
}

function deriveRecoveryRate(character) {
  const fort = character.core_stats?.fortitude ?? 0;
  const wil  = character.core_stats?.willpower ?? 0;
  return 10 + (fort + wil);
}

function deriveCarryingCapacity(character) {
  return 10 + (character.core_stats?.strength ?? 0);
}

/**
 * Build a "2d10 + modifier" test formula string.
 */
function buildTestFormula(modifier) {
  if (modifier > 0) return `2d10 + ${modifier}`;
  if (modifier < 0) return `2d10 - ${Math.abs(modifier)}`;
  return '2d10';
}

/**
 * Format a modifier as a string: "+3", "−1", "+0"
 */
function formatMod(mod) {
  if (mod >= 0) return `+${mod}`;
  return `−${Math.abs(mod)}`;
}

// Node export for unit testing; no-op in the browser (no `module` global there).
if (typeof module !== 'undefined') {
  module.exports = {
    rollDie, parseDiceToken, evaluateDiceExpression,
    deriveMaxHP, deriveInjuryThreshold, deriveRecoveryRate,
    deriveCarryingCapacity, buildTestFormula, formatMod
  };
}
```

Note: `computeModifier` and `getProficiencyBonus` are deleted entirely (no longer needed — raw stat values are used directly as modifiers in `app.js`). `checkCrit` is deleted (no confirmed crit rule for 2d10 yet).

**Step 4: Run the test again to confirm it passes**

Run: `node test-dice.js`

Expected: `All dice.js NNG formula tests passed.`

**Step 5: Delete the temporary test file and commit**

```bash
cd "d:/Code/Character Sheet NNG"
rm test-dice.js
git add dice.js
git commit -m "feat: replace D&D dice formulas with NNG 2d10 formulas"
```

---

### Task 2: Create `config/nng.json`, remove `config/dnd5e.json`

**Files:**
- Create: `config/nng.json`
- Delete: `config/dnd5e.json`
- Modify: `app.js:10`, `app.js:18`

**Step 1: Create the config file**

`config/nng.json`:

```json
{
  "system": "NNG",
  "version": "1.0.0",
  "dice": { "test": "2d10" },
  "core_stats": [
    { "id": "strength",  "label": "Strength",  "abbr": "STR", "default": 5 },
    { "id": "agility",   "label": "Agility",   "abbr": "AGI", "default": 5 },
    { "id": "fortitude", "label": "Fortitude", "abbr": "FOR", "default": 5 },
    { "id": "willpower", "label": "Willpower", "abbr": "WIL", "default": 5 }
  ],
  "tracked_resources": [
    { "id": "hp",      "label": "Hit Points", "has_max": true, "derived_max": true,  "default_current": 50, "color": "#e74c3c", "show_bar": true },
    { "id": "fatigue", "label": "Fatigue",    "has_max": true, "derived_max": false, "default_current": 0,  "default_max": 100, "color": "#9b59b6", "show_bar": true }
  ],
  "skills": [
    { "id": "acrobatics",        "label": "Acrobatics" },
    { "id": "animal_handling",   "label": "Animal Handling" },
    { "id": "athletics",         "label": "Athletics" },
    { "id": "bureaucracy",       "label": "Bureaucracy" },
    { "id": "computers",         "label": "Computers" },
    { "id": "construction",      "label": "Construction" },
    { "id": "cooking",           "label": "Cooking" },
    { "id": "deception",         "label": "Deception" },
    { "id": "fabrications",      "label": "Fabrications" },
    { "id": "gather_information","label": "Gather Information" },
    { "id": "history",           "label": "History" },
    { "id": "insight",           "label": "Insight" },
    { "id": "intimidation",      "label": "Intimidation" },
    { "id": "investigation",     "label": "Investigation" },
    { "id": "linguistics",       "label": "Linguistics" },
    { "id": "mechanics",         "label": "Mechanics" },
    { "id": "medicine",          "label": "Medicine" },
    { "id": "nature",            "label": "Nature" },
    { "id": "navigation",        "label": "Navigation" },
    { "id": "occult",            "label": "Occult" },
    { "id": "perception",        "label": "Perception" },
    { "id": "performance",       "label": "Performance" },
    { "id": "persuasion",        "label": "Persuasion" },
    { "id": "piloting",          "label": "Piloting" },
    { "id": "riding",            "label": "Riding" },
    { "id": "science",           "label": "Science" },
    { "id": "sleight_of_hand",   "label": "Sleight of Hand" },
    { "id": "stealth",           "label": "Stealth" },
    { "id": "streetwise",        "label": "Streetwise" },
    { "id": "survival",          "label": "Survival" }
  ]
}
```

**Step 2: Delete the old config**

```bash
cd "d:/Code/Character Sheet NNG"
rm config/dnd5e.json
```

**Step 3: Point `app.js` at the new config**

In `app.js:10`, change the comment:
```js
let CONFIG       = null;   // loaded from nng.json
```

In `app.js:18`, change the URL:
```js
const CONFIG_URL         = 'config/nng.json';
```

**Step 4: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('config/nng.json', 'utf8')); console.log('valid JSON')"`

Expected: `valid JSON`

**Step 5: Commit**

```bash
git add config/nng.json app.js
git rm config/dnd5e.json
git commit -m "feat: add NNG system config, remove D&D 5e config"
```

---

### Task 3: Rewrite character data shape (`buildDefaultCharacter`)

**Files:**
- Modify: `app.js:89-145` (`buildDefaultCharacter`)

**Step 1: Replace the function**

Replace `app.js:89-145` with:

```js
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
```

**Step 2: Manually verify in browser**

Open `index.html`, click "New Character". It should open without console errors (check DevTools console — there will be errors from the still-unrewritten tab render functions referencing old config fields like `CONFIG.races`; that's expected until Tasks 4–8 are done). Confirm no error specifically from `buildDefaultCharacter` itself (no `CONFIG.saving_throws`/`CONFIG.default_attacks` undefined errors at this line).

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: rewrite default character shape for NNG system"
```

---

### Task 4: Tab: Character (Name, Origin, Level, Perks)

**Files:**
- Modify: `app.js:259-342` (`renderTabInfo` and its field-builder helpers — keep `infoField`/`infoNumberField`/`infoTextarea`, drop `infoSelect` since nothing uses a dropdown list anymore)
- Modify: `app.js:221-232` (`renderSheet` — `renderTabInfo` call stays, just renamed conceptually; no signature change)

**Step 1: Replace `renderTabInfo` and remove `infoSelect`**

Replace `app.js:259-335` (from `function renderTabInfo` through the end of `infoSelect`) with:

```js
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
```

Note: `infoSelect` is removed (no dropdowns remain — Origin is free text, no Race/Class/Alignment).

**Step 2: Add the shared `buildTextEntryList` helper**

This is a new shared helper used by Perks (this task), Psycasts, Injuries, and Critical Injuries (later tasks). Add it near the bottom of `app.js`, just above the `UTILITY` section (before `function escHtml`, around what is currently line 1198):

```js
// -----------------------------------------------
// SHARED: simple name(+second field) entry list
// Used by Perks, Psycasts, Injuries, Critical Injuries.
// -----------------------------------------------
function buildTextEntryList(container, items, opts) {
  const { maxCount, secondFieldLabel, secondFieldType, addButtonLabel, onChange } = opts;
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
    <input class="field-input" placeholder="Name" id="entry-name-tmp" style="flex:2">
    <input class="field-input" placeholder="${secondFieldLabel}" id="entry-second-tmp" type="${secondFieldType === 'number' ? 'number' : 'text'}" style="flex:2">
    <button class="btn btn-secondary" id="entry-add-tmp">${addButtonLabel}</button>
  `;
  container.appendChild(form);

  form.querySelector('#entry-add-tmp').addEventListener('click', () => {
    const name = form.querySelector('#entry-name-tmp').value.trim();
    if (!name) return;
    const secondVal = form.querySelector('#entry-second-tmp').value;
    const entry = { name };
    entry[secondFieldType === 'number' ? 'weight' : 'description'] = secondFieldType === 'number' ? (parseFloat(secondVal) || 0) : secondVal.trim();
    items.push(entry);
    scheduleSave();
    onChange();
  });
}
```

**Step 3: Manually verify in browser**

Reload, open a character, go to the Character tab. Confirm: Name/Origin/Level fields work and save; Origin Perk name/description fields work; adding a Perk appends to the list and shows the `(N/10)` counter; removing a perk works; at 10 perks the add form disappears.

**Step 4: Commit**

```bash
git add app.js
git commit -m "feat: rewrite Character tab for NNG (Origin, Level, Perks)"
```

---

### Task 5: Tab: Abilities (stats, HP/Fatigue, derived stats, Skills, Injuries)

**Files:**
- Modify: `app.js:344-757` (entire Abilities tab block: `renderTabAbilities` through `buildConditionChip`)

**Step 1: Replace the whole Abilities tab block**

Replace `app.js:344-757` (from the `TAB: ABILITIES & SKILLS` comment through the end of `buildConditionChip`) with:

```js
// -----------------------------------------------
// TAB: ABILITIES & SKILLS
// -----------------------------------------------
function renderTabAbilities(char) {
  const panel = document.getElementById('tab-abilities');
  panel.innerHTML = '';

  // --- Ability Scores ---
  panel.innerHTML += `<div class="section-header">Ability Scores</div>`;
  const abGrid = document.createElement('div');
  abGrid.className = 'ability-scores-grid';
  CONFIG.core_stats.forEach(s => abGrid.appendChild(buildAbilityCard(s, char)));
  panel.appendChild(abGrid);

  // --- Resources (HP, Fatigue) ---
  panel.innerHTML += `<div class="section-header mt-md">Resources</div>`;
  const resGrid = document.createElement('div');
  resGrid.className = 'resources-grid';
  CONFIG.tracked_resources.forEach(r => resGrid.appendChild(buildResourceCard(r, char)));
  panel.appendChild(resGrid);

  // --- Derived stats (read-only) ---
  panel.innerHTML += `<div class="section-header mt-md">Derived</div>`;
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
  panel.innerHTML += `<div class="section-header mt-md">Skills</div>`;
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
  panel.innerHTML += `<div class="section-header mt-md">Injuries</div>`;
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
  panel.innerHTML += `<div class="section-header mt-md">Critical Injuries</div>`;
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

  card.querySelector('.ability-score-input').addEventListener('input', e => {
    const newVal = Math.max(0, Math.min(20, parseInt(e.target.value) || 0));
    getChar().core_stats[statDef.id] = newVal;
    recalcDerivedStats();
    scheduleSave();
  });

  card.querySelector('.ability-roll-btn').addEventListener('click', () => {
    const curVal = getChar().core_stats[statDef.id] ?? 0;
    const formula = buildTestFormula(curVal);
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: `${statDef.label} Test`, type: 'ability', formula, ...result });
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
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: skillDef.label, type: 'skill', formula, ...result });
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
```

Notes on this rewrite:
- `buildSaveRow`/`getSaveBonus`/`refreshSaveBonus`/`refreshAllSkillsAndSaves`/`buildConditionChip` are deleted entirely (no saving throws or conditions in NNG).
- `buildCombatStatsRow`/`refreshCombatStats` are deleted from this tab — Armor/Speed/Initiative move to the Combat tab in Task 6.
- `recalcDerivedStats` is simplified to a full re-render of the Abilities tab (simplest correct way to keep HP max / Injury Threshold / Recovery Rate / Skill totals all in sync when a stat or level changes — this tab isn't large enough for the granular per-element refresh the D&D version used).

**Step 2: Manually verify in browser**

Reload, open a character, go to Abilities tab. Confirm: STR/AGI/FOR/WIL inputs work; HP card shows current/derived-max and the bar updates; Fatigue shows current/100; Injury Threshold and Recovery Rate update live when you change FOR or WIL; each skill row's Origin/Rank inputs update its Total; clicking a skill's 🎲 or an ability's "Test" button opens the roll modal with a `2d10 ± N` formula; adding/removing Injuries and Critical Injuries works.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: rewrite Abilities tab for NNG (stats, HP/Fatigue, skills, injuries)"
```

---

### Task 6: Tab: Combat (Armor, Speed, Initiative, Weapons)

**Files:**
- Modify: `app.js:759-889` (entire Combat tab block: `renderTabCombat` and `renderAttacksTable`)

**Step 1: Replace the whole Combat tab block**

Replace `app.js:759-889` (from the `TAB: COMBAT / ATTACKS` comment through the end of `renderAttacksTable`) with:

```js
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
    <span class="combat-stat-chip-value">
      <button class="ability-roll-btn" id="roll-initiative-btn">🎲 Roll</button>
    </span>`;
  wrap.appendChild(initEl);

  document.getElementById('roll-initiative-btn').addEventListener('click', () => {
    const agi = getChar().core_stats.agility ?? 0;
    const formula = buildTestFormula(agi);
    const result  = evaluateDiceExpression(formula);
    showRollModal({ label: 'Initiative', type: 'initiative', formula, ...result });
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
      const result  = evaluateDiceExpression(formula);
      showRollModal({ label: `${weapon.label} — Attack`, type: 'attack', formula, ...result });
    });

    tr.querySelector('.damage-roll-btn').addEventListener('click', () => {
      const result = evaluateDiceExpression(weapon.damage);
      showRollModal({ label: `${weapon.label} — Damage`, type: 'damage', formula: weapon.damage, ...result });
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
```

**Step 2: Manually verify in browser**

Reload, go to Combat tab. Confirm: Head/Body Armor and Speed inputs save; Initiative roll button shows `2d10 ± AGI`; adding a weapon works, the Skill dropdown changes which skill's Total is used (check by changing a skill's Rank in the Abilities tab, then rolling the weapon's attack and confirming the formula updates); ammo current/max ticks down and clamps to max; deleting a weapon works.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: rewrite Combat tab for NNG (armor, speed, initiative, weapons)"
```

---

### Task 7: Tab: Psycasts (renamed from Spells)

**Files:**
- Modify: `app.js:891-972` (entire `renderTabSpells` function → renamed `renderTabPsycasts`)
- Modify: `app.js:227` (`renderSheet`'s call site)
- Modify: `index.html:53,63` (tab button + panel id/label)

**Step 1: Replace the Spells tab function**

Replace `app.js:891-972` (from the `TAB: SPELLS` comment through the end of `renderTabSpells`) with:

```js
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
```

**Step 2: Update the call site in `renderSheet`**

In `app.js:227`, change:
```js
  renderTabSpells(char);
```
to:
```js
  renderTabPsycasts(char);
```

**Step 3: Update `index.html`**

In `index.html:53`, change:
```html
      <button class="tab-btn"        data-tab="tab-spells"     role="tab">Spells</button>
```
to:
```html
      <button class="tab-btn"        data-tab="tab-psycasts"   role="tab">Psycasts</button>
```

In `index.html:63`, change:
```html
      <div class="tab-panel"        id="tab-spells"     role="tabpanel"></div>
```
to:
```html
      <div class="tab-panel"        id="tab-psycasts"   role="tabpanel"></div>
```

**Step 4: Manually verify in browser**

Reload, confirm the tab now reads "Psycasts", and adding/removing psycast entries works up to the 14 cap (add form disappears at 14).

**Step 5: Commit**

```bash
git add app.js index.html
git commit -m "feat: rename Spells tab to Psycasts, simplify to flat 14-slot list"
```

---

### Task 8: Tab: Equipment (Carrying Capacity, gear, no currency)

**Files:**
- Modify: `app.js:974-1047` (entire Equipment tab block: `renderTabEquipment` and `buildCurrencyChip`)

**Step 1: Replace the Equipment tab block**

Replace `app.js:974-1047` (from the `TAB: EQUIPMENT` comment through the end of `buildCurrencyChip`) with:

```js
// -----------------------------------------------
// TAB: EQUIPMENT
// -----------------------------------------------
function renderTabEquipment(char) {
  const panel = document.getElementById('tab-equipment');
  const capacity = deriveCarryingCapacity(char);
  const usedWeight = (char.equipment || []).reduce((sum, item) => sum + (item.weight || 0), 0);

  panel.innerHTML = `
    <div class="section-header">Carrying Capacity</div>
    <div class="combat-stats-row">
      <div class="combat-stat-chip">
        <span class="combat-stat-chip-label">Capacity</span>
        <span class="combat-stat-chip-value">${usedWeight} / ${capacity} lbs</span>
      </div>
    </div>

    <div class="section-header mt-md">Gear</div>
    <div id="equipment-list"></div>
  `;

  buildTextEntryList(document.getElementById('equipment-list'), char.equipment, {
    maxCount: Infinity,
    secondFieldLabel: 'Weight (lbs)',
    secondFieldType: 'number',
    addButtonLabel: '+ Add Item',
    onChange: () => renderTabEquipment(getChar())
  });
}
```

**Step 2: Manually verify in browser**

Reload, go to Equipment tab. Confirm: Capacity shows `10 + STR` (check it updates if you change STR in Abilities); adding gear items with a weight updates the used-weight total; removing items updates it back down.

**Step 3: Commit**

```bash
git add app.js
git commit -m "feat: rewrite Equipment tab for NNG (carrying capacity, drop currency)"
```

---

### Task 9: Clean up the roll modal (remove dead D&D crit code)

**Files:**
- Modify: `app.js:1099-1153` (`showRollModal`)

**Step 1: Remove the crit-specific branches**

In `showRollModal` (`app.js:1099-1153`), the dice-display loop currently special-cases `r.faces === 20` for crit highlighting (lines ~1125-1128), and there's a crit-label block (lines ~1134-1149) keyed off `rollData.critStatus`, which nothing sets anymore (Task 1 deleted `checkCrit`, and no call site in Tasks 4–8 passes `critStatus`). Replace the body of `showRollModal` with:

```js
function showRollModal(rollData) {
  ACTIVE_ROLL = rollData;
  const overlay = document.getElementById('roll-overlay');

  document.getElementById('roll-label').textContent     = rollData.label || 'Roll';
  document.getElementById('roll-formula').textContent    = rollData.formula || '';
  document.getElementById('roll-total').textContent      = rollData.total;
  document.getElementById('roll-breakdown').textContent  = rollData.breakdown || '';
  document.getElementById('roll-crit-label').textContent = '';

  const diceDisplay = document.getElementById('roll-dice-display');
  diceDisplay.innerHTML = '';
  (rollData.rolls || []).forEach(r => {
    if (r.results.length === 0) {
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
        diceDisplay.appendChild(chip);
      });
    }
  });

  overlay.classList.add('visible');
  document.addEventListener('keydown', onRollOverlayKey);
}
```

**Step 2: Manually verify in browser**

Trigger any roll (e.g. a skill). Confirm the modal shows the formula, dice chips, total, and breakdown with no console errors, and no leftover crit banner/styling appears.

**Step 3: Commit**

```bash
git add app.js
git commit -m "chore: remove dead D&D crit-detection code from roll modal"
```

---

### Task 10: Full manual smoke test and push

**Step 1: Fresh end-to-end pass**

In the browser (reload `index.html` fresh, clear localStorage first via DevTools Console: `localStorage.clear()` then reload):

1. Create a new character.
2. Character tab: set Name, Origin, Level; add an Origin Perk and 2 regular Perks.
3. Abilities tab: set STR/AGI/FOR/WIL to non-zero values; confirm HP max, Injury Threshold, Recovery Rate update; set a skill's Origin and Rank, confirm Total updates and roll it; add an Injury and a Critical Injury.
4. Combat tab: set Head/Body Armor and Speed; roll Initiative; add a weapon, pick a skill for it, roll its attack and damage, adjust ammo.
5. Psycasts tab: add 2 psycasts.
6. Equipment tab: add 2 gear items with weights, confirm capacity total.
7. Notes tab: type a note, confirm it saves (reload the page, reopen the character, confirm everything persisted).
8. Export the character (↓ Export button), confirm a JSON file downloads with the new NNG shape.

**Step 2: Push**

```bash
cd "d:/Code/Character Sheet NNG"
git push
```

GitHub Pages auto-redeploys from `main` — no separate Pages step needed (already configured).

**Step 3: Report back**

Tell the user the smoke test result. If anything in step 1 didn't behave as expected, stop and report the specific failure rather than pushing broken code.
