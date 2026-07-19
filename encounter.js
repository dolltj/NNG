// =============================================
// ENCOUNTER TRACKER
// GM-only page: enemy stat blocks, HP / armor
// tracking, turn-tracker pips per enemy, and
// Roll20 roll buttons.  State is in-memory.
// =============================================
'use strict';

let ENEMY_TEMPLATES = [];
let ENCOUNTER       = [];
let SELECTED_UID    = null;
let _uidSeq         = 0;

// -----------------------------------------------
// BOOTSTRAP
// -----------------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const raw = await window.RemoteConfig.loadConfigWithFallback('enemies', 'config/enemies.json');
    ENEMY_TEMPLATES = Array.isArray(raw) ? raw : [];
  } catch {
    ENEMY_TEMPLATES = [];
  }

  document.getElementById('add-enemy-btn').addEventListener('click', openPicker);

  document.getElementById('new-turn-btn').addEventListener('click', () => {
    ENCOUNTER.forEach(inst => { inst.tracker = { actions: 0, quick: 0, reaction: 0 }; });
    _refreshAllCardTrackers();
    const dtb = document.querySelector('.enc-detail-tracker-bar');
    const sel = ENCOUNTER.find(e => e.uid === SELECTED_UID);
    if (dtb && sel) _buildDetailTrackerBar(dtb, sel);
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    if (ENCOUNTER.length === 0 || confirm('Remove all enemies from the encounter?')) {
      ENCOUNTER = [];
      SELECTED_UID = null;
      renderCards();
      renderDetail();
    }
  });

  // ---- Event delegation on the card row ----
  // HP input changes (update bar + dead-state in-place without re-render)
  document.getElementById('encounter-cards').addEventListener('input', e => {
    if (!e.target.matches('.enc-hp-input')) return;
    const card = e.target.closest('[data-uid]');
    const inst = ENCOUNTER.find(i => i.uid === card?.dataset.uid);
    if (!inst) return;
    inst.hp = Math.max(0, Math.min(inst.hp_max, parseInt(e.target.value) || 0));
    const bar = card.querySelector('.enc-hp-bar');
    if (bar) bar.style.width = `${inst.hp_max > 0 ? (inst.hp / inst.hp_max) * 100 : 0}%`;
    card.classList.toggle('dead', inst.hp <= 0);
  });

  // Card-level clicks (pips, remove, card selection)
  document.getElementById('encounter-cards').addEventListener('click', e => {
    // Pip toggle
    const pip = e.target.closest('.enc-pip');
    if (pip) {
      e.stopPropagation();
      const card = pip.closest('[data-uid]');
      const inst = ENCOUNTER.find(i => i.uid === card?.dataset.uid);
      if (!inst) return;
      const kind = pip.dataset.kind;
      const idx  = parseInt(pip.dataset.idx);
      inst.tracker[kind] = inst.tracker[kind] > idx ? idx : idx + 1;
      // Re-render only this card's tracker area
      const el = card.querySelector('.enc-card-tracker');
      if (el) el.innerHTML = _pipsHtml(inst.tracker);
      // Keep detail tracker in sync
      const dtb = document.querySelector('.enc-detail-tracker-bar');
      if (dtb && SELECTED_UID === inst.uid) _buildDetailTrackerBar(dtb, inst);
      return;
    }

    // Remove
    if (e.target.matches('.encounter-card-remove')) {
      const card = e.target.closest('[data-uid]');
      const inst = ENCOUNTER.find(i => i.uid === card?.dataset.uid);
      if (inst && confirm(`Remove ${inst.label} from the encounter?`)) removeFromEncounter(inst.uid);
      return;
    }

    // HP input — don't propagate to card selection
    if (e.target.matches('.enc-hp-input')) return;

    // Card selection
    const card = e.target.closest('.encounter-card[data-uid]');
    if (!card) return;
    if (SELECTED_UID !== card.dataset.uid) {
      SELECTED_UID = card.dataset.uid;
      document.querySelectorAll('.encounter-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.uid === SELECTED_UID);
      });
      renderDetail();
    }
  });

  renderCards();
});

