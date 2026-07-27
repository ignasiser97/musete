// Pestaña Historial: todas las partidas jugadas, con filtro opcional por jugador.

let ALL_MATCHES = [];

async function loadHistoryTab() {
  const list = document.getElementById('his-list');
  list.innerHTML = '<p class="hint">Cargando…</p>';
  document.getElementById('his-error').textContent = '';
  try {
    const [players, matches] = await Promise.all([fetchPlayers(), fetchAllMatchesWithNames()]);
    PLAYERS = players;
    ALL_MATCHES = matches;
    populateHistoryFilter();
    renderHistoryList();
  } catch (e) {
    document.getElementById('his-error').textContent = 'No se pudo cargar el historial.';
    list.innerHTML = '';
  }
}

function populateHistoryFilter() {
  const select = document.getElementById('his-filter');
  const current = select.value;
  select.innerHTML = '<option value="">Todos los jugadores</option>' +
    PLAYERS.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  select.value = current;
}

function matchIncludesPlayer(m, playerId) {
  return [m.team_a_player1, m.team_a_player2, m.team_b_player1, m.team_b_player2].includes(playerId);
}

function handleHistoryFilterChange() {
  renderHistoryList();
}

function renderHistoryList() {
  const list = document.getElementById('his-list');
  const filterId = document.getElementById('his-filter').value;

  const matches = filterId ? ALL_MATCHES.filter(m => matchIncludesPlayer(m, filterId)) : ALL_MATCHES;

  list.innerHTML = '';
  if (matches.length === 0) {
    list.innerHTML = filterId
      ? '<p class="hint">Este jugador todavía no tiene partidas.</p>'
      : '<p class="hint">Todavía no se ha jugado ninguna partida.</p>';
    return;
  }

  const count = document.createElement('p');
  count.className = 'hint';
  count.textContent = `${matches.length} partida${matches.length === 1 ? '' : 's'}`;
  list.appendChild(count);

  const latestId = ALL_MATCHES[0]?.id;
  matches.forEach(m => list.appendChild(buildMatchRowElement(m, m.id === latestId)));
}
