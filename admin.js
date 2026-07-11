// =============================================
// CONFIG ADMIN — builder UI for custom weapons,
// attachments, and perks. Reads/writes via
// WeaponStore (weapon-store.js). Self-contained:
// does not depend on app.js, dice.js, or
// roll20-bridge.js.
// =============================================

'use strict';

let BASE_WEAPON_CONFIG = null;
let BASE_PERK_CONFIG   = null;
let BASE_ENEMY_CONFIG  = null;
let NNG_CONFIG         = null;

// The CDN SDK may be unreachable (offline, blockers). Local drafting works
// without it; only sign-in/publish need it, and they alert if it's missing.
const sb = (typeof supabase !== 'undefined')
  ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

window.addEventListener('DOMContentLoaded', async () => {
  [BASE_WEAPON_CONFIG, BASE_PERK_CONFIG, BASE_ENEMY_CONFIG, NNG_CONFIG] = await Promise.all([
    window.RemoteConfig.loadConfigWithFallback('weapons', 'config/weapons.json'),
    window.RemoteConfig.loadConfigWithFallback('perks',   'config/perks.json'),
    window.RemoteConfig.loadConfigWithFallback('enemies', 'config/enemies.json'),
    window.RemoteConfig.loadConfigWithFallback('nng',     'config/nng.json')
  ]);

  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();
  renderEnemiesList();

  document.getElementById('new-weapon-btn').addEventListener('click', () => renderWeaponForm(null));
  document.getElementById('new-attachment-btn').addEventListener('click', () => renderAttachmentForm(null));
  document.getElementById('new-perk-btn').addEventListener('click', () => renderPerkForm(null));
  document.getElementById('new-enemy-btn').addEventListener('click', () => renderEnemyForm(null));
  document.getElementById('export-btn').addEventListener('click', exportCustomItems);
  document.getElementById('sign-in-btn').addEventListener('click', signIn);
  document.getElementById('publish-btn').addEventListener('click', publishConfigs);

  // supabase-js persists sessions in localStorage — restore silently.
  if (sb) {
    const { data: { session } } = await sb.auth.getSession();
    if (session) showSignedIn(session.user.email);
  }
});

// Filtered merge (tombstoned items excluded) — used by forms so deleted
// weapons aren't offered as attachment targets. The list renderers fetch
// their own includeDeleted merges to show Restore rows.
function getAllWeapons() {
  return WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).weapons;
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

function showSignedIn(email) {
  document.getElementById('auth-email').style.display = 'none';
  document.getElementById('auth-password').style.display = 'none';
  const btn = document.getElementById('sign-in-btn');
  btn.textContent = email;
  btn.disabled = true;
  document.getElementById('publish-btn').style.display = '';
}

async function signIn() {
  if (!sb) { alert('Supabase SDK failed to load — check your connection and reload.'); return; }
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { alert(`Sign-in failed: ${error.message}`); return; }
  showSignedIn(data.user.email);
}