// -----------------------------------------------
// STATE HELPERS
// -----------------------------------------------
function addToEncounter(templateId) {
  const template = ENEMY_TEMPLATES.find(t => t.id === templateId);
  if (!template) return;
  const uid = `enc_${++_uidSeq}`;
  ENCOUNTER.push({
    uid, template_id: templateId, label: '',
    hp:         template.hp_max    || 0,
    hp_max:     template.hp_max    || 0,
    helm:       template.helm_max  || 0,
    helm_max:   template.helm_max  || 0,
    armor:      template.armor_max || 0,
    armor_max:  template.armor_max || 0,
    tracker:    { actions: 0, quick: 0, reaction: 0 },
    collapsedGroups: new Set(),
    template
  });
  _refreshLabels(templateId);
  SELECTED_UID = uid;
  renderCards();
  renderDetail();
}

function removeFromEncounter(uid) {
  const tId = (ENCOUNTER.find(e => e.uid === uid) || {}).template_id;
  ENCOUNTER = ENCOUNTER.filter(e => e.uid !== uid);
  if (SELECTED_UID === uid) SELECTED_UID = ENCOUNTER.length > 0 ? ENCOUNTER[0].uid : null;
  if (tId) _refreshLabels(tId);
  renderCards();
  renderDetail();
}

function _refreshLabels(templateId) {
  const same = ENCOUNTER.filter(e => e.template_id === templateId);
  const name = same[0]?.template.name || '';
  if (same.length === 1) {
    same[0].label = name;
  } else {
    same.forEach((e, i) => { e.label = `${name} ${String.fromCharCode(65 + i)}`; });
  }
}

// Sync a card's bar + input + dead class without destroying the card element
function _syncCard(inst) {
  const card = document.querySelector(`.encounter-card[data-uid="${inst.uid}"]`);
  if (!card) return;
  const pct = inst.hp_max > 0 ? Math.max(0, Math.min(100, (inst.hp / inst.hp_max) * 100)) : 0;
  const bar = card.querySelector('.enc-hp-bar');
  if (bar) bar.style.width = `${pct}%`;
  const inp = card.querySelector('.enc-hp-input');
  if (inp && parseInt(inp.value) !== inst.hp) inp.value = inst.hp;
  card.classList.toggle('dead', inst.hp <= 0);
}

function _refreshAllCardTrackers() {
  ENCOUNTER.forEach(inst => {
    const el = document.querySelector(`.encounter-card[data-uid="${inst.uid}"] .enc-card-tracker`);
    if (el) el.innerHTML = _pipsHtml(inst.tracker);
  });
}

// -----------------------------------------------
// TURN-TRACKER PIPS HTML (for card badges)
// -----------------------------------------------
function _pipsHtml(tracker) {
  return [
    { key: 'actions',  label: 'ACT', max: 2 },
    { key: 'quick',    label: 'QK',  max: 1 },
    { key: 'reaction', label: 'RX',  max: 1 }
  ].map(g => `
    <span class="enc-pip-group">
      <span class="enc-pip-label">${g.label}</span>
      ${Array.from({ length: g.max }, (_, i) =>
        `<button class="enc-pip${tracker[g.key] > i ? ' used' : ''}"
           data-kind="${g.key}" data-idx="${i}"
           title="${g.key} — click to toggle"></button>`
      ).join('')}
    </span>`).join('');
}

// -----------------------------------------------
// RENDER — CARD ROW
// -----------------------------------------------
function renderCards() {
  const row = document.getElementById('encounter-cards');
  row.innerHTML = '';
  if (ENCOUNTER.length === 0) {
    row.innerHTML = `<p class="encounter-empty-msg">No enemies yet — click <strong>＋ Add Enemy</strong> to begin.</p>`;
    return;
  }
  ENCOUNTER.forEach(inst => row.appendChild(_buildCard(inst)));
}

