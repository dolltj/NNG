// =============================================
// CONFIG ADMIN — builder UI for custom weapons,
// attachments, and perks. Reads/writes via
// WeaponStore (weapon-store.js). Self-contained:
// does not depend on app.js, dice.js, or
// roll20-bridge.js.
// =============================================

'use strict';

let BASE_WEAPON_CONFIG = null;
let BASE_PERK_CONFIG = null;

window.addEventListener('DOMContentLoaded', async () => {
  const resp = await fetch('config/weapons.json');
  if (!resp.ok) throw new Error(`Failed to load config/weapons.json: ${resp.status}`);
  BASE_WEAPON_CONFIG = await resp.json();

  const perkResp = await fetch('config/perks.json');
  if (!perkResp.ok) throw new Error(`Failed to load config/perks.json: ${perkResp.status}`);
  BASE_PERK_CONFIG = await perkResp.json();

  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('new-perk-btn').addEventListener('click', () => renderPerkForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
});

function getAllWeapons() {
  return WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).weapons;
}

function getAllAttachments() {
  return WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).attachments;
}

function getAllPerks() {
  return WeaponStore.getPerksMergedConfig(BASE_PERK_CONFIG);
}

function exportCustomItems() {
  const data = WeaponStore.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'custom-config-export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function slugify(str) {
  return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function uniqueId(baseId, existingIds) {
  let id = baseId;
  let n = 2;
  while (existingIds.includes(id)) {
    id = `${baseId}_${n}`;
    n++;
  }
  return id;
}

function buildActionRowForm(action = {}) {
  const row = document.createElement('div');
  row.className = 'admin-action-row';

  const type = action.is_reload ? 'reload'
    : action.burst_fire ? 'burst'
    : (action.area_of_effect != null || action.save_dv != null) ? 'area'
    : 'normal';

  row.innerHTML = `
    <div class="admin-action-row-fields">
      <input class="field-input" placeholder="Action label" data-f="label" value="${escHtml(action.label || '')}" style="flex:2">
      <select class="field-input" data-f="type" style="flex:1">
        <option value="normal" ${type === 'normal' ? 'selected' : ''}>Normal</option>
        <option value="burst" ${type === 'burst' ? 'selected' : ''}>Burst Fire</option>
        <option value="area" ${type === 'area' ? 'selected' : ''}>Area Effect</option>
        <option value="reload" ${type === 'reload' ? 'selected' : ''}>Reload</option>
      </select>
      <button class="delete-item-btn" data-remove title="Remove action">✕</button>
    </div>
    <div class="admin-action-row-fields" data-non-reload>
      <input class="field-input" placeholder="Range" type="number" data-f="range" value="${action.range ?? ''}" style="flex:1">
      <input class="field-input" placeholder="Damage (e.g. 2d6)" data-f="damage" value="${escHtml(action.damage || '')}" style="flex:1">
      <input class="field-input" placeholder="Damage type (optional)" data-f="damage_type" value="${escHtml(action.damage_type || '')}" style="flex:1">
      <input class="field-input" placeholder="Ammo cost (optional)" type="number" data-f="ammo_cost" value="${action.ammo_cost ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-type-fields="burst">
      <input class="field-input" placeholder="Attack count" type="number" data-f="attack_count" value="${action.attack_count ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-type-fields="area">
      <input class="field-input" placeholder="Area of effect" type="number" data-f="area_of_effect" value="${action.area_of_effect ?? ''}" style="flex:1">
      <input class="field-input" placeholder="Save DV" type="number" data-f="save_dv" value="${action.save_dv ?? ''}" style="flex:1">
    </div>
  `;

  function updateVisibility() {
    const t = row.querySelector('[data-f="type"]').value;
    row.querySelector('[data-non-reload]').style.display = t === 'reload' ? 'none' : '';
    row.querySelectorAll('[data-type-fields]').forEach(el => {
      el.style.display = (el.dataset.typeFields === t) ? '' : 'none';
    });
  }
  row.querySelector('[data-f="type"]').addEventListener('change', updateVisibility);
  updateVisibility();

  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());

  row.readAction = function () {
    const get = sel => row.querySelector(`[data-f="${sel}"]`);
    const t = get('type').value;
    const label = get('label').value.trim();
    if (t === 'reload') {
      return { id: slugify(label), label, is_reload: true };
    }
    const a = {
      id: slugify(label),
      label,
      range: parseInt(get('range').value) || 0,
      damage: get('damage').value.trim() || '1d4'
    };
    if (get('damage_type').value.trim()) a.damage_type = get('damage_type').value.trim();
    const ammoCost = parseInt(get('ammo_cost').value);
    if (ammoCost) a.ammo_cost = ammoCost;
    if (t === 'burst') {
      a.burst_fire = true;
      a.attack_count = parseInt(get('attack_count').value) || 1;
    } else if (t === 'area') {
      a.area_of_effect = parseInt(get('area_of_effect').value) || 0;
      a.save_dv = parseInt(get('save_dv').value) || 0;
    }
    return a;
  };

  return row;
}

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

