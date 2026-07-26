// Cálculo de ELO por partida de mus (2 vs 2), ponderado por margen de resultado.
// Funciones puras, sin DOM ni Supabase — fáciles de verificar a mano en consola.

const STARTING_ELO      = 1000;  // rating inicial de un jugador nuevo
const K_FACTOR          = 32;    // sensibilidad del ajuste, igual que el estándar de ajedrez
const MAX_MARGIN_FACTOR = 1.5;   // techo para que un resultado exagerado no dispare el ranking
const MIN_ELO           = 100;   // suelo defensivo

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// scoreA/scoreB: SETS ganados por cada equipo (no puntos) — el formato de la partida
// (al mejor de 3, de 5, o lo que toque esa ronda) puede variar, así que el margen se mide
// como proporción de sets ganados, no como diferencia absoluta: un 2-0 (mejor de 3) pesa
// igual que un 3-0 (mejor de 5) — ambos son un "paseíllo" completo.
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

  // winRatio va de "más de la mitad" (victoria mínima posible, ej. 3-2) a 1 (paseíllo, ej. 3-0).
  // Se mapea linealmente a marginFactor: 0.5 → 1 (sin bonus), 1 → MAX_MARGIN_FACTOR.
  const winRatio = Math.max(scoreA, scoreB) / (scoreA + scoreB);
  const marginFactor = 1 + (winRatio - 0.5) * 2 * (MAX_MARGIN_FACTOR - 1);

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
 * - Equipos iguales (1000 vs 1000), ganan 2-0 (paseíllo, mejor de 3): expectedA=0.5,
 *   baseDelta=16, winRatio=1, marginFactor=1.5 (tope), finalDelta=24.
 * - Equipos iguales, ganan 2-1 (mejor de 3, ajustada): winRatio=0.667, marginFactor=1.167,
 *   finalDelta=19.
 * - Equipos iguales, ganan 3-2 (mejor de 5, al límite): winRatio=0.6, marginFactor=1.1,
 *   finalDelta=18.
 * - Remontada (equipo A de media 950 vs equipo B de media 1050, gana A 2-0):
 *   expectedA≈0.36 → baseDelta mayor que si A hubiese sido favorito, premiando la sorpresa
 *   antes incluso de aplicar el factor de margen; finalDelta=31.
 */
