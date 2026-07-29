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
    renderPlayerDetail(player, history, matches, allMatches[0]?.id);
  } catch (e) {
    body.innerHTML = '<p class="error">No se pudo cargar el histórico.</p>';
  }
}

function closePlayerModal() {
  document.getElementById('player-modal').classList.add('hidden');
}

function renderPlayerDetail(player, history, matches, latestId) {
  const body = document.getElementById('player-modal-body');
  body.innerHTML = '';

  body.appendChild(buildAvatarUploadElement(player));

  const header = document.createElement('div');
  header.className = 'player-modal-header';
  body.appendChild(header);
  renderPlayerNameHeader(player, header);

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

  const curiositiesTitle = document.createElement('h2');
  curiositiesTitle.textContent = '🔥 Curiosidades';
  body.appendChild(curiositiesTitle);
  body.appendChild(renderCuriosities(computePlayerStats(player.id, matches)));

  const matchesTitle = document.createElement('h2');
  matchesTitle.textContent = 'Sus partidas';
  body.appendChild(matchesTitle);

  matches.forEach(m => body.appendChild(buildMatchRowElement(m, m.id === latestId)));
}

// --- Editar nombre (in-place en la cabecera del modal) ---

function renderPlayerNameHeader(player, header) {
  header.innerHTML = `
    <h2 class="player-modal-title">${escHtml(player.name)}</h2>
    <button type="button" class="icon-btn" title="Editar nombre">✏️</button>`;
  header.querySelector('.icon-btn').addEventListener('click', () => startEditPlayerName(player, header));
}

function startEditPlayerName(player, header) {
  header.innerHTML = `
    <input type="text" class="player-name-input" maxlength="40">
    <button type="button" class="icon-btn" title="Guardar">✔️</button>
    <button type="button" class="icon-btn" title="Cancelar">✕</button>`;
  const input = header.querySelector('.player-name-input');
  input.value = player.name;
  const [saveBtn, cancelBtn] = header.querySelectorAll('.icon-btn');
  input.focus();
  input.select();
  saveBtn.addEventListener('click', () => savePlayerName(player, header, input.value.trim()));
  cancelBtn.addEventListener('click', () => renderPlayerNameHeader(player, header));
}

async function savePlayerName(player, header, newName) {
  if (!newName) { alert('El nombre no puede estar vacío.'); return; }
  if (newName === player.name) { renderPlayerNameHeader(player, header); return; }
  if (PLAYERS.some(p => p.id !== player.id && p.name.toLowerCase() === newName.toLowerCase())) {
    alert('Ya existe un jugador con ese nombre.');
    return;
  }
  try {
    await updatePlayer(player.id, { name: newName });
    player.name = newName; // PLAYERS[i] es la misma referencia que player
    renderPlayerNameHeader(player, header);
    renderPlayersList();
  } catch (e) {
    alert('No se pudo guardar el nombre. Inténtalo de nuevo.');
  }
}

// --- Foto de perfil (opcional) ---

function buildAvatarUploadElement(player) {
  const wrap = document.createElement('div');
  wrap.className = 'player-modal-avatar-wrap';

  const avatarEl = buildAvatarElement(player, true);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.capture = 'environment';
  fileInput.hidden = true;

  avatarEl.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleAvatarUpload(player, fileInput.files[0]));

  wrap.append(avatarEl, fileInput);
  return wrap;
}

// Redimensiona/recorta la foto a un cuadrado en el propio navegador antes de subirla,
// para no comerse el móvil de datos con una foto de cámara de varios MB tal cual.
function resizeImageToBlob(file, size = 300) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error('No se pudo leer el fichero'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', 0.8);
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    reader.readAsDataURL(file);
  });
}

async function handleAvatarUpload(player, file) {
  if (!file) return;
  try {
    const blob = await resizeImageToBlob(file, 300);
    const url = await uploadAvatar(player.id, blob);
    await updatePlayer(player.id, { avatar_url: url });
    player.avatar_url = url; // PLAYERS[i] es la misma referencia que player
    renderPlayersList();
    openPlayerDetail(player);
  } catch (e) {
    alert('No se pudo subir la foto. Comprueba tu conexión e inténtalo de nuevo.');
  }
}