function _buildCard(inst) {
  const pct  = inst.hp_max > 0 ? Math.max(0, Math.min(100, (inst.hp / inst.hp_max) * 100)) : 0;
  const card = document.createElement('div');
  card.className = `encounter-card${inst.uid === SELECTED_UID ? ' selected' : ''}${inst.hp <= 0 ? ' dead' : ''}`;
  card.dataset.uid = inst.uid;
  card.innerHTML = `
    <button class="encounter-card-remove" title="Remove from encounter">✕</button>
    <div class="encounter-card-name">${escHtml(inst.label)}</div>
    <div class="encounter-card-sub">${escHtml(inst.template.subtitle || '')}</div>
    <div class="enc-hp-wrap"><div class="enc-hp-bar" style="width:${pct}%"></div></div>
    <div class="enc-hp-edit">
      <input type="number" class="enc-hp-input field-input" value="${inst.hp}"
             min="0" max="${inst.hp_max}" title="Current HP — edit directly">
      <span class="enc-hp-max">/ ${inst.hp_max}</span>
    </div>
    ${inst.helm_max  > 0 ? `<div class="enc-dur-text">🪖 ${inst.helm}/${inst.helm_max}</div>`  : ''}
    ${inst.armor_max > 0 ? `<div class="enc-dur-text">🛡 ${inst.armor}/${inst.armor_max}</div>` : ''}
    <div class="enc-card-tracker">${_pipsHtml(inst.tracker)}</div>`;
  return card;
}

// -----------------------------------------------
// RENDER — DETAIL PANEL
// -----------------------------------------------
function renderDetail() {
  const panel = document.getElementById('encounter-detail');
  const inst = ENCOUNTER.find(e => e.uid === SELECTED_UID);
  if (!inst) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.style.display = '';
  panel.innerHTML = '';
  panel.appendChild(_buildDetail(inst));
}

