// =============================================
// ROLL20 BRIDGE
// Sends roll results to Roll20 chat via:
//   Layer 1 — Beyond20 extension event (if installed)
//   Layer 2 — Clipboard fallback with toast
// =============================================

(function () {
  'use strict';

  let _beyond20Available = false;
  let _beyond20Checked   = false;

  // -----------------------------------------------
  // Detection: listen for Beyond20's presence signal
  // Beyond20 injects a small script that fires a
  // custom event "Beyond20_Loaded" on the document.
  // -----------------------------------------------
  document.addEventListener('Beyond20_Loaded', () => {
    _beyond20Available = true;
    _beyond20Checked   = true;
    console.log('[Roll20Bridge] Beyond20 detected ✓');
  });

  // Also set a flag if the extension sends the
  // standard Beyond20 handshake on DOMContentLoaded
  window.addEventListener('DOMContentLoaded', () => {
    // Give Beyond20 1 second to inject its signal
    setTimeout(() => { _beyond20Checked = true; }, 1000);
  });

  /**
   * Main entry point.
   * Call this when the user clicks any roll button.
   *
   * rollData shape:
   * {
   *   characterName: "Aldric Stonebrow",
   *   label:         "Longsword Attack",   // e.g. roll type label
   *   type:          "attack",             // "attack"|"damage"|"skill"|"save"|"initiative"
   *   formula:       "1d20 + 5",           // raw formula (pre-evaluated)
   *   total:         18,
   *   rolls:         [{label:"1d20", results:[13], subtotal:13}, {label:"+5", ...}],
   *   breakdown:     "(13) +5",
   *   critStatus:    null | "crit_hit" | "crit_fail",
   *   damageType:    "slashing"            // optional, for damage rolls
   * }
   */
  function sendToRoll20(rollData) {
    if (_beyond20Available) {
      _sendViaBeyond20(rollData);
      showRollToast('🎲 Sent to Roll20!', 'success');
    } else {
      _sendViaClipboard(rollData);
    }
  }

  // -----------------------------------------------
  // Layer 1: Beyond20 custom event dispatch
  // Beyond20 listens on the document for a
  // "Beyond20_SendMessage" CustomEvent whose detail
  // is a one-element array containing a request
  // object. See: https://beyond20.here-for-more.info/api
  // -----------------------------------------------
  function _sendViaBeyond20(rollData) {
    document.dispatchEvent(new CustomEvent('Beyond20_SendMessage', {
      bubbles: true,
      detail: [_buildBeyond20Request(rollData)]
    }));
  }

  /**
   * Build a Beyond20 "custom" roll request.
   * We use type "custom" for every roll category (attack,
   * damage, skill, save, initiative, hit dice) instead of
   * Beyond20's structured per-category types, because those
   * require many D&D-Beyond-specific fields this sheet doesn't
   * track. "custom" just needs a formula + label, and Roll20
   * rolls the formula itself — it does not echo back the
   * number our own roll modal already displayed.
   */
  function _buildBeyond20Request(rollData) {
    const request = {
      action:    'roll',
      type:      'custom',
      character: {
        name:   rollData.characterName || 'Unknown',
        source: 'Character Vault',
        type:   'Custom',
        url:    location.href
      },
      roll: rollData.formula,
      name: rollData.label || 'Roll'
    };

    if (rollData.damageType) {
      request.description = `Damage type: ${rollData.damageType}`;
    }

    return request;
  }

  // -----------------------------------------------
  // Layer 2: Clipboard fallback
  // Formats roll as a Roll20 /roll command and
  // copies to clipboard, then prompts user to paste.
  // -----------------------------------------------
  function _sendViaClipboard(rollData) {
    const chatText = _formatRoll20Chat(rollData);
    _copyToClipboard(chatText).then((ok) => {
      if (ok) {
        showRollToast('📋 Roll copied! Paste into Roll20 chat (Ctrl+V)', 'info');
      } else {
        showRollToast('⚠️ Could not copy — install Beyond20 for auto-send', 'warn');
      }
    });
  }

  /**
   * Build a Roll20 inline-roll chat string.
   * Example output:
   *   **Aldric — Longsword Attack**: [[1d20+5]] = 18
   */
  function _formatRoll20Chat(rollData) {
    // Build a simplified formula for Roll20's inline roll syntax
    const cleanFormula = rollData.formula
      .replace(/\s+/g, '')        // remove spaces for compact syntax
      .replace(/−/g, '-');        // normalise minus sign

    let out = `/roll ${cleanFormula}`;

    // Prepend character + label as a whisper-style header
    const header = `${rollData.characterName || 'Character'} — ${rollData.label || 'Roll'}`;
    out = `/desc ${header}\n${out}`;

    if (rollData.damageType) {
      out += `\n/desc Damage type: ${rollData.damageType}`;
    }

    return out;
  }

  /**
   * Write text to the system clipboard.
   * Returns a Promise<boolean> indicating success.
   */
  async function _copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for http:// or older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------
  // Toast notifications
  // -----------------------------------------------
  function showRollToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = { success: '✅', info: '🎲', warn: '⚠️' };
    toast.innerHTML = `
      <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('show'));
    });

    // Auto-dismiss
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // Expose public API
  window.Roll20Bridge = { sendToRoll20, showRollToast, isAvailable: () => _beyond20Available };
})();
