// Cálculo de ELO por partida de mus (2 vs 2), ponderado por margen de resultado.
// Funciones puras, sin DOM ni Supabase — fáciles de verificar a mano en consola.

const STARTING_ELO      = 1000;  // rating inicial de un jugador nuevo
const K_FACTOR          = 32;    // sensibilidad del ajuste, igual que el estándar de ajedrez
const MARGIN_NORM       = 30;    // ~ partida típica de mus a 30/40 "buenas"
const MAX_MARGIN_FACTOR = 1.5;   // techo para que un resultado exagerado no dispare el ranking
const MIN_ELO           = 100;   // suelo defensivo

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// scoreA/scoreB: marcador final de cada equipo (sin empates en mus).
// eloA1/eloA2/eloB1/eloB2: ELO actual de cada jugador antes de esta partida.
// Devuelve { winner: 'A'|'B', delta, expectedA, marginFactor } — delta es la magnitud
// (positiva) que suman los ganadores y restan los perdedores.
function computeEloDelta(eloA1, eloA2, eloB1, eloB2, scoreA, scoreB) {
  if (scoreA === scoreB) {
    throw new Error('El mus no tiene empates: scoreA y scoreB deben ser distintos');
  }

  const teamARating = (eloA1 + eloA2) / 2;
  const teamBRating = (eloB1 + eloB2) / 2;

  const expectedA = expectedScore(teamARating, teamBRating);
  const actualA = scoreA > scoreB ? 1 : 0;

  const baseDelta = K_FACTOR * (actualA - expectedA);

  const margin = Math.abs(scoreA - scoreB);
  const marginFactor = Math.min(MAX_MARGIN_FACTOR, 1 + margin / MARGIN_NORM);

  const finalDelta = Math.round(baseDelta * marginFactor);

  return {
    winner: actualA === 1 ? 'A' : 'B',
    delta: Math.abs(finalDelta),
    expectedA,
    marginFactor,
  };
}

function applyEloFloor(elo) {
  return Math.max(MIN_ELO, elo);
}

/* Ejemplos verificados a mano (ver CLAUDE.md § ELO):
 * - Equipos iguales (1000 vs 1000), 30-10: expectedA=0.5, baseDelta=16,
 *   margin=20, marginFactor=1.667→capado a 1.5, finalDelta=24.
 * - Equipos iguales, 30-28 (ajustada): margin=2, marginFactor=1.067, finalDelta=17.
 * - Remontada (equipo A de media 950 vs equipo B de media 1050, gana A):
 *   expectedA≈0.36 → baseDelta mayor que si A hubiese sido favorito, premiando la sorpresa
 *   antes incluso de aplicar el factor de margen.
 */
