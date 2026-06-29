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

// Stubs — replaced by Task 4 (weapons) and Task 5 (attachments).
function renderCustomWeaponsList() {
  document.getElementById('custom-weapons-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderWeaponForm(_existingWeapon) {}
function renderCustomAttachmentsList() {
  document.getElementById('custom-attachments-list').innerHTML = '<p style="color:var(--text-muted)">(none yet)</p>';
}
function renderAttachmentForm(_existingAttachment) {}
