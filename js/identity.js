// "¿Quién eres?" — sin contraseña, solo identificación local del jugador actual.
// CURRENT_PLAYER = { id, name } | null. Se usa para preseleccionar formularios y para
// rellenar matches.recorded_by (accountability sin auth).

const IDENTITY_KEY = 'musete_user';

let CURRENT_PLAYER = null;

function loadCurrentPlayer() {
  const raw = localStorage.getItem(IDENTITY_KEY);
  CURRENT_PLAYER = raw ? JSON.parse(raw) : null;
  return CURRENT_PLAYER;
}

function setCurrentPlayer(player) {
  CURRENT_PLAYER = player;
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(player));
  renderIdentityBanner();
}

function clearCurrentPlayer() {
  CURRENT_PLAYER = null;
  localStorage.removeItem(IDENTITY_KEY);
  renderIdentityBanner();
}

function renderIdentityBanner() {
  const el = document.getElementById('identity-banner');
  if (!el) return;

  if (!CURRENT_PLAYER) {
    el.innerHTML = `
      <div class="identity-prompt">
        <p>¿Quién eres?</p>
        <div id="identity-picker" class="identity-picker"></div>
      </div>`;
    renderIdentityPicker();
  } else {
    el.innerHTML = `
      <div class="identity-current">
        Eres <strong>${escHtml(CURRENT_PLAYER.name)}</strong>
        · <button class="link-btn" onclick="clearCurrentPlayer()">cambiar</button>
      </div>`;
  }
}

async function renderIdentityPicker() {
  const picker = document.getElementById('identity-picker');
  if (!picker) return;
  try {
    const players = await fetchPlayers();
    picker.innerHTML = '';
    if (players.length === 0) {
      picker.innerHTML = `<p class="hint">Añade jugadores primero en la pestaña Jugadores.</p>`;
      return;
    }
    players.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.textContent = p.name;
      btn.addEventListener('click', () => setCurrentPlayer({ id: p.id, name: p.name }));
      picker.appendChild(btn);
    });
  } catch (e) {
    picker.innerHTML = `<p class="error">No se pudo cargar la lista de jugadores.</p>`;
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