// --- Curiosidades: rachas, rival favorito/bestia negra, mejor pareja ---

function computePlayerStats(playerId, matches) {
  const sorted = matches.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const results = sorted.map(m => {
    const onTeamA = [m.team_a_player1, m.team_a_player2].includes(playerId);
    const win = onTeamA ? m.score_a > m.score_b : m.score_b > m.score_a;
    const partnerId = onTeamA
      ? (m.team_a_player1 === playerId ? m.team_a_player2 : m.team_a_player1)
      : (m.team_b_player1 === playerId ? m.team_b_player2 : m.team_b_player1);
    const partnerName = onTeamA
      ? (m.team_a_player1 === playerId ? m.team_a_player2_name?.name : m.team_a_player1_name?.name)
      : (m.team_b_player1 === playerId ? m.team_b_player2_name?.name : m.team_b_player1_name?.name);
    const opponentIds = onTeamA ? [m.team_b_player1, m.team_b_player2] : [m.team_a_player1, m.team_a_player2];
    const opponentNames = onTeamA
      ? [m.team_b_player1_name?.name, m.team_b_player2_name?.name]
      : [m.team_a_player1_name?.name, m.team_a_player2_name?.name];
    return { win, partnerId, partnerName, opponentIds, opponentNames };
  });

  // Racha actual: se cuenta desde la partida más reciente hacia atrás.
  let currentStreak = { type: null, count: 0 };
  for (let i = results.length - 1; i >= 0; i--) {
    const type = results[i].win ? 'win' : 'loss';
    if (currentStreak.count === 0) currentStreak = { type, count: 1 };
    else if (currentStreak.type === type) currentStreak.count++;
    else break;
  }

  // Mejor racha de victorias de toda la semana.
  let bestWinStreak = 0, running = 0;
  results.forEach(r => {
    running = r.win ? running + 1 : 0;
    bestWinStreak = Math.max(bestWinStreak, running);
  });

  // Rival favorito (más veces ganado) / bestia negra (más veces perdido contra él).
  const rivalStats = {};
  results.forEach(r => {
    r.opponentIds.forEach((oid, i) => {
      if (!oid) return;
      if (!rivalStats[oid]) rivalStats[oid] = { name: r.opponentNames[i] ?? '?', wins: 0, losses: 0 };
      rivalStats[oid][r.win ? 'wins' : 'losses']++;
    });
  });
  const rivalList = Object.values(rivalStats);
  const favoriteRival = rivalList.slice().sort((a, b) => b.wins - a.wins)[0] ?? null;
  const nemesis = rivalList.slice().sort((a, b) => b.losses - a.losses)[0] ?? null;

  // Mejor pareja: mejor ratio de victorias jugando juntos.
  const partnerStats = {};
  results.forEach(r => {
    if (!r.partnerId) return;
    if (!partnerStats[r.partnerId]) partnerStats[r.partnerId] = { name: r.partnerName ?? '?', wins: 0, total: 0 };
    partnerStats[r.partnerId].total++;
    if (r.win) partnerStats[r.partnerId].wins++;
  });
  const bestPartner = Object.values(partnerStats)
    .sort((a, b) => (b.wins / b.total) - (a.wins / a.total) || b.total - a.total)[0] ?? null;

  return { currentStreak, bestWinStreak, favoriteRival, nemesis, bestPartner };
}

