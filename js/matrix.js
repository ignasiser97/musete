// Modal "🆚 Enfrentamientos" (abierto desde Clasificación): tabla de todos contra
// todos con el récord de cada jugador frente a cada rival. Solo cuenta cuando han
// sido rivales — las partidas jugadas como pareja no suman aquí.

async function openHeadToHeadMatrix() {
  const modal = document.getElementById('matrix-modal');
  const body = document.getElementById('matrix-modal-body');
  modal.classList.remove('hidden');
  body.innerHTML = '<p class="hint">Cargando…</p>';

  try {
    const [players, matches] = await Promise.all([fetchPlayers(), fetchAllMatches()]);
    renderHeadToHeadMatrix(players, matches);
  } catch (e) {
    body.innerHTML = '<p class="error">No se pudo cargar la matriz de enfrentamientos.</p>';
  }
}

function closeMatrixModal() {
  document.getElementById('matrix-modal').classList.add('hidden');
}

// matrix[a][b] = { wins, losses } de a contra b como rivales.
function computeHeadToHeadMatrix(players, matches) {
  const matrix = {};
  players.forEach(p => {
    matrix[p.id] = {};
    players.forEach(q => {
      if (p.id !== q.id) matrix[p.id][q.id] = { wins: 0, losses: 0 };
    });
  });

  matches.forEach(m => {
    const teamA = [m.team_a_player1, m.team_a_player2];
    const teamB = [m.team_b_player1, m.team_b_player2];
    const aWon = m.score_a > m.score_b;
    teamA.forEach(a => teamB.forEach(b => {
      if (!matrix[a]?.[b] || !matrix[b]?.[a]) return; // por si algún id ya no está en players
      if (aWon) { matrix[a][b].wins++; matrix[b][a].losses++; }
      else { matrix[a][b].losses++; matrix[b][a].wins++; }
    }));
  });

  return matrix;
}

function renderHeadToHeadMatrix(players, matches) {
  const body = document.getElementById('matrix-modal-body');
  body.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = '🆚 Enfrentamientos';
  body.appendChild(title);

  if (players.length < 2) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Hacen falta al menos 2 jugadores.';
    body.appendChild(p);
    return;
  }

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Victorias-derrotas de la fila contra la columna, solo como rivales (no cuenta cuando han sido pareja).';
  body.appendChild(hint);

  const matrix = computeHeadToHeadMatrix(players, matches);
  const ordered = players.slice().sort((a, b) => b.elo - a.elo);

  const scroll = document.createElement('div');
  scroll.className = 'h2h-scroll';
  const table = document.createElement('table');
  table.className = 'h2h-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th')).className = 'h2h-corner';
  ordered.forEach(p => {
    const th = document.createElement('th');
    th.className = 'h2h-col-header';
    th.title = p.name;
    th.textContent = p.name.slice(0, 3).toUpperCase();
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  ordered.forEach(rowPlayer => {
    const tr = document.createElement('tr');

    const rowHeader = document.createElement('th');
    rowHeader.className = 'h2h-row-header';
    rowHeader.appendChild(buildAvatarElement(rowPlayer));
    const nameSpan = document.createElement('span');
    nameSpan.textContent = rowPlayer.name;
    rowHeader.appendChild(nameSpan);
    tr.appendChild(rowHeader);

    ordered.forEach(colPlayer => {
      const td = document.createElement('td');
      td.className = 'h2h-cell';
      if (rowPlayer.id === colPlayer.id) {
        td.textContent = '—';
        td.classList.add('h2h-self');
      } else {
        const rec = matrix[rowPlayer.id][colPlayer.id];
        if (rec.wins === 0 && rec.losses === 0) {
          td.textContent = '·';
          td.classList.add('h2h-self');
        } else {
          td.textContent = `${rec.wins}-${rec.losses}`;
          if (rec.wins > rec.losses) td.classList.add('h2h-pos');
          else if (rec.losses > rec.wins) td.classList.add('h2h-neg');
        }
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  scroll.appendChild(table);
  body.appendChild(scroll);
}
