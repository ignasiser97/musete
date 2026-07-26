// Router de pestañas, registro del service worker, banner de actualización,
// pull-to-refresh y arranque de la app. Debe cargarse el último de todos los <script>.

const TABS = ['ini', 'cla', 'jug', 'reg', 'emp', 'his'];

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(panel =>
    panel.classList.toggle('hidden', panel.id !== `${tab}-tab`));
  loadTab(tab);
}

function loadTab(tab) {
  switch (tab) {
    case 'ini': renderIdentityBanner(); loadHomeSummary(); loadRecentMatchesFeed(); break;
    case 'cla': loadLeaderboardTab(); break;
    case 'jug': loadPlayersTab(); break;
    case 'reg': loadRegisterTab(); break;
    case 'emp': loadPairingsTab(); break;
    case 'his': loadHistoryTab(); break;
  }
}

function activeTab() {
  const active = document.querySelector('.tab-btn.active');
  return active ? active.dataset.tab : 'ini';
}

async function loadHomeSummary() {
  const el = document.getElementById('ini-leader');
  if (!el) return;
  try {
    const players = await fetchPlayers();
    el.textContent = players.length > 0
      ? `Va líder: ${players[0].name} (ELO ${players[0].elo})`
      : 'Añade jugadores para empezar a jugar.';
  } catch (e) {
    el.textContent = '';
  }
}

// --- Service worker: registro + banner de actualización ---
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(reg);
        }
      });
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function showUpdateBanner(reg) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.classList.remove('hidden');
  document.getElementById('update-btn').onclick = () => {
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  };
}

// --- Pull to refresh ---
function setupPullToRefresh() {
  const indicator = document.getElementById('ptr-indicator');
  if (!indicator) return;
  let startY = null;

  document.addEventListener('touchstart', e => {
    if (window.scrollY === 0) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    if (startY === null) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 60) indicator.classList.add('visible');
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (indicator.classList.contains('visible')) {
      indicator.classList.remove('visible');
      loadTab(activeTab());
    }
    startY = null;
  });
}

// --- Bootstrap ---
loadCurrentPlayer();
registerServiceWorker();
setupPullToRefresh();
switchTab('ini');
