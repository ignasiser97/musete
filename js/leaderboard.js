// Pestaña Clasificación: ranking completo ordenado por ELO.

let PREV_RANK = {}; // id -> puesto anterior, para la flecha ▲/▼ dentro de la misma sesión

async function loadLeaderboardTab() {
  const wrap = document.getElementById('cla-list');
  wrap.innerHTML = '<p class="hint">Cargando…</p>';
  try {
    const players = await fetchPlayers(); // ya viene ordenado por elo desc
    renderLeaderboard(players);
  } catch (e) {
    wrap.innerHTML = '<p class="error">No se pudo cargar la clasificación.</p>';
  }
}

function renderLeaderboard(players) {
  const wrap = document.getElementById('cla-list');
  wrap.innerHTML = '';

  if (players.length === 0) {
    wrap.innerHTML = '<p class="hint">Todavía no hay jugadores.</p>';
    return;
  }

  const nextRank = {};
  players.forEach((p, i) => {
    const rank = i + 1;
    nextRank[p.id] = rank;

    const row = document.createElement('div');
    row.className = 'lb-row';

    const posEl = document.createElement('span');
    posEl.className = 'lb-pos';
    posEl.textContent = rank;

    const nameEl = document.createElement('span');
    nameEl.className = 'lb-name';
    nameEl.textContent = p.name;

    const eloEl = document.createElement('span');
    eloEl.className = 'lb-elo';
    eloEl.textContent = p.elo;

    const recordEl = document.createElement('span');
    recordEl.className = 'lb-record';
    recordEl.textContent = `${p.wins}V-${p.losses}D`;

    const trendEl = document.createElement('span');
    trendEl.className = 'lb-trend';
    const prev = PREV_RANK[p.id];
    if (prev !== undefined && prev !== rank) {
      trendEl.textContent = prev > rank ? '▲' : '▼';
      trendEl.classList.add(prev > rank ? 'trend-up' : 'trend-down');
    }

    row.append(posEl, nameEl, eloEl, recordEl, trendEl);
    wrap.appendChild(row);
  });

  PREV_RANK = nextRank;
}