function _buildDetail(inst) {
  const t  = inst.template;
  const cs = t.core_stats || {};
  const f  = document.createDocumentFragment();

  // ---- Name + damage controls ----
  const hdr = document.createElement('div');
  hdr.className = 'enc-detail-hdr';
  hdr.innerHTML = `
    <div class="enc-detail-title">
      <span class="enc-detail-name">${escHtml(inst.label)}</span>
      <span class="enc-detail-sub">${escHtml(t.subtitle || '')}</span>
    </div>
    <div class="enc-dmg-row">
      <input type="number" id="enc-amt" class="field-input enc-amt-input" placeholder="Amount" min="0">
      <div class="enc-dmg-type-row" id="enc-dmg-type-row">
        <button class="enc-dmg-type active" data-dmg-type="standard"  title="Absorbed by armor first; overflow to HP">Standard</button>
        <button class="enc-dmg-type"        data-dmg-type="piercing"  title="½ directly to HP, ½ to armor">Piercing</button>
        <button class="enc-dmg-type"        data-dmg-type="blunt"     title="2× to armor, no HP overflow">Blunt</button>
        <button class="enc-dmg-type"        data-dmg-type="energy"    title="Bypasses armor — directly to HP">Energy</button>
        <button class="enc-dmg-type"        data-dmg-type="shred"     title="Armor consumed at 2× rate per HP blocked">Shred</button>
      </div>
      <button class="btn btn-danger"    id="enc-dmg-btn">− Damage</button>
      <button class="btn btn-secondary" id="enc-heal-btn">＋ Heal</button>
    </div>`;
  f.appendChild(hdr);

  // Damage type toggle
  hdr.querySelectorAll('[data-dmg-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      hdr.querySelectorAll('[data-dmg-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  function _activeDmgType() {
    return (hdr.querySelector('[data-dmg-type].active') || {}).dataset?.dmgType || 'standard';
  }

  // Apply damage through armor per rulebook damage-type rules
  function _applyDamage(inst, amt, type) {
    if (amt <= 0) return;
    if (type === 'energy') {
      // Bypasses armor entirely — straight to HP
      inst.hp = Math.max(0, inst.hp - amt);
      return;
    }
    if (type === 'blunt') {
      // 2× effective vs. armor; no overflow to HP
      let remaining = amt * 2;
      if (inst.armor > 0) { const ab = Math.min(inst.armor, remaining); inst.armor -= ab; remaining -= ab; }
      if (remaining > 0 && inst.helm > 0) { const ab = Math.min(inst.helm, remaining); inst.helm -= ab; }
      // No overflow to HP for blunt
      return;
    }
    if (type === 'piercing') {
      // Half directly to HP (round up), half to armor
      const toHP    = Math.ceil(amt / 2);
      const toArmor = Math.floor(amt / 2);
      inst.hp = Math.max(0, inst.hp - toHP);
      let rem = toArmor;
      if (rem > 0 && inst.armor > 0) { const ab = Math.min(inst.armor, rem); inst.armor -= ab; rem -= ab; }
      if (rem > 0 && inst.helm  > 0) { inst.helm = Math.max(0, inst.helm - rem); }
      return;
    }
    if (type === 'shred') {
      // Armor consumed at 2× rate per HP it absorbs — effectively halves armor's protection value
      let remaining = amt;
      if (remaining > 0 && inst.armor > 0) {
        const eff = Math.floor(inst.armor / 2);
        const ab  = Math.min(eff, remaining);
        inst.armor = Math.max(0, inst.armor - ab * 2);
        remaining -= ab;
      }
      if (remaining > 0 && inst.helm > 0) {
        const eff = Math.floor(inst.helm / 2);
        const ab  = Math.min(eff, remaining);
        inst.helm = Math.max(0, inst.helm - ab * 2);
        remaining -= ab;
      }
      if (remaining > 0) inst.hp = Math.max(0, inst.hp - remaining);
      return;
    }
    // Standard: absorbed by armor first, overflow to HP
    let remaining = amt;
    if (remaining > 0 && inst.armor > 0) { const ab = Math.min(inst.armor, remaining); inst.armor -= ab; remaining -= ab; }
    if (remaining > 0 && inst.helm  > 0) { const ab = Math.min(inst.helm,  remaining); inst.helm  -= ab; remaining -= ab; }
    if (remaining > 0) inst.hp = Math.max(0, inst.hp - remaining);
  }

  hdr.querySelector('#enc-dmg-btn').addEventListener('click', () => {
    const amt  = Math.max(0, parseInt(document.getElementById('enc-amt').value) || 0);
    const type = _activeDmgType();
    _applyDamage(inst, amt, type);
    _syncCard(inst);
    renderDetail();
  });
  hdr.querySelector('#enc-heal-btn').addEventListener('click', () => {
    const amt = Math.max(0, parseInt(document.getElementById('enc-amt').value) || 0);
    inst.hp = Math.min(inst.hp_max, inst.hp + amt);
    _syncCard(inst);
    renderDetail();
  });

  // ---- Turn tracker (full version — mirrors card pips) ----
  const trackerWrap = document.createElement('div');
  trackerWrap.className = 'enc-detail-tracker';
  const trackerBar = document.createElement('div');
  trackerBar.className = 'turn-tracker enc-detail-tracker-bar';
  _buildDetailTrackerBar(trackerBar, inst);
  trackerWrap.appendChild(trackerBar);
  f.appendChild(trackerWrap);

  // ---- Core stats with roll buttons ----
  const statsRow = document.createElement('div');
  statsRow.className = 'encounter-stats-row';
  [
    { label: 'STR',      val: cs.strength        ?? 0,  roll: true  },
    { label: 'AGI',      val: cs.agility         ?? 0,  roll: true  },
    { label: 'FOR',      val: cs.fortitude       ?? 0,  roll: true  },
    { label: 'WIL',      val: cs.willpower       ?? 0,  roll: true  },
    { label: 'SIZE',     val: cs.size            ?? 1,  roll: false },
    { label: 'INJURY',   val: t.injury_threshold ?? 10, roll: false },
    { label: 'SPD',      val: t.speed            ?? 0,  roll: false },
    { label: 'INIT',     val: t.initiative       ?? 0,  roll: false },
    { label: 'MORALE',   val: t.morale           ?? 0,  roll: false },
    { label: 'RECOVERY', val: t.recovery_val     ?? 0,  roll: false }
  ].forEach(({ label, val, roll }) => {
    const chip = document.createElement('div');
    chip.className = 'combat-stat-chip';
    chip.innerHTML = `
      <span class="combat-stat-chip-label">${label}</span>
      <span class="combat-stat-chip-value${roll ? ' enc-stat-rollable' : ''}">
        ${val}${roll
          ? `<button class="ability-roll-btn enc-stat-roll-btn" title="2d10 + ${val} (${label} Test)">🎲</button>`
          : ''}
      </span>`;
    if (roll) {
      chip.querySelector('.enc-stat-roll-btn').addEventListener('click', () => {
        window.Roll20Bridge.sendToRoll20({
          label:         `${inst.label} — ${label} Test`,
          formula:       buildTestFormula(val),
          characterName: inst.label
        });
      });
    }
    statsRow.appendChild(chip);
  });

  // Initiative also gets its own roll chip (1d10 not 2d10)
  const initMod    = t.initiative || 0;
  const initFormula = initMod > 0 ? `1d10 + ${initMod}` : initMod < 0 ? `1d10 - ${Math.abs(initMod)}` : '1d10';
  const initChip = document.createElement('div');
  initChip.className = 'combat-stat-chip';
  initChip.innerHTML = `
    <span class="combat-stat-chip-label">INITIATIVE</span>
    <span class="combat-stat-chip-value enc-stat-rollable">
      ${initMod}
      <button class="ability-roll-btn enc-stat-roll-btn" title="${initFormula}">🎲</button>
    </span>`;
  initChip.querySelector('.enc-stat-roll-btn').addEventListener('click', () => {
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula: initFormula, characterName: inst.label });
  });
  statsRow.appendChild(initChip);
  f.appendChild(statsRow);

  // ---- Durability trackers (editable inputs) ----
  if (inst.helm_max > 0 || inst.armor_max > 0) {
    const durRow = document.createElement('div');
    durRow.className = 'encounter-stats-row';
    if (inst.helm_max > 0) {
      const chip = document.createElement('div');
      chip.className = 'combat-stat-chip';
      chip.innerHTML = `<span class="combat-stat-chip-label">🪖 Helm Dur.</span>
        <span class="combat-stat-chip-value">
          <input type="number" id="enc-helm-inp" class="field-input" style="width:48px"
            value="${inst.helm}" min="0" max="${inst.helm_max}">/${inst.helm_max}
        </span>`;
      durRow.appendChild(chip);
    }
    if (inst.armor_max > 0) {
      const chip = document.createElement('div');
      chip.className = 'combat-stat-chip';
      chip.innerHTML = `<span class="combat-stat-chip-label">🛡 Armor Dur.</span>
        <span class="combat-stat-chip-value">
          <input type="number" id="enc-armor-inp" class="field-input" style="width:48px"
            value="${inst.armor}" min="0" max="${inst.armor_max}">/${inst.armor_max}
        </span>`;
      durRow.appendChild(chip);
    }
    f.appendChild(durRow);
    durRow.querySelector('#enc-helm-inp')?.addEventListener('change', e => {
      inst.helm = Math.max(0, Math.min(inst.helm_max, parseInt(e.target.value) || 0));
      _syncCard(inst);
    });
    durRow.querySelector('#enc-armor-inp')?.addEventListener('change', e => {
      inst.armor = Math.max(0, Math.min(inst.armor_max, parseInt(e.target.value) || 0));
      _syncCard(inst);
    });
  }

  // ---- Skills (clickable — roll 2d10 + total) ----
  if ((t.skills || []).length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header mt-md';
    h.textContent = 'Skills';
    f.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'encounter-skills-grid';
    t.skills.forEach(sk => {
      const chip = document.createElement('div');
      chip.className = 'encounter-skill-chip enc-rollable';
      chip.title = `Click to roll ${sk.label}: ${buildTestFormula(sk.total)}`;
      chip.innerHTML = `${escHtml(sk.label)} <strong>+${sk.total}</strong> 🎲`;
      chip.addEventListener('click', () => {
        window.Roll20Bridge.sendToRoll20({
          label:         `${inst.label} — ${sk.label}`,
          formula:       buildTestFormula(sk.total),
          characterName: inst.label
        });
      });
      grid.appendChild(chip);
    });
    f.appendChild(grid);
  }

  // ---- Gear notes ----
  if ((t.gear_notes || []).length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header mt-md';
    h.textContent = 'Gear (Random Tables)';
    f.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'enc-gear-notes';
    t.gear_notes.forEach(note => { const li = document.createElement('li'); li.textContent = note; ul.appendChild(li); });
    f.appendChild(ul);
  }

  // ---- Action groups (collapsible) ----
  (t.action_groups || []).forEach(group => {
    const collapsed = inst.collapsedGroups.has(group.label);
    const tagsStr   = (group.tags || []).length > 0 ? ` (${group.tags.join(', ')})` : '';

    const wrap = document.createElement('div');
    wrap.className = 'enc-action-group';

    const grpHdr = document.createElement('div');
    grpHdr.className = 'enc-group-hdr section-header mt-md';
    grpHdr.innerHTML = `
      <button class="enc-collapse-btn" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '▶' : '▼'}</button>
      ${escHtml(group.label)}<span class="enc-group-tags">${escHtml(tagsStr)}</span>`;
    wrap.appendChild(grpHdr);

    const body = document.createElement('div');
    body.style.display = collapsed ? 'none' : '';
    (group.actions || []).forEach(action => body.appendChild(_buildActionRow(action, inst)));
    wrap.appendChild(body);

    grpHdr.querySelector('.enc-collapse-btn').addEventListener('click', e => {
      e.stopPropagation();
      if (inst.collapsedGroups.has(group.label)) inst.collapsedGroups.delete(group.label);
      else inst.collapsedGroups.add(group.label);
      renderDetail();
    });

    f.appendChild(wrap);
  });

  return f;
}