function renderWeaponForm(existingWeapon) {
  const container = document.getElementById('weapon-form-container');
  container.innerHTML = '';

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="w-label" value="${escHtml(existingWeapon?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Category</label>
        <input class="field-input" id="w-category" value="${escHtml(existingWeapon?.category || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Tags (comma-separated)</label>
        <input class="field-input" id="w-tags" value="${escHtml((existingWeapon?.tags || []).join(', '))}">
      </div>
      <div class="field-group">
        <label class="field-label">Magazine Size (blank = no magazine)</label>
        <input class="field-input" id="w-magsize" type="number" value="${existingWeapon?.magazine_size ?? ''}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Description</label>
      <textarea class="field-input" id="w-description">${escHtml(existingWeapon?.description || '')}</textarea>
    </div>
    <div class="section-header mt-md">Actions</div>
    <div id="w-actions-list"></div>
    <button class="btn btn-secondary mt-sm" id="w-add-action-btn">＋ Add Action</button>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="w-save-btn">Save Weapon</button>
      <button class="btn btn-secondary" id="w-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  const actionsList = document.getElementById('w-actions-list');
  (existingWeapon?.actions || []).forEach(a => actionsList.appendChild(buildActionRowForm(a)));

  document.getElementById('w-add-action-btn').addEventListener('click', () => {
    actionsList.appendChild(buildActionRowForm());
  });

  document.getElementById('w-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('w-save-btn').addEventListener('click', () => {
    const label = document.getElementById('w-label').value.trim();
    if (!label) { alert('Label is required.'); return; }

    const actionRows = Array.from(actionsList.children);
    if (actionRows.length === 0) { alert('At least one action is required.'); return; }
    const actions = actionRows.map(row => row.readAction());

    const officialIds = (BASE_WEAPON_CONFIG.weapons || []).map(w => w.id);
    const customIds = WeaponStore.getCustomWeapons().map(w => w.id).filter(id => id !== existingWeapon?.id);
    // Reusing existingWeapon.id here is what turns "Edit" on an Official row
    // into an override (see getMergedConfig/_mergeList in weapon-store.js) —
    // there's no separate "create override" action, this line IS it.
    const id = existingWeapon?.id || uniqueId(slugify(label), [...officialIds, ...customIds]);

    const tags = document.getElementById('w-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    const magSizeRaw = document.getElementById('w-magsize').value;
    const magazine_size = magSizeRaw.trim() === '' ? null : (parseInt(magSizeRaw) || null);

    WeaponStore.saveCustomWeapon({
      id,
      label,
      category: document.getElementById('w-category').value.trim(),
      tags,
      description: document.getElementById('w-description').value.trim(),
      magazine_size,
      actions
    });

    container.innerHTML = '';
    renderWeaponsList();
  });
}

const EFFECT_TYPE_FIELDS = {
  set_magazine_size: ['value', 'weapon'],
  add_tag: ['tag'],
  remove_tag: ['tag'],
  action_hit_bonus: ['action', 'value'],
  action_save_dv_bonus: ['action', 'value'],
  remove_burst_disadvantage: []
};

function buildEffectRowForm(effect = {}, allWeapons) {
  const row = document.createElement('div');
  row.className = 'admin-action-row';
  const type = effect.type || 'add_tag';

  const weaponOptions = allWeapons.map(w =>
    `<option value="${w.id}" ${effect.weapon === w.id ? 'selected' : ''}>${escHtml(w.label)}</option>`
  ).join('');

  row.innerHTML = `
    <div class="admin-action-row-fields">
      <select class="field-input" data-f="type" style="flex:2">
        ${Object.keys(EFFECT_TYPE_FIELDS).map(t =>
          `<option value="${t}" ${type === t ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`
        ).join('')}
      </select>
      <button class="delete-item-btn" data-remove title="Remove effect">✕</button>
    </div>
    <div class="admin-action-row-fields" data-fields="value">
      <input class="field-input" placeholder="Value" type="number" data-f="value" value="${effect.value ?? ''}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="tag">
      <input class="field-input" placeholder="Tag name" data-f="tag" value="${escHtml(effect.tag || '')}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="action">
      <input class="field-input" placeholder="Action id (e.g. single_shot)" data-f="action" value="${escHtml(effect.action || '')}" style="flex:1">
    </div>
    <div class="admin-action-row-fields" data-fields="weapon">
      <select class="field-input" data-f="weapon" style="flex:1">
        <option value="">(applies to any compatible weapon)</option>
        ${weaponOptions}
      </select>
    </div>
  `;

  function updateVisibility() {
    const t = row.querySelector('[data-f="type"]').value;
    const shownFields = EFFECT_TYPE_FIELDS[t] || [];
    row.querySelectorAll('[data-fields]').forEach(el => {
      el.style.display = shownFields.includes(el.dataset.fields) ? '' : 'none';
    });
  }
  row.querySelector('[data-f="type"]').addEventListener('change', updateVisibility);
  updateVisibility();
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());

  row.readEffect = function () {
    const t = row.querySelector('[data-f="type"]').value;
    const eff = { type: t };
    const fields = EFFECT_TYPE_FIELDS[t] || [];
    if (fields.includes('value')) eff.value = parseInt(row.querySelector('[data-f="value"]').value) || 0;
    if (fields.includes('tag')) eff.tag = row.querySelector('[data-f="tag"]').value.trim();
    if (fields.includes('action')) eff.action = row.querySelector('[data-f="action"]').value.trim();
    if (fields.includes('weapon')) {
      const w = row.querySelector('[data-f="weapon"]').value;
      if (w) eff.weapon = w;
    }
    return eff;
  };

  return row;
}

