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

  if (typeof window !== 'undefined') window.escHtml = escHtml;
  if (typeof module !== 'undefined') module.exports = { escHtml };
})();
