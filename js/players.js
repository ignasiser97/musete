// Pestaña Jugadores: roster + alta de nuevos jugadores.

let PLAYERS = [];

async function loadPlayersTab() {
  const list = document.getElementById('jug-list');
  list.innerHTML = '<p class="hint">Cargando…</p>';
  try {
    PLAYERS = await fetchPlayers();
    renderPlayersList();
  } catch (e) {
    list.innerHTML = '<p class="error">No se pudo cargar la lista de jugadores.</p>';
  }
}

function renderPlayersList() {
  const list = document.getElementById('jug-list');
  list.innerHTML = '';
  if (PLAYERS.length === 0) {
    list.innerHTML = '<p class="hint">Todavía no hay jugadores. Añade el primero abajo.</p>';
    return;
  }
  PLAYERS.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-row';
    const name = document.createElement('span');
    name.textContent = p.name;
    const meta = document.createElement('span');
    meta.className = 'player-meta';
    meta.textContent = `ELO ${p.elo} · ${p.wins}V-${p.losses}D`;
    row.appendChild(name);
    row.appendChild(meta);
    list.appendChild(row);
  });
}

async function handleAddPlayer(event) {
  event.preventDefault();
  const input = document.getElementById('jug-new-name');
  const name = input.value.trim();
  const errorEl = document.getElementById('jug-add-error');
  errorEl.textContent = '';

  if (!name) return;
  if (PLAYERS.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    errorEl.textContent = 'Ya existe un jugador con ese nombre.';
    return;
  }

  const submitBtn = document.getElementById('jug-add-submit');
  submitBtn.disabled = true;
  try {
    const player = await insertPlayer(name);
    PLAYERS.push(player);
    renderPlayersList();
    input.value = '';
  } catch (e) {
    errorEl.textContent = 'No se pudo añadir el jugador. Inténtalo de nuevo.';
  } finally {
    submitBtn.disabled = false;
  }
}
