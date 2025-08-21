// Optional cloud backend config (Supabase).
// If left empty, the game will store scores and player stats only in this browser via localStorage.
// To enable global leaderboard & unique players across all visitors, fill in these values and keep the script tag in index.html.
window.FC_CONFIG = {
  SUPABASE_URL: "", // e.g. "https://xyzcompany.supabase.co"
  SUPABASE_KEY: "", // public anon key
  TABLE_SCORES: "scores",
  TABLE_PLAYERS: "players"
};
