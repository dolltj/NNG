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
  const ENEMY_STORAGE_KEY = 'ttrpg_custom_enemies';
  const DELETED_KEY = 'ttrpg_deleted_config_ids';

  // -------- staged deletions (tombstones) --------
  // Deleting an official dictionary entry can't remove it from the base
  // config, so it's recorded here and filtered out of merges until Publish
  // ships a canon without it. kind: 'weapons' | 'attachments' | 'perks'.
  function _loadDeleted() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DELETED_KEY) || 'null') || {};
      return {
        weapons: Array.isArray(parsed.weapons) ? parsed.weapons : [],
        attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
        perks: Array.isArray(parsed.perks) ? parsed.perks : [],
        enemies: Array.isArray(parsed.enemies) ? parsed.enemies : []
      };
    } catch {
      return { weapons: [], attachments: [], perks: [], enemies: [] };
    }
  }

  function getDeletedIds(kind) {
    return _loadDeleted()[kind] || [];
  }

  function markDeleted(kind, id) {
    const d = _loadDeleted();
    if (!d[kind].includes(id)) d[kind].push(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(d));
  }

  function restoreDeleted(kind, id) {
    const d = _loadDeleted();
    d[kind] = d[kind].filter(x => x !== id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(d));
  }

  /** Default: drop tombstoned items. includeDeleted (admin lists): keep
   *  them, marked _deleted, so a Restore action can be offered. */
  function _applyDeleted(list, deletedIds, includeDeleted) {
    if (deletedIds.length === 0) return list;
    return includeDeleted
      ? list.map(item => deletedIds.includes(item.id) ? { ...item, _deleted: true } : item)
      : list.filter(item => !deletedIds.includes(item.id));
  }

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

  function getPerksMergedConfig(basePerks, opts = {}) {
    return _applyDeleted(_mergeList(basePerks, _loadPerks()), getDeletedIds('perks'), !!opts.includeDeleted);
  }

  // -------- enemies --------
  function _loadCustomEnemies() {
    try {
      const raw = localStorage.getItem(ENEMY_STORAGE_KEY);
      const parsed = JSON.parse(raw || 'null');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function _saveCustomEnemies(list) {
    localStorage.setItem(ENEMY_STORAGE_KEY, JSON.stringify(list));
  }

  function getCustomEnemies() { return _loadCustomEnemies(); }

  function saveCustomEnemy(enemy) {
    const list = _loadCustomEnemies();
    const idx = list.findIndex(e => e.id === enemy.id);
    if (idx >= 0) list[idx] = enemy; else list.push(enemy);
    _saveCustomEnemies(list);
  }

  function deleteCustomEnemy(id) {
    _saveCustomEnemies(_loadCustomEnemies().filter(e => e.id !== id));
  }

  function getEnemiesMergedConfig(baseEnemies, opts = {}) {
    const base = Array.isArray(baseEnemies) ? baseEnemies : [];
    const list = _mergeList(base, _loadCustomEnemies());
    return _applyDeleted(list, getDeletedIds('enemies'), !!opts.includeDeleted);
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
    localStorage.removeItem(ENEMY_STORAGE_KEY);
    localStorage.removeItem(DELETED_KEY);
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

  function getMergedConfig(baseConfig, opts = {}) {
    const custom = _load();
    const include = !!opts.includeDeleted;
    const del = _loadDeleted();
    return {
      weapons: _applyDeleted(_mergeList(baseConfig.weapons, custom.weapons), del.weapons, include),
      attachments: _applyDeleted(_mergeList(baseConfig.attachments, custom.attachments), del.attachments, include)
    };
  }

  function exportAll() {
    const wa = _load();
    return { weapons: wa.weapons, attachments: wa.attachments, perks: _loadPerks(), enemies: _loadCustomEnemies() };
  }

  const api = {
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
    getCustomEnemies,
    saveCustomEnemy,
    deleteCustomEnemy,
    getEnemiesMergedConfig,
    exportAll,
    clearAllCustom,
    markDeleted,
    restoreDeleted,
    getDeletedIds
  };
  if (typeof window !== 'undefined') window.WeaponStore = api;
  if (typeof module !== 'undefined') module.exports = api; // node-requirable for tests
})();
