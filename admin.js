// =============================================
// WEAPON ADMIN — builder UI for custom weapons
// and attachments. Reads/writes via WeaponStore
// (weapon-store.js). Self-contained: does not
// depend on app.js, dice.js, or roll20-bridge.js.
// =============================================

'use strict';

let BASE_WEAPON_CONFIG = null;

window.addEventListener('DOMContentLoaded', async () => {
  const resp = await fetch('config/weapons.json');
  if (!resp.ok) throw new Error(`Failed to load config/weapons.json: ${resp.status}`);
  BASE_WEAPON_CONFIG = await resp.json();

  renderCustomWeaponsList();
  renderCustomAttachmentsList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
});

function getAllWeapons() {
  return [...(BASE_WEAPON_CONFIG.weapons || []), ...WeaponStore.getCustomWeapons()];
}

function exportCustomItems() {
  const data = WeaponStore.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'custom-weapons-export.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function renderCustomWeaponsList() {
  const wrap = document.getElementById('custom-weapons-list');
  wrap.innerHTML = '';
  const weapons = WeaponStore.getCustomWeapons();
  if (weapons.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  weapons.forEach(weapon => {
    const row = document.createElement('div');
    row.className = 'admin-item-row';
    row.innerHTML = `
      <span class="admin-item-label">${escHtml(weapon.label)}</span>
      <span class="admin-item-meta">${weapon.actions.length} action${weapon.actions.length === 1 ? '' : 's'}</span>
      <button class="btn btn-secondary" data-edit>Edit</button>
      <button class="delete-item-btn" data-delete title="Delete">✕</button>
    `;
    row.querySelector('[data-edit]').addEventListener('click', () => renderWeaponForm(weapon));
    row.querySelector('[data-delete]').addEventListener('click', () => {
      if (!confirm(`Delete custom weapon "${weapon.label}"?`)) return;
      WeaponStore.deleteCustomWeapon(weapon.id);
      renderCustomWeaponsList();
    });
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
    renderCustomWeaponsList();
  });
}

// Stub — replaced by Task 5 (attachments).
function renderCustomAttachmentsList() {
  document.getElementById('custom-attachments-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderAttachmentForm(_existingAttachment) {}
