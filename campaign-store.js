// =============================================
// CAMPAIGN STORE
// Auth + campaign/character persistence against
// Supabase, for index.html. Wraps supabase-js
// (CDN); every method throws on error so callers
// surface failures. `available` is false when the
// CDN SDK failed to load — the app then behaves
// exactly like the pre-campaign, local-only sheet.
// =============================================
(function () {
  'use strict';

  const sb = (typeof supabase !== 'undefined')
    ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

  function _need() {
    if (!sb) throw new Error('Supabase SDK not loaded');
    return sb;
  }

  async function getSession() {
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  async function signIn(email, password) {
    const { data, error } = await _need().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  }

  async function signOut() {
    await _need().auth.signOut();
  }

  async function listCampaigns() {
    const { data, error } = await _need().from('campaigns').select('id,name,gm_id').order('created_at');
    if (error) throw error;
    return data;
  }

  async function createCampaign(name) {
    const session = await getSession();
    const { data, error } = await _need().from('campaigns')
      .insert({ name, gm_id: session.user.id }).select().single();
    if (error) throw error;
    return data;
  }

  /** RLS restricts this to the campaign's GM; the FK sets orphaned
   *  characters' campaign_id to null rather than deleting them. */
  async function deleteCampaign(id) {
    const { error } = await _need().from('campaigns').delete().eq('id', id);
    if (error) throw error;
  }

  async function listCharacters() {
    const { data, error } = await _need().from('characters').select('id,campaign_id,owner_id,data');
    if (error) throw error;
    return data;
  }

  async function fetchCharacter(id) {
    const { data, error } = await _need().from('characters')
      .select('id,campaign_id,owner_id,data').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  /** char must carry a _cloud tag; data is stored without it. */
  async function upsertCharacter(char) {
    const { error } = await _need().from('characters').upsert({
      id: char.id,
      campaign_id: char._cloud.campaign_id,
      owner_id: char._cloud.owner_id,
      data: window.stripCloudMeta(char),
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async function deleteCharacter(id) {
    const { error } = await _need().from('characters').delete().eq('id', id);
    if (error) throw error;
  }

  window.CampaignStore = {
    available: !!sb,
    getSession, signIn, signOut,
    listCampaigns, createCampaign, deleteCampaign,
    listCharacters, fetchCharacter, upsertCharacter, deleteCharacter
  };
})();
