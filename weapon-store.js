// =============================================
// WEAPON / PERK STORE
// Manages custom (player-authored) weapons,
// attachments, and perks in localStorage, and
// merges them with the base config/*.json
// dictionaries at runtime. Shared between
// index.html (the character sheet) and
// admin.html (the builder).
// =============================================
(function () {
  'use strict';

  const STORAGE_KEY = 'ttrpg_custom_weapon_config';
  const PERK_STORAGE_KEY = 'ttrpg_custom_perk_config';

  function _loadPerks() {
    try {
      const raw = localStorage.getItem(PERK_STORAGE_KEY);
      const parsed = JSON.parse(raw || 'null');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function _savePerks(perks) {
    localStorage.setItem(PERK_STORAGE_KEY, JSON.stringify(perks));
  }

  function getCustomPerks() {
    return _loadPerks();
  }

  function saveCustomPerk(perk) {
    const perks = _loadPerks();
    const idx = perks.findIndex(p => p.id === perk.id);
    if (idx >= 0) perks[idx] = perk; else perks.push(perk);
    _savePerks(perks);
  }

  function deleteCustomPerk(id) {
    _savePerks(_loadPerks().filter(p => p.id !== id));
  }

  function getPerksMergedConfig(basePerks) {
    return _mergeList(basePerks, _loadPerks());
  }

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

  /** Drop all local drafts — called after a successful publish, when the
   *  drafts have become the canonical config. */
  function clearAllCustom() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERK_STORAGE_KEY);
  }

  // Deep-clones via JSON round-trip (all weapon/attachment data is plain
  // JSON) so the merged result never shares nested array/object references
  // (actions, effects, tags, ...) with baseConfig or the custom store —
  // callers that render a fresh merge on every call (e.g. admin.js) must
  // never accidentally mutate the official/custom source data in place.
  function _deepClone(item) {
    return JSON.parse(JSON.stringify(item));
  }

  function _mergeList(officialList, customList) {
    const merged = (officialList || []).map(_deepClone);
    const newItems = [];
    (customList || []).forEach(item => {
      const idx = merged.findIndex(m => m.id === item.id);
      if (idx >= 0) {
        merged[idx] = { ..._deepClone(item), _overridden: true };
      } else {
        newItems.push({ ..._deepClone(item), _custom: true });
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
    const wa = _load();
    return { weapons: wa.weapons, attachments: wa.attachments, perks: _loadPerks() };
  }

  window.WeaponStore = {
    getCustomWeapons,
    getCustomAttachments,
    saveCustomWeapon,
    saveCustomAttachment,
    deleteCustomWeapon,
    deleteCustomAttachment,
    getMergedConfig,
    getCustomPerks,
    saveCustomPerk,
    deleteCustomPerk,
    getPerksMergedConfig,
    exportAll,
    clearAllCustom
  };
})();
