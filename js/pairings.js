// Pestaña Emparejar: genera parejas y mesas para una ronda, en 3 modos.
// Heurísticas greedy documentadas (no solvers óptimos) — suficiente para grupos de amigos.

let LAST_PAIRING_MODE = 'random';

async function loadPairingsTab() {
  try {
    PLAYERS = await fetchPlayers();
  } catch (e) {
    document.getElementById('emp-error').textContent = 'No se pudo cargar la lista de jugadores.';
    return;
  }
  renderPresentChecklist();
  document.getElementById('emp-result').innerHTML = '';
  document.getElementById('emp-error').textContent = '';
}

function renderPresentChecklist() {
  const wrap = document.getElementById('emp-checklist');
  wrap.innerHTML = '';
  PLAYERS.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const label = document.createElement('label');
    label.className = 'checklist-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = p.id;
    checkbox.checked = true;
    label.appendChild(checkbox);
    label.append(' ' + p.name);
    wrap.appendChild(label);
  });
}

function getPresentPlayers() {
  const checked = Array.from(document.querySelectorAll('#emp-checklist input:checked')).map(c => c.value);
  return PLAYERS.filter(p => checked.includes(p.id));
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function handleGeneratePairings(mode) {
  LAST_PAIRING_MODE = mode;
  document.querySelectorAll('.mode-selector button').forEach(btn =>
    btn.classList.toggle('selected', btn.dataset.mode === mode));
  const errorEl = document.getElementById('emp-error');
  errorEl.textContent = '';

  const present = getPresentPlayers();
  if (present.length < 4) {
    errorEl.textContent = 'Se necesitan al menos 4 jugadores presentes.';
    document.getElementById('emp-result').innerHTML = '';
    return;
  }

  let result;
  try {
    if (mode === 'random') {
      result = pureRandomPairing(present);
    } else if (mode === 'no-repeat') {
      const matches = await fetchAllMatches();
      result = noRepeatPairing(present, matches);
    } else if (mode === 'elo-balanced') {
      result = eloBalancedPairing(present);
    }
  } catch (e) {
    errorEl.textContent = 'No se pudieron generar los emparejamientos.';
    return;
  }

  renderPairingResult(result);
}

function handleRegeneratePairings() {
  handleGeneratePairings(LAST_PAIRING_MODE);
}

// --- Modo 1: aleatorio puro (sin memoria de historial, incluido el descanso) ---
function pureRandomPairing(present) {
  const shuffled = shuffle(present);
  const sitOutCount = shuffled.length % 4;
  const sitOuts = shuffled.slice(0, sitOutCount);
  const playing = shuffled.slice(sitOutCount);

  const tables = [];
  for (let i = 0; i < playing.length; i += 4) {
    const [p1, p2, p3, p4] = playing.slice(i, i + 4);
    tables.push({ teamA: [p1, p2], teamB: [p3, p4] });
  }
  return { tables, sitOuts };
}

// Selección de descansos "justa": primero quienes menos partidas llevan jugadas esta semana,
// empates al azar. Usado por los modos 2 y 3 (a diferencia del modo 1, que descansa al azar).
function selectFairSitOuts(present, count) {
  if (count === 0) return { sitOuts: [], playing: present };
  const sorted = shuffle(present).sort((a, b) => a.matches_played - b.matches_played);
  return { sitOuts: sorted.slice(0, count), playing: sorted.slice(count) };
}

function buildHistoryMatrices(matches, present) {
  const partnerCount = {};
  const opponentCount = {};
  present.forEach(p => {
    partnerCount[p.id] = {};
    opponentCount[p.id] = {};
    present.forEach(q => { partnerCount[p.id][q.id] = 0; opponentCount[p.id][q.id] = 0; });
  });

  const bump = (map, a, b) => {
    if (map[a] && map[a][b] !== undefined) map[a][b]++;
    if (map[b] && map[b][a] !== undefined) map[b][a]++;
  };

  matches.forEach(m => {
    bump(partnerCount, m.team_a_player1, m.team_a_player2);
    bump(partnerCount, m.team_b_player1, m.team_b_player2);
    [m.team_a_player1, m.team_a_player2].forEach(a =>
      [m.team_b_player1, m.team_b_player2].forEach(b => bump(opponentCount, a, b))
    );
  });

  return { partnerCount, opponentCount };
}

// --- Modo 2: aleatorio evitando repetir parejas/rivales ---
function noRepeatPairing(present, matches) {
  const sitOutCount = present.length % 4;
  const { sitOuts, playing } = selectFairSitOuts(present, sitOutCount);
  const { partnerCount, opponentCount } = buildHistoryMatrices(matches, present);

  // Fase A: formar equipos minimizando repetición de compañero.
  let pool = shuffle(playing);
  const teams = [];
  while (pool.length > 0) {
    const anchor = pool.shift();
    let bestIdx = 0, bestScore = Infinity;
    pool.forEach((cand, i) => {
      const score = partnerCount[anchor.id][cand.id];
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    });
    const partner = pool.splice(bestIdx, 1)[0];
    teams.push([anchor, partner]);
  }

  // Fase B: emparejar equipos en mesas minimizando repetición de rival.
  let teamPool = shuffle(teams);
  const tables = [];
  while (teamPool.length > 0) {
    const anchor = teamPool.shift();
    let bestIdx = 0, bestScore = Infinity;
    teamPool.forEach((cand, i) => {
      const score = anchor.reduce((sum, a) =>
        sum + cand.reduce((s2, b) => s2 + opponentCount[a.id][b.id], 0), 0);
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    });
    const rival = teamPool.splice(bestIdx, 1)[0];
    tables.push({ teamA: anchor, teamB: rival });
  }

  return { tables, sitOuts };
}

// --- Modo 3: aleatorio equilibrado por ELO ---
function eloBalancedPairing(present) {
  const sitOutCount = present.length % 4;
  const { sitOuts, playing } = selectFairSitOuts(present, sitOutCount);

  // Emparejamiento "serpiente": mejor con peor, para formar equipos balanceados.
  const byElo = playing.slice().sort((a, b) => b.elo - a.elo);
  const teams = [];
  let lo = 0, hi = byElo.length - 1;
  while (lo < hi) {
    teams.push([byElo[lo], byElo[hi]]);
    lo++; hi--;
  }

  // Emparejar mesas por ELO combinado más cercano.
  const ranked = teams
    .map(team => ({ team, combined: team[0].elo + team[1].elo }))
    .sort((a, b) => b.combined - a.combined);

  const tables = [];
  for (let i = 0; i < ranked.length; i += 2) {
    if (ranked[i + 1]) {
      tables.push({ teamA: ranked[i].team, teamB: ranked[i + 1].team });
    }
  }

  return { tables, sitOuts };
}

// --- Render compartido ---
function renderPairingResult({ tables, sitOuts }) {
  const wrap = document.getElementById('emp-result');
  wrap.innerHTML = '';

  tables.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'table-card';
    card.innerHTML = `
      <div class="table-card-title">Mesa ${i + 1}</div>
      <div class="table-card-teams">
        <span>${escHtml(t.teamA[0].name)} / ${escHtml(t.teamA[1].name)}</span>
        <span class="table-vs">vs</span>
        <span>${escHtml(t.teamB[0].name)} / ${escHtml(t.teamB[1].name)}</span>
      </div>`;
    wrap.appendChild(card);
  });

  if (sitOuts.length > 0) {
    const rest = document.createElement('div');
    rest.className = 'sitouts';
    rest.textContent = 'Descansan: ' + sitOuts.map(p => p.name).join(', ');
    wrap.appendChild(rest);
  }

  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'btn-secondary';
  regenBtn.textContent = 'Regenerar';
  regenBtn.onclick = handleRegeneratePairings;
  wrap.appendChild(regenBtn);
}
