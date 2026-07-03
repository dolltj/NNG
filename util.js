// =============================================
// SHARED UTILITIES
// DOM-free helpers used by index.html, admin.html,
// and roll20-bridge.js. Loaded before every other
// script on both pages; node-requirable for tests.
// =============================================
(function () {
  'use strict';

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Whether userId may edit this character: local characters always,
   * cloud characters only for their owner or the campaign's GM.
   */
  function canEditCharacter(char, userId, campaignsById) {
    if (!char._cloud) return true;
    if (!userId) return false;
    if (char._cloud.owner_id === userId) return true;
    const campaign = (campaignsById || {})[char._cloud.campaign_id];
    return !!(campaign && campaign.gm_id === userId);
  }

  /** Character data as stored/exported — without the runtime _cloud tag. */
  function stripCloudMeta(char) {
    const { _cloud, ...rest } = char;
    return rest;
  }

  if (typeof window !== 'undefined') {
    window.escHtml = escHtml;
    window.canEditCharacter = canEditCharacter;
    window.stripCloudMeta = stripCloudMeta;
  }
  if (typeof module !== 'undefined') module.exports = { escHtml, canEditCharacter, stripCloudMeta };
})();