// Build (or rebuild) the tracker bar inside the detail panel without re-rendering the full detail
function _buildDetailTrackerBar(bar, inst) {
  bar.innerHTML = '';
  [
    { key: 'actions',  label: 'Actions',  max: 2 },
    { key: 'quick',    label: 'Quick',    max: 1 },
    { key: 'reaction', label: 'Reaction', max: 1 }
  ].forEach(g => {
    const grp = document.createElement('span');
    grp.className = 'turn-tracker-group';
    grp.innerHTML = `<span class="turn-tracker-label">${g.label}</span>`;
    for (let i = 0; i < g.max; i++) {
      const pip = document.createElement('button');
      pip.className = 'turn-pip' + (inst.tracker[g.key] > i ? ' used' : '');
      pip.title = `${g.label} — click to toggle`;
      pip.addEventListener('click', () => {
        inst.tracker[g.key] = inst.tracker[g.key] > i ? i : i + 1;
        _buildDetailTrackerBar(bar, inst);
        // Sync the card's tracker too
        const cardEl = document.querySelector(`.encounter-card[data-uid="${inst.uid}"] .enc-card-tracker`);
        if (cardEl) cardEl.innerHTML = _pipsHtml(inst.tracker);
      });
      grp.appendChild(pip);
    }
    bar.appendChild(grp);
  });

  const newTurnBtn = document.createElement('button');
  newTurnBtn.className = 'btn btn-secondary';
  newTurnBtn.textContent = '↻ New Turn';
  newTurnBtn.title = 'Reset this enemy\'s action pips';
  newTurnBtn.addEventListener('click', () => {
    inst.tracker = { actions: 0, quick: 0, reaction: 0 };
    _buildDetailTrackerBar(bar, inst);
    const cardEl = document.querySelector(`.encounter-card[data-uid="${inst.uid}"] .enc-card-tracker`);
    if (cardEl) cardEl.innerHTML = _pipsHtml(inst.tracker);
  });
  bar.appendChild(newTurnBtn);
}

