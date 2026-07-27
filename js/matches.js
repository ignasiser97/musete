// Pestaña Registrar: formulario para introducir el resultado de una partida.
// También alimenta el feed de "últimas partidas" de la pestaña Inicio.

async function loadRegisterTab() {
  await ensurePlayersLoadedForForm();
  populateMatchFormSelects();
  document.getElementById('reg-error').textContent = '';
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

  const validationError = validateMatchForm(a1, a2, b1, b2, scoreA, scoreB);
  if (validationError) {
    errorEl.textContent = validationError;
    return;
  }

  const byId = id => PLAYERS.find(p => p.id === id);
  const pA1 = byId(a1), pA2 = byId(a2), pB1 = byId(b1), pB2 = byId(b2);

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
  matches.forEach(m => feed.appendChild(buildMatchRowElement(m)));
}

// Fila reutilizada por el feed de Inicio y por el Historial completo.
function buildMatchRowElement(m) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  const teamA = `${m.team_a_player1_name?.name ?? '?'} / ${m.team_a_player2_name?.name ?? '?'}`;
  const teamB = `${m.team_b_player1_name?.name ?? '?'} / ${m.team_b_player2_name?.name ?? '?'}`;
  const aWon = m.score_a > m.score_b;
  row.innerHTML = `
    <div class="feed-teams">
      <span class="${aWon ? 'feed-winner' : ''}">${aWon ? '🏆 ' : ''}${escHtml(teamA)} ${m.score_a}</span>
      <span class="feed-vs">–</span>
      <span class="${!aWon ? 'feed-winner' : ''}">${m.score_b} ${escHtml(teamB)}${!aWon ? ' 🏆' : ''}</span>
    </div>
    <div class="feed-delta">±${m.elo_delta} ELO</div>`;
  return row;
}
