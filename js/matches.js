// Pestaña Registrar: formulario para introducir el resultado de una partida.
// También alimenta el feed de "últimas partidas" de la pestaña Inicio.

let PENDING_EDIT_MATCH = null; // datos a preprellenar tras "Editar" en la última partida

// Convierte un Date/ISO string al formato que espera <input type="datetime-local">,
// respetando la hora local (toISOString() por sí solo da UTC).
function toDatetimeLocalValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function loadRegisterTab() {
  await ensurePlayersLoadedForForm();
  populateMatchFormSelects();
  document.getElementById('reg-error').textContent = '';
  document.getElementById('reg-played-at').value = toDatetimeLocalValue(new Date());

  if (PENDING_EDIT_MATCH) {
    document.getElementById('reg-a1').value = PENDING_EDIT_MATCH.a1;
    document.getElementById('reg-a2').value = PENDING_EDIT_MATCH.a2;
    document.getElementById('reg-b1').value = PENDING_EDIT_MATCH.b1;
    document.getElementById('reg-b2').value = PENDING_EDIT_MATCH.b2;
    document.getElementById('reg-score-a').value = PENDING_EDIT_MATCH.scoreA;
    document.getElementById('reg-score-b').value = PENDING_EDIT_MATCH.scoreB;
    document.getElementById('reg-played-at').value = toDatetimeLocalValue(PENDING_EDIT_MATCH.playedAt);
    document.getElementById('reg-error').textContent = 'Corrige el resultado y vuelve a guardarlo.';
    PENDING_EDIT_MATCH = null;
  }
}

async function ensurePlayersLoadedForForm() {
  // Reutiliza PLAYERS si ya está cargado (p.ej. se acaba de visitar Jugadores),
  // si no, lo carga aquí mismo.
  try {
    PLAYERS = await fetchPlayers();
  } catch (e) {
    document.getElementById('reg-error').textContent = 'No se pudo cargar la lista de jugadores.';
  }
}

function populateMatchFormSelects() {
  const selectIds = ['reg-a1', 'reg-a2', 'reg-b1', 'reg-b2'];
  selectIds.forEach(id => {
    const select = document.getElementById(id);
    const current = select.value;
    select.innerHTML = '<option value="">—</option>' +
      PLAYERS.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
    select.value = current;
  });
}

function validateMatchForm(a1, a2, b1, b2, scoreA, scoreB) {
  if (!a1 || !a2 || !b1 || !b2) return 'Selecciona los 4 jugadores.';
  const ids = [a1, a2, b1, b2];
  if (new Set(ids).size !== 4) return 'Un jugador no puede repetirse en la misma partida.';
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return 'Introduce los sets ganados por cada equipo.';
  if (scoreA < 0 || scoreB < 0) return 'Los sets ganados no pueden ser negativos.';
  if (scoreA === scoreB) return 'El mus no tiene empates: los sets ganados deben ser distintos.';
  return null;
}

