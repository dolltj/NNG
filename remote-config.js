// =============================================
// REMOTE CONFIG
// Reads canonical configs from Supabase via its
// REST API (plain fetch — no SDK needed for reads).
// Falls back to the bundled config/*.json so the
// sheet still opens at the table with no network
// or a Supabase outage.
// =============================================
(function () {
  'use strict';

  async function fetchRemoteConfig(key) {
    const resp = await fetch(
      `${window.SUPABASE_URL}/rest/v1/configs?key=eq.${encodeURIComponent(key)}&select=data`,
      {
        headers: {
          apikey: window.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
        }
      }
    );
    if (!resp.ok) throw new Error(`configs fetch failed: HTTP ${resp.status}`);
    const rows = await resp.json();
    if (!rows.length) throw new Error(`no config row for "${key}"`);
    return rows[0].data;
  }

  async function loadConfigWithFallback(key, bundledUrl) {
    try {
      return await fetchRemoteConfig(key);
    } catch (err) {
      console.warn(`[RemoteConfig] using bundled ${bundledUrl}:`, err.message);
      const resp = await fetch(bundledUrl);
      if (!resp.ok) throw new Error(`Failed to load config: ${bundledUrl}`);
      return resp.json();
    }
  }

  window.RemoteConfig = { fetchRemoteConfig, loadConfigWithFallback };
})();