function buildNoteRowForm(note = '') {
  const row = document.createElement('div');
  row.className = 'admin-action-row-fields';
  row.innerHTML = `
    <input class="field-input" placeholder="Note text" data-note value="${escHtml(note)}" style="flex:1">
    <button class="delete-item-btn" data-remove title="Remove note">✕</button>
  `;
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  row.readNote = function () { return row.querySelector('[data-note]').value.trim(); };
  return row;
}

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

function renderAttachmentForm(existingAttachment) {
  const container = document.getElementById('attachment-form-container');
  container.innerHTML = '';

  const allWeapons = getAllWeapons();

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="a-label" value="${escHtml(existingAttachment?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Category</label>
        <input class="field-input" id="a-category" value="${escHtml(existingAttachment?.category || '')}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Description</label>
      <textarea class="field-input" id="a-description">${escHtml(existingAttachment?.description || '')}</textarea>
    </div>
    <div class="section-header mt-md">Compatible Weapons</div>
    <select class="field-input" id="a-compatible" multiple size="6">
      ${allWeapons.map(w =>
        `<option value="${w.id}" ${(existingAttachment?.compatible_weapons || []).includes(w.id) ? 'selected' : ''}>${escHtml(w.label)}</option>`
      ).join('')}
    </select>
    <div class="section-header mt-md">Effects</div>
    <div id="a-effects-list"></div>
    <button class="btn btn-secondary mt-sm" id="a-add-effect-btn">＋ Add Effect</button>
    <div class="section-header mt-md">Notes</div>
    <div id="a-notes-list"></div>
    <button class="btn btn-secondary mt-sm" id="a-add-note-btn">＋ Add Note</button>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="a-save-btn">Save Attachment</button>
      <button class="btn btn-secondary" id="a-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  const effectsList = document.getElementById('a-effects-list');
  (existingAttachment?.effects || []).forEach(e => effectsList.appendChild(buildEffectRowForm(e, allWeapons)));
  document.getElementById('a-add-effect-btn').addEventListener('click', () => {
    effectsList.appendChild(buildEffectRowForm({}, allWeapons));
  });

  const notesList = document.getElementById('a-notes-list');
  (existingAttachment?.notes || []).forEach(n => notesList.appendChild(buildNoteRowForm(n)));
  document.getElementById('a-add-note-btn').addEventListener('click', () => {
    notesList.appendChild(buildNoteRowForm());
  });

  document.getElementById('a-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('a-save-btn').addEventListener('click', () => {
    const label = document.getElementById('a-label').value.trim();
    if (!label) { alert('Label is required.'); return; }

    const officialIds = (BASE_WEAPON_CONFIG.attachments || []).map(a => a.id);
    const customIds = WeaponStore.getCustomAttachments().map(a => a.id).filter(id => id !== existingAttachment?.id);
    // Reusing existingAttachment.id here is what turns "Edit" on an Official
    // row into an override (see getMergedConfig/_mergeList in
    // weapon-store.js) — there's no separate "create override" action,
    // this line IS it.
    const id = existingAttachment?.id || uniqueId(slugify(label), [...officialIds, ...customIds]);

    const compatible_weapons = Array.from(document.getElementById('a-compatible').selectedOptions).map(o => o.value);
    const effects = Array.from(effectsList.children).map(row => row.readEffect());
    const notes = Array.from(notesList.children).map(row => row.readNote()).filter(Boolean);

    WeaponStore.saveCustomAttachment({
      id,
      label,
      category: document.getElementById('a-category').value.trim(),
      compatible_weapons,
      description: document.getElementById('a-description').value.trim(),
      effects,
      notes
    });

    container.innerHTML = '';
    renderAttachmentsList();
  });
}