function sameTeam(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

// Compara contra la última partida registrada (mismos 4 jugadores, sin importar
// en qué equipo, y mismo marcador). Pensada para pillar el caso de que dos personas
// registren el mismo resultado casi a la vez sin saberlo — no bloquea, solo avisa.
function isDuplicateOfLast(lastMatch, a1, a2, b1, b2, scoreA, scoreB) {
  if (!lastMatch) return false;
  const newA = [a1, a2], newB = [b1, b2];
  const lastA = [lastMatch.team_a_player1, lastMatch.team_a_player2];
  const lastB = [lastMatch.team_b_player1, lastMatch.team_b_player2];

  const sameOrientation = sameTeam(newA, lastA) && sameTeam(newB, lastB)
    && scoreA === lastMatch.score_a && scoreB === lastMatch.score_b;
  const swappedOrientation = sameTeam(newA, lastB) && sameTeam(newB, lastA)
    && scoreA === lastMatch.score_b && scoreB === lastMatch.score_a;

  return sameOrientation || swappedOrientation;
}

async function handleSubmitMatch(event) {
  event.preventDefault();
  const errorEl = document.getElementById('reg-error');
  errorEl.textContent = '';

  const a1 = document.getElementById('reg-a1').value;
  const a2 = document.getElementById('reg-a2').value;
  const b1 = document.getElementById('reg-b1').value;
  const b2 = document.getElementById('reg-b2').value;
  const scoreA = parseInt(document.getElementById('reg-score-a').value, 10);
  const scoreB = parseInt(document.getElementById('reg-score-b').value, 10);
  const playedAtInput = document.getElementById('reg-played-at').value;

  const validationError = validateMatchForm(a1, a2, b1, b2, scoreA, scoreB);
  if (validationError) {
    errorEl.textContent = validationError;
    return;
  }

  try {
    // Refresca PLAYERS aquí (no solo al abrir la pestaña): si alguien más registró
    // un resultado mientras este formulario estaba abierto, el ELO de los jugadores
    // seleccionados podría estar desfasado. De paso, aprovechamos para el aviso de duplicado.
    const [recentMatches, freshPlayers] = await Promise.all([
      fetchRecentMatches(1),
      fetchPlayers(),
    ]);
    PLAYERS = freshPlayers;
    if (isDuplicateOfLast(recentMatches[0], a1, a2, b1, b2, scoreA, scoreB)) {
      const confirmed = confirm('Este resultado es igual al último partido registrado (mismos jugadores y marcador). ¿Seguro que no es un duplicado?');
      if (!confirmed) return;
    }
  } catch (e) {
    // Si falla la comprobación (p.ej. sin conexión), seguimos con los datos que ya teníamos.
  }

  const byId = id => PLAYERS.find(p => p.id === id);
  const pA1 = byId(a1), pA2 = byId(a2), pB1 = byId(b1), pB2 = byId(b2);
  if (!pA1 || !pA2 || !pB1 || !pB2) {
    errorEl.textContent = 'Alguno de los jugadores seleccionados ya no existe. Recarga la pestaña e inténtalo de nuevo.';
    return;
  }

  const submitBtn = document.getElementById('reg-submit');
  submitBtn.disabled = true;
  try {
    const { winner, delta } = computeEloDelta(pA1.elo, pA2.elo, pB1.elo, pB2.elo, scoreA, scoreB);
    const signA = winner === 'A' ? 1 : -1;
    const signB = winner === 'B' ? 1 : -1;

    const updated = {
      [pA1.id]: { elo: applyEloFloor(pA1.elo + signA * delta), before: pA1.elo, won: winner === 'A' },
      [pA2.id]: { elo: applyEloFloor(pA2.elo + signA * delta), before: pA2.elo, won: winner === 'A' },
      [pB1.id]: { elo: applyEloFloor(pB1.elo + signB * delta), before: pB1.elo, won: winner === 'B' },
      [pB2.id]: { elo: applyEloFloor(pB2.elo + signB * delta), before: pB2.elo, won: winner === 'B' },
    };

    const match = await insertMatch({
      team_a_player1: pA1.id, team_a_player2: pA2.id,
      team_b_player1: pB1.id, team_b_player2: pB2.id,
      score_a: scoreA, score_b: scoreB,
      elo_delta: delta,
      recorded_by: null,
      played_at: playedAtInput ? new Date(playedAtInput).toISOString() : new Date().toISOString(),
    });

    for (const [id, info] of Object.entries(updated)) {
      const player = byId(id);
      await updatePlayer(id, {
        elo: info.elo,
        wins: player.wins + (info.won ? 1 : 0),
        losses: player.losses + (info.won ? 0 : 1),
        matches_played: player.matches_played + 1,
      });
    }

    await insertEloHistory(Object.entries(updated).map(([id, info]) => ({
      match_id: match.id,
      player_id: id,
      elo_before: info.before,
      elo_after: info.elo,
      delta: info.won ? Math.abs(info.elo - info.before) : -Math.abs(info.elo - info.before),
    })));

    document.getElementById('reg-form').reset();
    document.getElementById('reg-played-at').value = toDatetimeLocalValue(new Date());
    PLAYERS = await fetchPlayers();
    populateMatchFormSelects();
    errorEl.textContent = '';
    errorEl.classList.add('success');
    errorEl.textContent = '¡Partida registrada!';
    setTimeout(() => { errorEl.textContent = ''; errorEl.classList.remove('success'); }, 3000);
  } catch (e) {
    errorEl.textContent = 'No se pudo registrar la partida. Comprueba tu conexión e inténtalo de nuevo.';
  } finally {
    submitBtn.disabled = false;
  }
}

async function loadRecentMatchesFeed() {
  const feed = document.getElementById('ini-feed');
  if (!feed) return;
  feed.innerHTML = '<p class="hint">Cargando…</p>';
  try {
    const matches = await fetchRecentMatches(10);
    renderRecentMatchesFeed(matches);
  } catch (e) {
    feed.innerHTML = '<p class="error">No se pudo cargar el historial.</p>';
  }
}

function renderRecentMatchesFeed(matches) {
  const feed = document.getElementById('ini-feed');
  feed.innerHTML = '';
  if (matches.length === 0) {
    feed.innerHTML = '<p class="hint">Todavía no se ha jugado ninguna partida.</p>';
    return;
  }
  matches.forEach((m, i) => feed.appendChild(buildMatchRowElement(m, i === 0)));
}

function formatMatchDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

// Fila reutilizada por el feed de Inicio, el Historial completo y el modal de jugador.
// isLatest: solo la partida más reciente de toda la app puede "editarse" — deshacer
// cualquier otra partida requeriría recalcular el ELO de todas las posteriores, lo
// cual no está implementado (ver CLAUDE.md).
function buildMatchRowElement(m, isLatest = false) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  const teamA = `${m.team_a_player1_name?.name ?? '?'} / ${m.team_a_player2_name?.name ?? '?'}`;
  const teamB = `${m.team_b_player1_name?.name ?? '?'} / ${m.team_b_player2_name?.name ?? '?'}`;
  const aWon = m.score_a > m.score_b;
  row.innerHTML = `
    <div class="feed-main">
      <div class="feed-time">${formatMatchDateTime(m.played_at)}</div>
      <div class="feed-teams">
        <span class="${aWon ? 'feed-winner' : ''}">${aWon ? '🏆 ' : ''}${escHtml(teamA)} ${m.score_a}</span>
        <span class="feed-vs">–</span>
        <span class="${!aWon ? 'feed-winner' : ''}">${m.score_b} ${escHtml(teamB)}${!aWon ? ' 🏆' : ''}</span>
      </div>
    </div>
    <div class="feed-side">
      <div class="feed-delta">±${m.elo_delta} ELO</div>
      ${isLatest ? `
        <div class="feed-actions">
          <button type="button" class="feed-edit-btn" title="Editar resultado">✏️</button>
          <button type="button" class="feed-delete-btn" title="Borrar partida">🗑️</button>
        </div>` : ''}
    </div>`;
  if (isLatest) {
    row.querySelector('.feed-edit-btn').addEventListener('click', () => handleEditMatch(m));
    row.querySelector('.feed-delete-btn').addEventListener('click', () => handleDeleteMatch(m));
  }
  return row;
}

