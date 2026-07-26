// Cliente Supabase + helpers de acceso a datos, compartidos por toda la app.
// SUPABASE_URL/SUPABASE_KEY se sustituyen en el deploy (ver .github/workflows/deploy.yml).
// En local, edita estas dos líneas temporalmente con los valores de tu proyecto de pruebas
// y revierte antes de hacer commit (nunca comites valores reales).

const SUPABASE_URL = '%%SUPABASE_URL%%';
const SUPABASE_KEY = '%%SUPABASE_KEY%%';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchPlayers() {
  const { data, error } = await db.from('players').select('*').order('elo', { ascending: false });
  if (error) throw error;
  return data;
}

async function insertPlayer(name) {
  const { data, error } = await db.from('players').insert({ name, elo: STARTING_ELO }).select().single();
  if (error) throw error;
  return data;
}

async function fetchRecentMatches(limit = 10) {
  const { data, error } = await db
    .from('matches')
    .select('*, team_a_player1_name:players!matches_team_a_player1_fkey(name), team_a_player2_name:players!matches_team_a_player2_fkey(name), team_b_player1_name:players!matches_team_b_player1_fkey(name), team_b_player2_name:players!matches_team_b_player2_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function fetchAllMatchesWithNames() {
  const { data, error } = await db
    .from('matches')
    .select('*, team_a_player1_name:players!matches_team_a_player1_fkey(name), team_a_player2_name:players!matches_team_a_player2_fkey(name), team_b_player1_name:players!matches_team_b_player1_fkey(name), team_b_player2_name:players!matches_team_b_player2_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchAllMatches() {
  const { data, error } = await db.from('matches').select('*').order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function updatePlayer(id, fields) {
  const { error } = await db.from('players').update(fields).eq('id', id);
  if (error) throw error;
}

async function insertMatch(match) {
  const { data, error } = await db.from('matches').insert(match).select().single();
  if (error) throw error;
  return data;
}

async function insertEloHistory(rows) {
  const { error } = await db.from('elo_history').insert(rows);
  if (error) throw error;
}