function renderPerksList() {
  const wrap = document.getElementById('perks-list');
  wrap.innerHTML = '';
  const perks = getAllPerks();
  if (perks.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  perks.forEach(perk => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    const badge = perk._overridden
      ? '<span class="admin-item-badge badge-edited">Edited</span>'
      : perk._custom
        ? ''
        : '<span class="admin-item-badge badge-official">Official</span>';
    const canDelete = perk._overridden || perk._custom;
    const deleteBtnHtml = canDelete
      ? `<button class="delete-item-btn" data-delete title="${perk._overridden ? 'Revert to official version' : 'Delete'}">✕</button>`
      : '';
    row.innerHTML = `
      <span class="admin-item-label">${perk._custom ? '🔧 ' : ''}${escHtml(perk.name)}</span>
      ${badge}
      <span class="admin-item-meta">Lv ${perk.level}</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      ${deleteBtnHtml}
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderPerkForm(perk));
    const deleteBtn = row.querySelector('[data-delete]');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        const msg = perk._overridden
          ? `Revert "${perk.name}" to its official version?`
          : `Delete custom perk "${perk.name}"?`;
        if (!confirm(msg)) return;
        WeaponStore.deleteCustomPerk(perk.id);
        renderPerksList();
      });
    }
    wrap.appendChild(row);
  });
}

function renderPerkForm(existingPerk) {
  const container = document.getElementById('perk-form-container');
  container.innerHTML = '';

  const actionType = existingPerk?.action?.type || 'none';

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" id="p-name" value="${escHtml(existingPerk?.name || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Level</label>
        <input class="field-input" id="p-level" type="number" min="1" max="99" value="${existingPerk?.level ?? 1}">
      </div>
    </div>
    <div class="field-group">
      <label class="field-label">Prerequisite</label>
      <input class="field-input" id="p-prerequisite" value="${escHtml(existingPerk?.prerequisite || '')}">
    </div>
    <div class="field-group">
      <label class="field-label">Effect</label>
      <textarea class="field-input" id="p-effect">${escHtml(existingPerk?.effect || '')}</textarea>
    </div>
    <div class="section-header mt-md">Granted Action (optional)</div>
    <div class="field-group">
      <label class="field-label">Type</label>
      <select class="field-input" id="p-action-type">
        <option value="none" ${actionType === 'none' ? 'selected' : ''}>None</option>
        <option value="Action" ${actionType === 'Action' ? 'selected' : ''}>Action</option>
        <option value="Reaction" ${actionType === 'Reaction' ? 'selected' : ''}>Reaction</option>
        <option value="Quick Action" ${actionType === 'Quick Action' ? 'selected' : ''}>Quick Action</option>
      </select>
    </div>
    <div id="p-action-fields">
      <div class="field-group">
        <label class="field-label">Label</label>
        <input class="field-input" id="p-action-label" value="${escHtml(existingPerk?.action?.label || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Description</label>
        <textarea class="field-input" id="p-action-text">${escHtml(existingPerk?.action?.text || '')}</textarea>
      </div>
    </div>
    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="p-save-btn">Save Perk</button>
      <button class="btn btn-secondary" id="p-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  function updateActionVisibility() {
    const show = document.getElementById('p-action-type').value !== 'none';
    document.getElementById('p-action-fields').style.display = show ? '' : 'none';
  }
  document.getElementById('p-action-type').addEventListener('change', updateActionVisibility);
  updateActionVisibility();

  document.getElementById('p-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('p-save-btn').addEventListener('click', () => {
    const name = document.getElementById('p-name').value.trim();
    if (!name) { alert('Name is required.'); return; }

    const officialIds = (BASE_PERK_CONFIG || []).map(p => p.id);
    const customIds = WeaponStore.getCustomPerks().map(p => p.id).filter(id => id !== existingPerk?.id);
    // Reusing existingPerk.id here is what turns "Edit" on an Official row
    // into an override (see getPerksMergedConfig in weapon-store.js) —
    // there's no separate "create override" action, this line IS it.
    const id = existingPerk?.id || uniqueId(slugify(name), [...officialIds, ...customIds]);

    const type = document.getElementById('p-action-type').value;
    const action = type === 'none' ? null : {
      type,
      label: document.getElementById('p-action-label').value.trim(),
      text: document.getElementById('p-action-text').value.trim()
    };

    WeaponStore.saveCustomPerk({
      id,
      name,
      level: parseInt(document.getElementById('p-level').value) || 1,
      prerequisite: document.getElementById('p-prerequisite').value.trim(),
      effect: document.getElementById('p-effect').value.trim(),
      action
    });

    container.innerHTML = '';
    renderPerksList();
  });
}