// Revierte el elo/wins/losses/matches_played de los 4 jugadores de una partida
// (a partir de sus filas de elo_history) y borra la fila de matches. Compartido
// por "Editar" (revierte + precarga el formulario) y "Borrar" (revierte y ya está).
async function revertMatchEffects(match) {
  const [historyRows, players] = await Promise.all([
    fetchEloHistoryForMatch(match.id),
    fetchPlayers(),
  ]);

  const byId = id => players.find(p => p.id === id);
  const aWon = match.score_a > match.score_b;
  const teamAIds = [match.team_a_player1, match.team_a_player2];

  for (const h of historyRows) {
    const player = byId(h.player_id);
    if (!player) continue;
    const won = teamAIds.includes(h.player_id) ? aWon : !aWon;
    await updatePlayer(h.player_id, {
      elo: h.elo_before,
      wins: player.wins - (won ? 1 : 0),
      losses: player.losses - (won ? 0 : 1),
      matches_played: player.matches_played - 1,
    });
  }

  await deleteMatch(match.id);
}

// Deshace la última partida y precarga el formulario de Registrar con los mismos
// datos para que sea rápido corregir el resultado y volver a guardarlo.
async function handleEditMatch(match) {
  if (!confirm('¿Deshacer esta partida para corregirla? Se revertirá el ELO y tendrás que volver a guardarla.')) {
    return;
  }
  try {
    await revertMatchEffects(match);
    PENDING_EDIT_MATCH = {
      a1: match.team_a_player1, a2: match.team_a_player2,
      b1: match.team_b_player1, b2: match.team_b_player2,
      scoreA: match.score_a, scoreB: match.score_b,
      playedAt: match.played_at,
    };
    closePlayerModal();
    switchTab('reg');
  } catch (e) {
    alert('No se pudo deshacer la partida. Comprueba tu conexión e inténtalo de nuevo.');
  }
}

// Borra la última partida sin volver a introducirla (p.ej. se metió por duplicado
// o no debería haberse apuntado).
async function handleDeleteMatch(match) {
  if (!confirm('¿Borrar esta partida? Se revertirá el ELO de los 4 jugadores y no se puede deshacer.')) {
    return;
  }
  try {
    await revertMatchEffects(match);
    closePlayerModal();
    loadTab(activeTab());
  } catch (e) {
    alert('No se pudo borrar la partida. Comprueba tu conexión e inténtalo de nuevo.');
  }
}
