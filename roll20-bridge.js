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
  // Beyond20's content script listens for the
  // "beyond20-roll" CustomEvent on the document.
  // -----------------------------------------------
  function _sendViaBeyond20(rollData) {
    // Build a Beyond20-compatible roll object
    const beyond20Payload = {
      action:    'roll',
      character: rollData.characterName || 'Unknown',
      request: {
        roll:    rollData.formula,
        name:    rollData.label,
        type:    _mapRollType(rollData.type),
        damages: rollData.damageType ? [rollData.damageType] : []
      },
      result: {
        total:      rollData.total,
        parts:      rollData.rolls,
        breakdown:  rollData.breakdown,
        is_critical: rollData.critStatus === 'crit_hit',
        is_fumble:   rollData.critStatus === 'crit_fail'
      }
    };

    document.dispatchEvent(new CustomEvent('beyond20-roll', {
      bubbles: true,
      detail:  beyond20Payload
    }));

    // Also dispatch the older event name for compatibility
    document.dispatchEvent(new CustomEvent('Beyond20_Roll', {
      bubbles: true,
      detail:  beyond20Payload
    }));
  }

  /**
   * Map our internal roll type to a Beyond20 roll type string.
   */
  function _mapRollType(type) {
    const map = {
      attack:     'to-hit',
      damage:     'damage',
      skill:      'skill-check',
      save:       'saving-throw',
      initiative: 'initiative',
      ability:    'ability-check',
      hitdie:     'hit-dice'
    };
    return map[type] || 'roll';
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