// -----------------------------------------------
// ACTION ROW
// -----------------------------------------------
function _buildActionRow(action, inst) {
  const cs   = inst.template.core_stats || {};
  const rolls = action.rolls || [];

  // Compute attack formula hint from the first test roll
  const testRoll = rolls.find(r => r.kind === 'test');
  let formulaHint = '';
  if (testRoll) {
    const val = testRoll.stat === 'best_str_agi'
      ? Math.max(cs.strength ?? 0, cs.agility ?? 0)
      : (cs[testRoll.stat] ?? 0);
    formulaHint = buildTestFormula(val);
  }

  const metaParts = [action.cost || ''];
  if (action.range && action.range !== '-') metaParts.push(`Range ${action.range}`);
  if (action.area) metaParts.push(`Area ${action.area}`);

  const row = document.createElement('div');
  row.className = 'enemy-action-row';
  row.innerHTML = `
    <div class="enemy-action-info">
      <span class="enemy-action-label">${escHtml(action.label)}</span>
      <span class="enemy-action-meta">${escHtml(metaParts.filter(Boolean).join(' | '))}${formulaHint ? ` · <em class="enc-formula-hint">${formulaHint}</em>` : ''}</span>
      ${action.notes ? `<span class="enemy-action-notes">${escHtml(action.notes)}</span>` : ''}
    </div>
    <div class="enemy-action-btns"></div>`;

  const btns = row.querySelector('.enemy-action-btns');

  if (rolls.length === 0) {
    const btn = document.createElement('button');
    btn.className = 'ability-roll-btn';
    btn.textContent = '📣 Announce';
    btn.addEventListener('click', () => {
      window.Roll20Bridge.sendAnnouncement({ label: `uses ${action.label}`, characterName: inst.label });
    });
    btns.appendChild(btn);
  } else {
    rolls.forEach(r => {
      const btn = document.createElement('button');
      btn.className = 'ability-roll-btn';
      btn.textContent = `🎲 ${r.label}`;
      if (r.kind === 'test' && r.stat === 'best_str_agi') btn.title = '2d10 + higher of STR/AGI';
      btn.addEventListener('click', () => {
        const label = `${inst.label} — ${action.label}: ${r.label}`;
        if (r.kind === 'dice') {
          window.Roll20Bridge.sendToRoll20({ label, formula: r.formula, characterName: inst.label });
          return;
        }
        const val = r.stat === 'best_str_agi'
          ? Math.max(cs.strength ?? 0, cs.agility ?? 0)
          : (cs[r.stat] ?? 0);
        window.Roll20Bridge.sendToRoll20({ label, formula: buildTestFormula(val), characterName: inst.label });
      });
      btns.appendChild(btn);
    });
  }

  return row;
}

// -----------------------------------------------
// ENEMY PICKER MODAL
// -----------------------------------------------
function openPicker() {
  if (ENEMY_TEMPLATES.length === 0) {
    alert('No enemy templates available.\nPublish enemies from Config Admin, or verify config/enemies.json exists.');
    return;
  }
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-title">Add Enemy to Encounter</div>
      <div class="enemy-picker-list">
        ${ENEMY_TEMPLATES.map(t => `
          <button class="enemy-picker-btn" data-id="${escHtml(t.id)}">
            <strong>${escHtml(t.name)}</strong>
            <span class="enemy-picker-sub">${escHtml(t.subtitle || '')}</span>
          </button>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" data-cancel>Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('[data-cancel]').addEventListener('click', () => backdrop.remove());
  backdrop.querySelectorAll('[data-id]').forEach(btn => {
    btn.addEventListener('click', () => { addToEncounter(btn.dataset.id); backdrop.remove(); });
  });
}
