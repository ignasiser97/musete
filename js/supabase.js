// Cliente Supabase + helpers de acceso a datos, compartidos por toda la app.
// SUPABASE_URL/SUPABASE_KEY se sustituyen en el deploy (ver .github/workflows/deploy.yml).
// En local, edita estas dos líneas temporalmente con los valores de tu proyecto de pruebas
// y revierte antes de hacer commit (nunca comites valores reales).

const SUPABASE_URL = '%%SUPABASE_URL%%';
const SUPABASE_KEY = '%%SUPABASE_KEY%%';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Avatar circular compartido por Jugadores/Clasificación/modal de jugador.
// Sin foto: círculo con la inicial del nombre. clickable añade el badge de cámara
// (el listener de click lo añade quien llama, esto solo pone el estilo).
function buildAvatarElement(player, clickable = false) {
  const el = document.createElement('div');
  el.className = 'avatar' + (clickable ? ' avatar-clickable' : '');
  if (player.avatar_url) {
    const img = document.createElement('img');
    img.src = player.avatar_url;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = (player.name || '?').charAt(0).toUpperCase();
  }
  return el;
}

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

async function fetchEloHistoryForPlayer(playerId) {
  const { data, error } = await db
    .from('elo_history')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function fetchEloHistoryForMatch(matchId) {
  const { data, error } = await db.from('elo_history').select('*').eq('match_id', matchId);
  if (error) throw error;
  return data;
}

async function deleteMatch(matchId) {
  const { error } = await db.from('matches').delete().eq('id', matchId);
  if (error) throw error;
}

// Sube (o sustituye) la foto de un jugador en el bucket "avatars" y devuelve su URL
// pública. El nombre de fichero es el propio id del jugador (upsert), así que subir
// una nueva siempre reemplaza a la anterior sin dejar huérfanas. El `?t=` al final
// evita que el navegador siga mostrando la foto vieja cacheada bajo la misma URL.
async function uploadAvatar(playerId, blob) {
  const path = `${playerId}.jpg`;
  const { error } = await db.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data } = db.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}