async function publishConfigs() {
  if (!sb) { alert('Supabase SDK failed to load — check your connection and reload.'); return; }
  if (!confirm('Publish the current weapons, perks, and enemies as the official config for all players?')) return;

  const stripFlags = list => list.map(({ _custom, _overridden, _deleted, ...item }) => item);
  const merged = WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG);
  const weaponsData = { weapons: stripFlags(merged.weapons), attachments: stripFlags(merged.attachments) };
  const perksData = stripFlags(WeaponStore.getPerksMergedConfig(BASE_PERK_CONFIG));
  const enemiesData = stripFlags(WeaponStore.getEnemiesMergedConfig(BASE_ENEMY_CONFIG));

  const now = new Date().toISOString();
  const { error } = await sb.from('configs').upsert([
    { key: 'weapons', data: weaponsData, updated_at: now },
    { key: 'perks',   data: perksData,   updated_at: now },
    { key: 'enemies', data: enemiesData,  updated_at: now }
  ]);
  if (error) { alert(`Publish failed: ${error.message}`); return; }

  WeaponStore.clearAllCustom();
  BASE_WEAPON_CONFIG = weaponsData;
  BASE_PERK_CONFIG = perksData;
  BASE_ENEMY_CONFIG = enemiesData;
  renderWeaponsList();
  renderAttachmentsList();
  renderPerksList();
  renderEnemiesList();
  alert('Published. Players and the Encounter Tracker get the update next load.');
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
  // Existing actions keep their id even when relabeled — attachment effects
  // (action_hit_bonus / action_save_dv_bonus) target actions by id.
  const existingId = action.id || null;

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
      return { id: existingId || slugify(label), label, is_reload: true };
    }
    const a = {
      id: existingId || slugify(label),
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

// Shared row builder for the three dictionary lists. spec:
//   name         display name
//   kindLabel    'weapon' | 'attachment' | 'perk' (confirm messages)
//   kind         'weapons' | 'attachments' | 'perks' (tombstone key)
//   meta         right-hand meta text (trusted, computed)
//   deleteDraft  store fn removing the custom/override entry
//   onEdit, rerender
//   deleteWarning consequence line shown when deleting an official entry
function buildAdminRow(item, spec) {
  const row = document.createElement('div');
  row.className = 'admin-item-row' + (item._deleted ? ' admin-item-deleted' : '');

  if (item._deleted) {
    row.innerHTML = `
      <span class="admin-item-label">${escHtml(spec.name)}</span>
      <span class="admin-item-badge badge-edited">Deleted — removed for everyone on Publish</span>
      <button class="btn btn-secondary" data-restore>Restore</button>
    `;
    row.querySelector('[data-restore]').addEventListener('click', () => {
      WeaponStore.restoreDeleted(spec.kind, item.id);
      spec.rerender();
    });
    return row;
  }

  const badge = item._overridden
    ? '<span class="admin-item-badge badge-edited">Edited</span>'
    : item._custom
      ? ''
      : '<span class="admin-item-badge badge-official">Official</span>';
  row.innerHTML = `
    <span class="admin-item-label">${item._custom ? '🔧 ' : ''}${escHtml(spec.name)}</span>
    ${badge}
    <span class="admin-item-meta">${spec.meta}</span>
    <button class="btn btn-secondary" data-edit>Edit</button>
    ${item._overridden ? '<button class="btn btn-secondary" data-revert>↩ Revert</button>' : ''}
    <button class="delete-item-btn" data-delete title="Delete">✕</button>
  `;
  row.querySelector('[data-edit]').addEventListener('click', spec.onEdit);

  const revertBtn = row.querySelector('[data-revert]');
  if (revertBtn) revertBtn.addEventListener('click', () => {
    if (!confirm(`Revert "${spec.name}" to its official version?`)) return;
    spec.deleteDraft(item.id);
    spec.rerender();
  });

  row.querySelector('[data-delete]').addEventListener('click', () => {
    if (item._custom) {
      if (!confirm(`Delete custom ${spec.kindLabel} "${spec.name}"?`)) return;
      spec.deleteDraft(item.id);
    } else {
      if (!confirm(`Delete ${spec.kindLabel} "${spec.name}" from the dictionary?\n\nIt is removed for everyone when you Publish (you can Restore until then). ${spec.deleteWarning}`)) return;
      if (item._overridden) spec.deleteDraft(item.id); // the override goes with it
      WeaponStore.markDeleted(spec.kind, item.id);
    }
    spec.rerender();
  });

  return row;
}

function renderWeaponsList() {
  const wrap = document.getElementById('weapons-list');
  wrap.innerHTML = '';
  const weapons = WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG, { includeDeleted: true }).weapons;
  if (weapons.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  weapons.forEach(weapon => {
    wrap.appendChild(buildAdminRow(weapon, {
      name: weapon.label,
      kindLabel: 'weapon',
      kind: 'weapons',
      meta: `${(weapon.actions || []).length} action${(weapon.actions || []).length === 1 ? '' : 's'}`,
      deleteDraft: WeaponStore.deleteCustomWeapon,
      onEdit: () => renderWeaponForm(weapon),
      rerender: renderWeaponsList,
      deleteWarning: 'Characters that carry this weapon will lose it from their sheets.'
    }));
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
    const seen = new Set();
    for (const a of actions) {
      if (seen.has(a.id)) {
        alert(`Two actions resolve to the same id ("${a.id}") — give them different labels.`);
        return;
      }
      seen.add(a.id);
    }

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
  const attachments = WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG, { includeDeleted: true }).attachments;
  if (attachments.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  attachments.forEach(att => {
    wrap.appendChild(buildAdminRow(att, {
      name: att.label,
      kindLabel: 'attachment',
      kind: 'attachments',
      meta: `${(att.compatible_weapons || []).length} compatible weapon(s)`,
      deleteDraft: WeaponStore.deleteCustomAttachment,
      onEdit: () => renderAttachmentForm(att),
      rerender: renderAttachmentsList,
      deleteWarning: 'Weapons that have it attached will lose its effects.'
    }));
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
  const perks = WeaponStore.getPerksMergedConfig(BASE_PERK_CONFIG, { includeDeleted: true });
  if (perks.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  perks.forEach(perk => {
    wrap.appendChild(buildAdminRow(perk, {
      name: perk.name,
      kindLabel: 'perk',
      kind: 'perks',
      meta: `Lv ${perk.level}`,
      deleteDraft: WeaponStore.deleteCustomPerk,
      onEdit: () => renderPerkForm(perk),
      rerender: renderPerksList,
      deleteWarning: 'Perks already on character sheets are copies and keep working; this only removes it from the dictionary.'
    }));
  });
}

// Stat targets a perk modifier can adjust — must match the targets the
// sheet applies in dice.js (applyPerkModifiers call sites) and app.js
// (speed chip, initiative roll).
const MODIFIER_TARGETS = [
  { id: 'max_hp',            label: 'Max HP' },
  { id: 'injury_threshold',  label: 'Injury Threshold' },
  { id: 'recovery',          label: 'Recovery' },
  { id: 'carrying_capacity', label: 'Carrying Capacity' },
  { id: 'speed',             label: 'Speed' },
  { id: 'initiative',        label: 'Initiative' }
];

function buildModifierRowForm(mod = {}) {
  const row = document.createElement('div');
  row.className = 'admin-action-row-fields';
  row.innerHTML = `
    <select class="field-input" data-m="target" style="flex:2">
      ${MODIFIER_TARGETS.map(t => `<option value="${t.id}" ${mod.target === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}
    </select>
    <select class="field-input" data-m="type" style="flex:1">
      <option value="add" ${mod.type !== 'pct' ? 'selected' : ''}>+ flat</option>
      <option value="pct" ${mod.type === 'pct' ? 'selected' : ''}>% increase (round up)</option>
    </select>
    <input class="field-input" placeholder="Value" type="number" data-m="value" value="${mod.value ?? ''}" style="flex:1">
    <button class="delete-item-btn" data-remove title="Remove modifier">✕</button>
  `;
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  row.readModifier = function () {
    return {
      target: row.querySelector('[data-m="target"]').value,
      type: row.querySelector('[data-m="type"]').value,
      value: parseInt(row.querySelector('[data-m="value"]').value) || 0
    };
  };
  return row;
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
    <div class="section-header mt-md">Stat Modifiers (optional)</div>
    <p class="campaign-note">Automatic adjustments to calculated stats (e.g. Tough as Nails: Injury Threshold +25%).</p>
    <div id="p-modifiers-list"></div>
    <button class="btn btn-secondary mt-sm" id="p-add-modifier-btn">＋ Add Modifier</button>
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

  const modifiersList = document.getElementById('p-modifiers-list');
  (existingPerk?.modifiers || []).forEach(m => modifiersList.appendChild(buildModifierRowForm(m)));
  document.getElementById('p-add-modifier-btn').addEventListener('click', () => {
    modifiersList.appendChild(buildModifierRowForm());
  });

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

    const modifiers = Array.from(modifiersList.children)
      .map(row => row.readModifier())
      .filter(m => m.value !== 0);

    WeaponStore.saveCustomPerk({
      id,
      name,
      level: parseInt(document.getElementById('p-level').value) || 1,
      prerequisite: document.getElementById('p-prerequisite').value.trim(),
      effect: document.getElementById('p-effect').value.trim(),
      action,
      ...(modifiers.length ? { modifiers } : {})
    });

    container.innerHTML = '';
    renderPerksList();
  });
}

// -----------------------------------------------
// ENEMIES / BAD GUYS
// -----------------------------------------------
function renderEnemiesList() {
  const wrap = document.getElementById('enemies-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const enemies = WeaponStore.getEnemiesMergedConfig(BASE_ENEMY_CONFIG, { includeDeleted: true });
  if (enemies.length === 0) {
    wrap.innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
    return;
  }
  enemies.forEach(enemy => {
    wrap.appendChild(buildAdminRow(enemy, {
      name: enemy.name,
      kindLabel: 'enemy',
      kind: 'enemies',
      meta: `${escHtml(enemy.subtitle || '')} · ${(enemy.action_groups || []).length} gear group(s)`,
      deleteDraft: WeaponStore.deleteCustomEnemy,
      onEdit: () => renderEnemyForm(enemy),
      rerender: renderEnemiesList,
      deleteWarning: 'The template will be removed from the Encounter Tracker on next Publish.'
    }));
  });
}

// ---- skill dropdown row ----
function buildEnemySkillRowForm(skill = {}) {
  const skillDefs = (NNG_CONFIG?.skills || []);
  const options   = skillDefs.map(s =>
    `<option value="${escHtml(s.id)}"${skill.id === s.id || skill.label === s.label ? ' selected' : ''}>${escHtml(s.label)}</option>`
  ).join('');

  const row = document.createElement('div');
  row.className = 'admin-action-row-fields';
  row.innerHTML = `
    <select class="field-input" data-s="id" style="flex:3">
      <option value="">— Select Skill —</option>
      ${options}
    </select>
    <input class="field-input" placeholder="Ranks" type="number" data-s="ranks" value="${skill.ranks ?? 0}" style="flex:1;min-width:60px">
    <input class="field-input" placeholder="Bonus" type="number" data-s="bonus" value="${skill.bonus ?? 0}" style="flex:1;min-width:60px">
    <button class="delete-item-btn" data-remove title="Remove skill">✕</button>
  `;
  // If the existing skill was saved before IDs existed, match by label fallback
  if (!skill.id && skill.label) {
    const match = skillDefs.find(s => s.label === skill.label);
    if (match) row.querySelector('[data-s="id"]').value = match.id;
  }
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  row.readSkill = function () {
    const id    = row.querySelector('[data-s="id"]').value;
    const def   = skillDefs.find(s => s.id === id);
    const label = def?.label || id;
    const ranks = parseInt(row.querySelector('[data-s="ranks"]').value) || 0;
    const bonus = parseInt(row.querySelector('[data-s="bonus"]').value) || 0;
    return { id, label, ranks, bonus, total: ranks + bonus };
  };
  return row;
}

// ---- catalog weapon → action_group conversion ----
function _weaponToActionGroup(weapon) {
  const isFinesse = (weapon.tags || []).includes('finesse');
  const isMelee   = (weapon.category || '').toLowerCase().includes('melee');
  const attackStat = isFinesse ? 'best_str_agi' : isMelee ? 'strength' : 'agility';
  return {
    label: weapon.label,
    tags:  weapon.tags || [],
    actions: (weapon.actions || []).map(a => ({
      label:  a.label,
      cost:   '1 Action',
      range:  String(a.range ?? '1'),
      notes:  a.damage_type ? `Damage type: ${a.damage_type}` : '',
      rolls: [
        { label: 'Attack', kind: 'test', stat: attackStat },
        ...(a.damage ? [{ label: `${a.damage} Damage`, kind: 'dice', formula: a.damage }] : [])
      ]
    }))
  };
}

// ---- custom attack row (one attack = one action_group with one action) ----
const ATTACK_COSTS  = ['1 Action', 'Quick Action', 'Reaction', 'Free Action', 'Full Turn'];
const ATTACK_STATS  = ['strength', 'agility', 'fortitude', 'willpower', 'best_str_agi', 'none'];
const ATTACK_STAT_LABELS = { strength:'STR', agility:'AGI', fortitude:'FOR', willpower:'WIL', best_str_agi:'Best STR/AGI', none:'No roll' };

function buildCustomAttackRow(attack = {}) {
  const costOpts  = ATTACK_COSTS.map(c => `<option${attack.cost  === c ? ' selected' : ''}>${c}</option>`).join('');
  const statOpts  = ATTACK_STATS.map(s => `<option value="${s}"${(attack.stat || 'strength') === s ? ' selected' : ''}>${ATTACK_STAT_LABELS[s]}</option>`).join('');

  const row = document.createElement('div');
  row.className = 'en-attack-row';
  row.innerHTML = `
    <div class="en-attack-row-main">
      <input class="field-input" placeholder="Attack name (e.g. Slam)" data-a="label"
        value="${escHtml(attack.label || '')}" style="flex:3;min-width:120px">
      <select class="field-input" data-a="cost" style="flex:2;min-width:110px">${costOpts}</select>
      <input class="field-input" placeholder="Range" data-a="range"
        value="${escHtml(attack.range || '1')}" style="flex:1;min-width:60px">
      <button class="delete-item-btn" data-remove title="Remove attack">✕</button>
    </div>
    <div class="en-attack-row-sub">
      <label class="field-label" style="min-width:90px">Attack stat</label>
      <select class="field-input" data-a="stat" style="flex:2">${statOpts}</select>
      <input class="field-input" placeholder="Damage (e.g. 3d6)" data-a="damage"
        value="${escHtml(attack.damage || '')}" style="flex:2">
      <input class="field-input" placeholder="Tags (comma-sep)" data-a="tags"
        value="${escHtml((attack.tags || []).join(', '))}" style="flex:2">
      <input class="field-input" placeholder="Notes" data-a="notes"
        value="${escHtml(attack.notes || '')}" style="flex:3">
    </div>
  `;
  row.querySelector('[data-remove]').addEventListener('click', () => row.remove());
  row.readAttack = function () {
    const label  = row.querySelector('[data-a="label"]').value.trim();
    const cost   = row.querySelector('[data-a="cost"]').value;
    const range  = row.querySelector('[data-a="range"]').value.trim() || '1';
    const stat   = row.querySelector('[data-a="stat"]').value;
    const damage = row.querySelector('[data-a="damage"]').value.trim();
    const tags   = row.querySelector('[data-a="tags"]').value.split(',').map(s => s.trim()).filter(Boolean);
    const notes  = row.querySelector('[data-a="notes"]').value.trim();
    const rolls  = [];
    if (stat !== 'none') rolls.push({ label: 'Attack', kind: 'test', stat });
    if (damage)          rolls.push({ label: `${damage} Damage`, kind: 'dice', formula: damage });
    return { label, cost, range, stat, damage, tags, notes, rolls };
  };
  return row;
}

// Helper: reconstruct the flat attack shape from an action_group that was
// originally built by buildCustomAttackRow (label === group label, 1 action).
function _actionGroupToAttack(group) {
  const action = group.actions?.[0] || {};
  const testRoll   = action.rolls?.find(r => r.kind === 'test');
  const damageRoll = action.rolls?.find(r => r.kind === 'dice');
  return {
    label:  group.label,
    cost:   action.cost || '1 Action',
    range:  action.range || '1',
    stat:   testRoll?.stat || 'strength',
    damage: damageRoll?.formula || '',
    tags:   group.tags || [],
    notes:  action.notes || ''
  };
}

// ---- weapon gear picker card ----
function _buildGearCard(weapon, onRemove) {
  const card = document.createElement('div');
  card.className = 'en-gear-card';
  card.dataset.weaponId = weapon.id;
  card.innerHTML = `
    <span class="en-gear-card-name">${escHtml(weapon.label)}</span>
    <span class="en-gear-card-tags">${escHtml((weapon.tags || []).join(', '))}</span>
    <button class="delete-item-btn" title="Remove">✕</button>
  `;
  card.querySelector('.delete-item-btn').addEventListener('click', onRemove);
  return card;
}

// ---- main form ----
function renderEnemyForm(existingEnemy) {
  const container = document.getElementById('enemy-form-container');
  container.innerHTML = '';
  const cs = existingEnemy?.core_stats || {};

  // Determine which existing action_groups came from the weapon catalog vs custom
  const allWeapons = WeaponStore.getMergedConfig(BASE_WEAPON_CONFIG).weapons;
  const weaponById = Object.fromEntries(allWeapons.map(w => [w.id, w]));

  // Existing action_groups split: catalog weapons (matched by label) vs custom attacks
  // A group is treated as a catalog weapon if its label matches a known weapon label.
  const weaponByLabel = Object.fromEntries(allWeapons.map(w => [w.label, w]));
  const existingGroups    = existingEnemy?.action_groups || [];
  const preselectedWeaponIds = [];
  const preExistingCustomAttacks = [];
  existingGroups.forEach(group => {
    const matched = weaponByLabel[group.label];
    if (matched) {
      preselectedWeaponIds.push(matched.id);
    } else {
      preExistingCustomAttacks.push(_actionGroupToAttack(group));
    }
  });

  const gearNotesText = (existingEnemy?.gear_notes || []).join('\n');

  const form = document.createElement('div');
  form.className = 'admin-form';
  form.innerHTML = `
    <div class="char-info-grid">
      <div class="field-group">
        <label class="field-label">Name</label>
        <input class="field-input" id="en-name" value="${escHtml(existingEnemy?.name || '')}">
      </div>
      <div class="field-group">
        <label class="field-label">Subtitle (e.g. Level 1 Raider)</label>
        <input class="field-input" id="en-subtitle" value="${escHtml(existingEnemy?.subtitle || '')}">
      </div>
    </div>
    <div class="section-header mt-md">Core Stats</div>
    <div class="char-info-grid">
      <div class="field-group"><label class="field-label">STR</label>
        <input class="field-input" id="en-str" type="number" value="${cs.strength ?? 0}"></div>
      <div class="field-group"><label class="field-label">AGI</label>
        <input class="field-input" id="en-agi" type="number" value="${cs.agility ?? 0}"></div>
      <div class="field-group"><label class="field-label">FOR</label>
        <input class="field-input" id="en-for" type="number" value="${cs.fortitude ?? 0}"></div>
      <div class="field-group"><label class="field-label">WIL</label>
        <input class="field-input" id="en-wil" type="number" value="${cs.willpower ?? 0}"></div>
      <div class="field-group"><label class="field-label">SIZE</label>
        <input class="field-input" id="en-size" type="number" value="${cs.size ?? 1}"></div>
    </div>
    <div class="section-header mt-md">Derived Stats</div>
    <div class="char-info-grid">
      <div class="field-group"><label class="field-label">HP Max</label>
        <input class="field-input" id="en-hp" type="number" value="${existingEnemy?.hp_max ?? 25}"></div>
      <div class="field-group"><label class="field-label">Injury Threshold</label>
        <input class="field-input" id="en-inj" type="number" value="${existingEnemy?.injury_threshold ?? 10}"></div>
      <div class="field-group"><label class="field-label">Helm Max (0 = none)</label>
        <input class="field-input" id="en-helm" type="number" value="${existingEnemy?.helm_max ?? 0}"></div>
      <div class="field-group"><label class="field-label">Armor Max (0 = none)</label>
        <input class="field-input" id="en-armor" type="number" value="${existingEnemy?.armor_max ?? 0}"></div>
      <div class="field-group"><label class="field-label">Speed</label>
        <input class="field-input" id="en-spd" type="number" value="${existingEnemy?.speed ?? 8}"></div>
      <div class="field-group"><label class="field-label">Initiative</label>
        <input class="field-input" id="en-init" type="number" value="${existingEnemy?.initiative ?? 0}"></div>
      <div class="field-group"><label class="field-label">Morale</label>
        <input class="field-input" id="en-morale" type="number" value="${existingEnemy?.morale ?? 0}"></div>
      <div class="field-group"><label class="field-label">Recovery</label>
        <input class="field-input" id="en-recovery" type="number" value="${existingEnemy?.recovery_val ?? 10}"></div>
    </div>

    <div class="section-header mt-md">Skills</div>
    <div id="en-skills-list"></div>
    <button class="btn btn-secondary mt-sm" id="en-add-skill-btn">＋ Add Skill</button>

    <div class="section-header mt-md">Gear (Weapons from Catalog)</div>
    <div id="en-gear-list"></div>
    <div class="flex gap-sm mt-sm">
      <select class="field-input" id="en-gear-select" style="flex:1">
        <option value="">— Add weapon from catalog —</option>
        ${allWeapons.map(w => `<option value="${escHtml(w.id)}">${escHtml(w.label)} (${escHtml(w.category || '')})</option>`).join('')}
      </select>
      <button class="btn btn-secondary" id="en-add-gear-btn">＋ Add</button>
    </div>

    <div class="section-header mt-md">Custom Attacks</div>
    <p class="campaign-note">Add attack actions not covered by catalog weapons (e.g. Slam, Frag Grenade).</p>
    <div id="en-attacks-list"></div>
    <button class="btn btn-secondary mt-sm" id="en-add-attack-btn">＋ Add Attack</button>

    <div class="section-header mt-md">Gear Notes (freetext — armor tables, ammo, etc.)</div>
    <textarea class="field-input" id="en-gear-notes" rows="4" placeholder="One note per line">${escHtml(gearNotesText)}</textarea>

    <div class="flex gap-sm mt-md">
      <button class="btn btn-primary" id="en-save-btn">Save Enemy</button>
      <button class="btn btn-secondary" id="en-cancel-btn">Cancel</button>
    </div>
  `;
  container.appendChild(form);

  // ---- Skills ----
  const skillsList = document.getElementById('en-skills-list');
  (existingEnemy?.skills || []).forEach(sk => skillsList.appendChild(buildEnemySkillRowForm(sk)));
  document.getElementById('en-add-skill-btn').addEventListener('click', () => {
    skillsList.appendChild(buildEnemySkillRowForm());
  });

  // ---- Gear picker ----
  const gearList = document.getElementById('en-gear-list');

  function addGearCard(weaponId) {
    const weapon = weaponById[weaponId];
    if (!weapon) return;
    const card = _buildGearCard(weapon, () => card.remove());
    gearList.appendChild(card);
  }

  preselectedWeaponIds.forEach(id => addGearCard(id));

  document.getElementById('en-add-gear-btn').addEventListener('click', () => {
    const sel = document.getElementById('en-gear-select');
    if (!sel.value) return;
    // Don't allow duplicates
    if (gearList.querySelector(`[data-weapon-id="${sel.value}"]`)) {
      sel.value = '';
      return;
    }
    addGearCard(sel.value);
    sel.value = '';
  });

  // ---- Custom attacks ----
  const attacksList = document.getElementById('en-attacks-list');
  preExistingCustomAttacks.forEach(a => attacksList.appendChild(buildCustomAttackRow(a)));
  document.getElementById('en-add-attack-btn').addEventListener('click', () => {
    attacksList.appendChild(buildCustomAttackRow());
    attacksList.lastElementChild.querySelector('[data-a="label"]').focus();
  });

  // ---- Cancel / Save ----
  document.getElementById('en-cancel-btn').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('en-save-btn').addEventListener('click', () => {
    const name = document.getElementById('en-name').value.trim();
    if (!name) { alert('Name is required.'); return; }

    // Build action_groups: catalog weapons first, then custom attacks
    const gearWeaponIds = Array.from(gearList.querySelectorAll('[data-weapon-id]'))
      .map(el => el.dataset.weaponId);
    const catalogGroups = gearWeaponIds
      .map(id => weaponById[id])
      .filter(Boolean)
      .map(w => _weaponToActionGroup(w));

    const customAttacks = Array.from(attacksList.children)
      .map(row => row.readAttack())
      .filter(a => a.label);
    const customGroups = customAttacks.map(a => ({
      label:   a.label,
      tags:    a.tags,
      actions: [{
        label:  a.label,
        cost:   a.cost,
        range:  a.range,
        notes:  a.notes,
        rolls:  a.rolls
      }]
    }));

    const action_groups = [...catalogGroups, ...customGroups];

    const officialIds = Array.isArray(BASE_ENEMY_CONFIG) ? BASE_ENEMY_CONFIG.map(e => e.id) : [];
    const customIds   = WeaponStore.getCustomEnemies().map(e => e.id).filter(id => id !== existingEnemy?.id);
    const id          = existingEnemy?.id || uniqueId(slugify(name), [...officialIds, ...customIds]);

    const skills = Array.from(skillsList.children)
      .map(row => row.readSkill())
      .filter(sk => sk.id);

    const gear_notes = document.getElementById('en-gear-notes').value
      .split('\n').map(s => s.trim()).filter(Boolean);

    WeaponStore.saveCustomEnemy({
      id, name,
      subtitle:         document.getElementById('en-subtitle').value.trim(),
      core_stats: {
        strength:  parseInt(document.getElementById('en-str').value)  || 0,
        agility:   parseInt(document.getElementById('en-agi').value)  || 0,
        fortitude: parseInt(document.getElementById('en-for').value)  || 0,
        willpower: parseInt(document.getElementById('en-wil').value)  || 0,
        size:      parseInt(document.getElementById('en-size').value) || 1
      },
      hp_max:           parseInt(document.getElementById('en-hp').value)       || 25,
      injury_threshold: parseInt(document.getElementById('en-inj').value)      || 10,
      helm_max:         parseInt(document.getElementById('en-helm').value)     || 0,
      armor_max:        parseInt(document.getElementById('en-armor').value)    || 0,
      speed:            parseInt(document.getElementById('en-spd').value)      || 0,
      initiative:       parseInt(document.getElementById('en-init').value)     || 0,
      morale:           parseInt(document.getElementById('en-morale').value)   || 0,
      recovery_val:     parseInt(document.getElementById('en-recovery').value) || 0,
      skills, gear_notes, action_groups
    });

    container.innerHTML = '';
    renderEnemiesList();
  });
}
