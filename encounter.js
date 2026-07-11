// =============================================
// ENCOUNTER TRACKER
// GM-only page: load enemy templates, run live
// encounters with HP / armor tracking and Roll20
// roll buttons. State is ephemeral (in-memory).
// =============================================
'use strict';

let ENEMY_TEMPLATES = [];
let ENCOUNTER       = [];  // active enemy instances
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
  document.getElementById('clear-btn').addEventListener('click', () => {
    if (ENCOUNTER.length === 0 || confirm('Remove all enemies from the encounter?')) {
      ENCOUNTER = [];
      SELECTED_UID = null;
      renderCards();
      renderDetail();
    }
  });

  renderCards();
});

// -----------------------------------------------
// STATE
// -----------------------------------------------
function addToEncounter(templateId) {
  const template = ENEMY_TEMPLATES.find(t => t.id === templateId);
  if (!template) return;
  const uid = `enc_${++_uidSeq}`;
  ENCOUNTER.push({
    uid,
    template_id: templateId,
    label: '',
    hp:         template.hp_max || 0,
    hp_max:     template.hp_max || 0,
    helm:       template.helm_max  || 0,
    helm_max:   template.helm_max  || 0,
    armor:      template.armor_max || 0,
    armor_max:  template.armor_max || 0,
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

  ENCOUNTER.forEach(inst => {
    const hpPct = inst.hp_max > 0 ? Math.max(0, Math.min(100, (inst.hp / inst.hp_max) * 100)) : 0;
    const isDead = inst.hp <= 0;
    const isSelected = inst.uid === SELECTED_UID;

    const card = document.createElement('div');
    card.className = `encounter-card${isSelected ? ' selected' : ''}${isDead ? ' dead' : ''}`;
    card.innerHTML = `
      <button class="encounter-card-remove" title="Remove from encounter">✕</button>
      <div class="encounter-card-name">${escHtml(inst.label)}</div>
      <div class="encounter-card-sub">${escHtml(inst.template.subtitle || '')}</div>
      <div class="enc-hp-wrap"><div class="enc-hp-bar" style="width:${hpPct}%"></div></div>
      <div class="enc-hp-text">HP ${inst.hp} / ${inst.hp_max}</div>
      ${inst.helm_max > 0  ? `<div class="enc-dur-text">🪖 ${inst.helm}/${inst.helm_max}</div>`  : ''}
      ${inst.armor_max > 0 ? `<div class="enc-dur-text">🛡 ${inst.armor}/${inst.armor_max}</div>` : ''}
    `;
    card.querySelector('.encounter-card-remove').addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`Remove ${inst.label} from the encounter?`)) removeFromEncounter(inst.uid);
    });
    card.addEventListener('click', () => {
      SELECTED_UID = inst.uid;
      renderCards();
      renderDetail();
    });
    row.appendChild(card);
  });
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
  panel.appendChild(_buildDetailContent(inst));
}

