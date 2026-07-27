// Modal de detalle de jugador (abierto desde la pestaña Jugadores): gráfica de
// evolución de ELO + lista de sus partidas. Reutiliza matchIncludesPlayer()
// (history.js), buildMatchRowElement() (matches.js) y fetchAllMatchesWithNames()
// (supabase.js).

async function openPlayerDetail(player) {
  const modal = document.getElementById('player-modal');
  const body = document.getElementById('player-modal-body');
  modal.classList.remove('hidden');
  body.innerHTML = '<p class="hint">Cargando…</p>';

  try {
    const [history, allMatches] = await Promise.all([
      fetchEloHistoryForPlayer(player.id),
      fetchAllMatchesWithNames(),
    ]);
    const matches = allMatches.filter(m => matchIncludesPlayer(m, player.id));
    renderPlayerDetail(player, history, matches);
  } catch (e) {
    body.innerHTML = '<p class="error">No se pudo cargar el histórico.</p>';
  }
}

function closePlayerModal() {
  document.getElementById('player-modal').classList.add('hidden');
}

function renderPlayerDetail(player, history, matches) {
  const body = document.getElementById('player-modal-body');
  body.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'player-modal-title';
  title.textContent = player.name;
  body.appendChild(title);

  const eloNow = document.createElement('p');
  eloNow.className = 'leader-headline';
  eloNow.textContent = `ELO actual: ${player.elo} · ${player.wins}V-${player.losses}D`;
  body.appendChild(eloNow);

  if (history.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Todavía no tiene partidas registradas.';
    body.appendChild(p);
    return;
  }

  body.appendChild(buildEloChart(history));

  const matchesTitle = document.createElement('h2');
  matchesTitle.textContent = 'Sus partidas';
  body.appendChild(matchesTitle);

  matches.forEach(m => body.appendChild(buildMatchRowElement(m)));
}

function buildEloChart(history) {
  const W = 300, H = 120, PAD = 10;
  const values = [history[0].elo_before, ...history.map(h => h.elo_after)];
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);

  const coords = values.map((elo, i) => {
    const x = PAD + (i / (values.length - 1 || 1)) * (W - PAD * 2);
    const y = H - PAD - ((elo - min) / range) * (H - PAD * 2);
    return [x, y];
  });

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lastX = coords[coords.length - 1][0].toFixed(1);
  const firstX = coords[0][0].toFixed(1);
  const areaPath = `${linePath} L${lastX},${H - PAD} L${firstX},${H - PAD} Z`;

  const wrap = document.createElement('div');
  wrap.className = 'elo-chart';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eloChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--accent); stop-opacity:0.35"/>
          <stop offset="100%" style="stop-color:var(--accent); stop-opacity:0"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" style="fill:url(#eloChartFill); stroke:none"/>
      <path d="${linePath}" style="fill:none; stroke:var(--accent); stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"/>
    </svg>
    <div class="elo-chart-range"><span>${min}</span><span>${max}</span></div>`;
  return wrap;
}