function renderCuriosities(stats) {
  const wrap = document.createElement('div');
  wrap.className = 'curiosities';
  const rows = [];

  if (stats.currentStreak.count > 1) {
    rows.push(stats.currentStreak.type === 'win'
      ? `🔥 Racha actual: ${stats.currentStreak.count} victorias seguidas`
      : `❄️ Racha actual: ${stats.currentStreak.count} derrotas seguidas`);
  }
  if (stats.bestWinStreak > 1) {
    rows.push(`🏅 Mejor racha de la semana: ${stats.bestWinStreak} victorias seguidas`);
  }
  if (stats.favoriteRival && stats.favoriteRival.wins > 0) {
    rows.push(`😎 Rival favorito: ${escHtml(stats.favoriteRival.name)} (le ha ganado ${stats.favoriteRival.wins} ${stats.favoriteRival.wins === 1 ? 'vez' : 'veces'})`);
  }
  if (stats.nemesis && stats.nemesis.losses > 0) {
    rows.push(`💀 Bestia negra: ${escHtml(stats.nemesis.name)} (le ha ganado ${stats.nemesis.losses} ${stats.nemesis.losses === 1 ? 'vez' : 'veces'})`);
  }
  if (stats.bestPartner) {
    rows.push(`🤝 Mejor pareja: ${escHtml(stats.bestPartner.name)} (${stats.bestPartner.wins}/${stats.bestPartner.total} juntos)`);
  }

  if (rows.length === 0) {
    wrap.innerHTML = '<p class="hint">Todavía no hay suficientes partidas para curiosidades.</p>';
    return wrap;
  }

  wrap.innerHTML = rows.map(r => `<div class="curiosity-row">${r}</div>`).join('');
  return wrap;
}

function buildEloChart(history) {
  const W = 320, H = 170;
  const marginLeft = 34, marginRight = 10, marginTop = 16, marginBottom = 10;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;

  const values = [history[0].elo_before, ...history.map(h => h.elo_after)];
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);

  const xFor = i => marginLeft + (i / (values.length - 1 || 1)) * plotW;
  const yFor = v => marginTop + plotH - ((v - min) / range) * plotH;
  const coords = values.map((v, i) => [xFor(i), yFor(v)]);

  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const lastPoint = coords[coords.length - 1];
  const areaPath = `${linePath} L${lastPoint[0].toFixed(1)},${(marginTop + plotH).toFixed(1)} L${coords[0][0].toFixed(1)},${(marginTop + plotH).toFixed(1)} Z`;

  // 4 líneas de referencia (incluye min y max exactos en los extremos).
  const tickCount = 4;
  const gridLines = Array.from({ length: tickCount }, (_, i) => {
    const value = Math.round(min + (range * i) / (tickCount - 1));
    const y = yFor(value);
    return `
      <line x1="${marginLeft}" y1="${y.toFixed(1)}" x2="${W - marginRight}" y2="${y.toFixed(1)}" class="chart-grid"/>
      <text x="${marginLeft - 6}" y="${(y + 3).toFixed(1)}" class="chart-tick" text-anchor="end">${value}</text>`;
  }).join('');

  // Un punto por partida; el inicial y el actual muestran su valor siempre,
  // el resto se revela al tocarlo (para no saturar el gráfico de números).
  const lastIdx = coords.length - 1;
  const points = coords.map(([x, y], i) => {
    const isEndpoint = i === 0 || i === lastIdx;
    const anchor = i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle';
    return `
      <g class="chart-point">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" class="chart-dot-hit"/>
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="chart-dot"/>
        <text x="${x.toFixed(1)}" y="${(y - 9).toFixed(1)}" text-anchor="${anchor}" class="chart-point-label${isEndpoint ? '' : ' hidden'}">${values[i]}</text>
      </g>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.className = 'elo-chart';
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}">
      <defs>
        <linearGradient id="eloChartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:var(--accent); stop-opacity:0.35"/>
          <stop offset="100%" style="stop-color:var(--accent); stop-opacity:0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaPath}" style="fill:url(#eloChartFill); stroke:none"/>
      <path d="${linePath}" style="fill:none; stroke:var(--accent); stroke-width:2.5; stroke-linecap:round; stroke-linejoin:round"/>
      ${points}
    </svg>
    <p class="hint elo-chart-hint">Toca un punto para ver su valor</p>`;

  wrap.querySelectorAll('.chart-point').forEach(g => {
    g.addEventListener('click', () => g.querySelector('.chart-point-label').classList.toggle('hidden'));
  });

  return wrap;
}