function _buildDetailContent(inst) {
  const t   = inst.template;
  const cs  = t.core_stats || {};
  const frag = document.createDocumentFragment();

  // ---- Header: name + damage controls ----
  const hdr = document.createElement('div');
  hdr.className = 'enc-detail-hdr';
  hdr.innerHTML = `
    <div class="enc-detail-title">
      <span class="enc-detail-name">${escHtml(inst.label)}</span>
      <span class="enc-detail-sub">${escHtml(t.subtitle || '')}</span>
    </div>
    <div class="enc-dmg-row">
      <input type="number" id="enc-amt" class="field-input enc-amt-input" placeholder="Amount" min="0">
      <button class="btn btn-danger"    id="enc-dmg-btn">− Damage</button>
      <button class="btn btn-secondary" id="enc-heal-btn">＋ Heal</button>
    </div>`;
  frag.appendChild(hdr);
  hdr.querySelector('#enc-dmg-btn').addEventListener('click', () => {
    const amt = Math.max(0, parseInt(document.getElementById('enc-amt').value) || 0);
    inst.hp = Math.max(0, inst.hp - amt);
    renderCards();
    renderDetail();
  });
  hdr.querySelector('#enc-heal-btn').addEventListener('click', () => {
    const amt = Math.max(0, parseInt(document.getElementById('enc-amt').value) || 0);
    inst.hp = Math.min(inst.hp_max, inst.hp + amt);
    renderCards();
    renderDetail();
  });

  // ---- Core stats + derived ----
  const statsRow = document.createElement('div');
  statsRow.className = 'encounter-stats-row';
  [
    ['STR',      cs.strength       ?? 0],
    ['AGI',      cs.agility        ?? 0],
    ['FOR',      cs.fortitude      ?? 0],
    ['WIL',      cs.willpower      ?? 0],
    ['SIZE',     cs.size           ?? 1],
    ['INJURY',   t.injury_threshold ?? 10],
    ['SPD',      t.speed           ?? 0],
    ['INIT',     t.initiative      ?? 0],
    ['MORALE',   t.morale          ?? 0],
    ['RECOVERY', t.recovery_val    ?? 0]
  ].forEach(([label, val]) => {
    const chip = document.createElement('div');
    chip.className = 'combat-stat-chip';
    chip.innerHTML = `<span class="combat-stat-chip-label">${label}</span>
                      <span class="combat-stat-chip-value">${val}</span>`;
    statsRow.appendChild(chip);
  });
  frag.appendChild(statsRow);

  // ---- Durability trackers (editable) ----
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
    frag.appendChild(durRow);
    const helmInp = durRow.querySelector('#enc-helm-inp');
    if (helmInp) helmInp.addEventListener('change', e => {
      inst.helm = Math.max(0, Math.min(inst.helm_max, parseInt(e.target.value) || 0));
      renderCards();
    });
    const armorInp = durRow.querySelector('#enc-armor-inp');
    if (armorInp) armorInp.addEventListener('change', e => {
      inst.armor = Math.max(0, Math.min(inst.armor_max, parseInt(e.target.value) || 0));
      renderCards();
    });
  }

  // ---- Initiative roll ----
  const initMod = t.initiative || 0;
  const initFormula = initMod > 0 ? `1d10 + ${initMod}` : initMod < 0 ? `1d10 - ${Math.abs(initMod)}` : '1d10';
  const initRow = document.createElement('div');
  initRow.className = 'enc-init-row';
  initRow.innerHTML = `<button class="btn btn-secondary">🎲 Roll Initiative (${initFormula})</button>`;
  initRow.querySelector('button').addEventListener('click', () => {
    window.Roll20Bridge.sendToRoll20({ label: 'Initiative', formula: initFormula, characterName: inst.label });
  });
  frag.appendChild(initRow);

  // ---- Skills ----
  if ((t.skills || []).length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header mt-md';
    h.textContent = 'Skills';
    frag.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'encounter-skills-grid';
    t.skills.forEach(sk => {
      const chip = document.createElement('div');
      chip.className = 'encounter-skill-chip';
      chip.textContent = `${sk.label} +${sk.total}`;
      chip.title = `${sk.ranks} ranks, +${sk.bonus} bonus`;
      grid.appendChild(chip);
    });
    frag.appendChild(grid);
  }

  // ---- Gear notes ----
  if ((t.gear_notes || []).length > 0) {
    const h = document.createElement('div');
    h.className = 'section-header mt-md';
    h.textContent = 'Gear (Random Tables)';
    frag.appendChild(h);
    const ul = document.createElement('ul');
    ul.className = 'enc-gear-notes';
    t.gear_notes.forEach(note => {
      const li = document.createElement('li');
      li.textContent = note;
      ul.appendChild(li);
    });
    frag.appendChild(ul);
  }

  // ---- Action groups ----
  (t.action_groups || []).forEach(group => {
    const h = document.createElement('div');
    h.className = 'section-header mt-md';
    const tagsStr = (group.tags || []).length > 0 ? ` (${group.tags.join(', ')})` : '';
    h.innerHTML = `${escHtml(group.label)}<span class="enc-group-tags">${escHtml(tagsStr)}</span>`;
    frag.appendChild(h);

    (group.actions || []).forEach(action => {
      frag.appendChild(_buildActionRow(action, inst));
    });
  });

  return frag;
}

function _buildActionRow(action, inst) {
  const cs = inst.template.core_stats || {};
  const row = document.createElement('div');
  row.className = 'enemy-action-row';

  const metaParts = [action.cost || ''];
  if (action.range && action.range !== '-') metaParts.push(`Range ${action.range}`);
  if (action.area) metaParts.push(`Area ${action.area}`);

  row.innerHTML = `
    <div class="enemy-action-info">
      <span class="enemy-action-label">${escHtml(action.label)}</span>
      <span class="enemy-action-meta">${escHtml(metaParts.filter(Boolean).join(' | '))}</span>
      ${action.notes ? `<span class="enemy-action-notes">${escHtml(action.notes)}</span>` : ''}
    </div>
    <div class="enemy-action-btns"></div>`;

  const btns = row.querySelector('.enemy-action-btns');
  const rolls = action.rolls || [];

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
        const statVal = r.stat === 'best_str_agi'
          ? Math.max(cs.strength ?? 0, cs.agility ?? 0)
          : (cs[r.stat] ?? 0);
        window.Roll20Bridge.sendToRoll20({ label, formula: buildTestFormula(statVal), characterName: inst.label });
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
    alert('No enemy templates available.\nMake sure enemies are defined in Config Admin and published, or that config/enemies.json exists.');
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
