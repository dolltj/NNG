// =============================================
// SUPABASE PROJECT CONSTANTS
// The anon key is public by design — it only grants
// what Row-Level Security allows (read configs).
// Writes require a signed-in session (admin page).
// =============================================
// Placeholder must stay a valid-format URL: supabase-js createClient()
// throws on malformed URLs at script load, which would kill admin.html.
window.SUPABASE_URL = 'https://placeholder-project.supabase.co'; // REPLACE with real project URL
window.SUPABASE_ANON_KEY = 'REPLACE_WITH_ANON_KEY';
