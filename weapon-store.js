// =============================================
// WEAPON STORE
// Manages custom (player-authored) weapons and
// attachments in localStorage, and merges them
// with the base config/weapons.json dictionary
// at runtime. Shared between index.html (the
// character sheet) and admin.html (the builder).
// =============================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ttrpg_custom_weapon_config';

  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        weapons: (parsed && Array.isArray(parsed.weapons)) ? parsed.weapons : [],
        attachments: (parsed && Array.isArray(parsed.attachments)) ? parsed.attachments : []
      };
    } catch {
      return { weapons: [], attachments: [] };
    }
  }

  function _save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function getCustomWeapons() {
    return _load().weapons;
  }

  function getCustomAttachments() {
    return _load().attachments;
  }

  function saveCustomWeapon(weapon) {
    const data = _load();
    const idx = data.weapons.findIndex(w => w.id === weapon.id);
    if (idx >= 0) data.weapons[idx] = weapon;
    else data.weapons.push(weapon);
    _save(data);
  }

  function saveCustomAttachment(attachment) {
    const data = _load();
    const idx = data.attachments.findIndex(a => a.id === attachment.id);
    if (idx >= 0) data.attachments[idx] = attachment;
    else data.attachments.push(attachment);
    _save(data);
  }

  function deleteCustomWeapon(id) {
    const data = _load();
    data.weapons = data.weapons.filter(w => w.id !== id);
    _save(data);
  }

  function deleteCustomAttachment(id) {
    const data = _load();
    data.attachments = data.attachments.filter(a => a.id !== id);
    _save(data);
  }

  function _mergeList(officialList, customList) {
    const merged = (officialList || []).map(item => ({ ...item }));
    const newItems = [];
    customList.forEach(item => {
      const idx = merged.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        merged[idx] = { ...item, _overridden: true };
      } else {
        newItems.push({ ...item, _custom: true });
      }
    });
    return [...merged, ...newItems];
  }

  function getMergedConfig(baseConfig) {
    const custom = _load();
    return {
      weapons: _mergeList(baseConfig.weapons, custom.weapons),
      attachments: _mergeList(baseConfig.attachments, custom.attachments)
    };
  }

  function exportAll() {
    return _load();
  }

  window.WeaponStore = {
    getCustomWeapons,
    getCustomAttachments,
    saveCustomWeapon,
    saveCustomAttachment,
    deleteCustomWeapon,
    deleteCustomAttachment,
    getMergedConfig,
    exportAll
  };
})();
