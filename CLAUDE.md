# Musete

PWA sin build step para llevar el ranking ELO de una peña de mus durante una semana de playa: roster de jugadores, registro de resultados, clasificación en vivo y generador de parejas/emparejamientos por ronda. El mus se juega con cartas reales — esta app no implementa ninguna regla del juego, solo el resultado.

Arquitectura mirroring el proyecto hermano `mundial` (vanilla JS, sin bundler, Supabase, GitHub Pages).

## Ejecutar en local

```bash
python3 -m http.server 8765
```

`js/supabase.js` contiene los placeholders `%%SUPABASE_URL%%`/`%%SUPABASE_KEY%%`, que solo se sustituyen en el deploy (ver más abajo). Para probar en local con datos reales, edita esas dos líneas temporalmente con los valores de un proyecto Supabase de pruebas y revierte el cambio antes de hacer commit — nunca comites valores reales.

## Estructura de ficheros

```
musete/
├── index.html              # shell SPA + todo el CSS embebido
├── manifest.json            # manifest PWA
├── sw.js                    # service worker (caché offline + banner de actualización)
├── logo.png                 # icono — placeholder generado, sustituir por uno propio
├── js/
│   ├── supabase.js           # cliente Supabase + helpers de acceso a datos
│   ├── identity.js           # "¿quién eres?" — localStorage, sin contraseña
│   ├── elo.js                # fórmula de ELO (funciones puras)
│   ├── players.js             # pestaña Jugadores
│   ├── leaderboard.js         # pestaña Clasificación
│   ├── matches.js             # pestaña Registrar + feed de últimas partidas en Inicio
│   ├── history.js             # pestaña Historial (todas las partidas, filtro por jugador)
│   ├── pairings.js            # pestaña Emparejar (3 modos)
│   └── app.js                 # router switchTab(), SW, pull-to-refresh — último <script>
└── .github/workflows/deploy.yml
```

Orden de `<script>` en `index.html` es significativo: cada archivo define funciones/variables globales que los siguientes usan; `app.js` va siempre el último porque arranca la app al cargarse.

## Datos — jugadores y partidos

- `players.matches_played` es un contador denormalizado = `wins + losses`, mantenido a mano en cada `updatePlayer()` (no hay trigger en BD).
- `matches.score_a != score_b` siempre — el mus no tiene empates, se valida en el formulario (`validateMatchForm` en `matches.js`).
- `elo_history` guarda `elo_before`/`elo_after`/`delta` por jugador y partida — pensada para poder implementar en el futuro un "deshacer última partida" sin recalcular toda la semana (revertir cada jugador por `delta`, borrar la fila de `matches`, que hace cascade sobre sus 4 filas de `elo_history`). No implementado todavía.

## Backend — Supabase

Proyecto Supabase propio de musete (no reutiliza el de `mundial`). Sin `.sql` de migraciones en el repo — ejecutar a mano en el SQL editor del dashboard:

```sql
create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  elo integer not null default 1000,
  wins integer not null default 0,
  losses integer not null default 0,
  matches_played integer not null default 0,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_a_player1 uuid not null references players(id),
  team_a_player2 uuid not null references players(id),
  team_b_player1 uuid not null references players(id),
  team_b_player2 uuid not null references players(id),
  score_a integer not null,
  score_b integer not null,
  elo_delta integer not null,
  recorded_by uuid references players(id)
);

create table elo_history (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id),
  elo_before integer not null,
  elo_after integer not null,
  delta integer not null,
  created_at timestamptz not null default now()
);
```

`js/supabase.js` hace joins nombrados sobre los FK autogenerados (`matches_team_a_player1_fkey`, etc.) — si se recrean las tablas a mano, confirmar que Postgres genera esos mismos nombres de constraint (es el comportamiento por defecto al usar `references` inline).

**RLS** (configurar manualmente en el dashboard tras crear las tablas, no versionado en el repo):
- Rol `anon`: `SELECT` en `players`, `matches`, `elo_history`.
- Rol `anon`: `INSERT`/`UPDATE` en `players`, `matches`, `elo_history`.
- Sin política de `DELETE` (no hay función de borrado en la UI todavía).

Secrets de GitHub (`Settings → Secrets and variables → Actions`) a configurar **antes** del primer deploy: `SUPABASE_URL`, `SUPABASE_KEY` (anon/public). Si faltan, el `sed` del workflow no sustituye nada y se publican los placeholders `%%...%%` literales en producción.

## ELO — fórmula

Constantes (`js/elo.js`, fáciles de ajustar):

```
STARTING_ELO      = 1000
K_FACTOR          = 32
MARGIN_NORM       = 30     // ~ partida típica de mus a 30/40 "buenas"
MAX_MARGIN_FACTOR = 1.5    // techo para que un resultado exagerado no dispare el ranking
MIN_ELO           = 100
```

1. `teamRating` = media de ELO de sus 2 jugadores.
2. `expectedA = 1 / (1 + 10^((teamBRating - teamARating) / 400))` (Elo estándar).
3. `actualA = scoreA > scoreB ? 1 : 0`.
4. `baseDelta = K_FACTOR * (actualA - expectedA)`.
5. `marginFactor = min(MAX_MARGIN_FACTOR, 1 + |scoreA-scoreB| / MARGIN_NORM)`.
6. `finalDelta = round(baseDelta * marginFactor)`.
7. Ganadores: `+|finalDelta|`; perdedores: `-|finalDelta|` (con suelo `MIN_ELO`).

Ejemplos verificados (ver comentario al final de `elo.js`):
- Equipos iguales (1000 vs 1000), 30-10 → `finalDelta = 24`.
- Equipos iguales, 30-28 → `finalDelta = 17`.
- Equipo A (media 950) gana a equipo B (media 1050) → `expectedA≈0.36`, recompensa mayor por la sorpresa antes de aplicar el margen.

**Nota de integridad**: la actualización no es transaccional (no hay RPC de Postgres) — es un cálculo en cliente seguido de varios `insert`/`update` secuenciales a Supabase. Riesgo de condición de carrera si dos personas envían resultados simultáneamente: bajo dado el contexto (amigos turnándose para apuntar), aceptado para el MVP. Posible mejora futura: función `record_match()` en Postgres llamada vía `supabase.rpc()` envolviendo todo en una transacción.

## Emparejamientos — algoritmos

`js/pairings.js`. Dado el conjunto de presentes (`N`): `sitOutCount = N % 4`, `tableCount = floor(N/4)`. Si `N < 4`, se avisa y no se genera nada.

- **Aleatorio puro**: Fisher-Yates sobre los presentes; los primeros `sitOutCount` del shuffle descansan (también al azar); el resto se trocea en grupos de 4.
- **Sin repetir**: descansan primero quienes menos `matches_played` llevan (rotación justa, con desempate al azar). Con el historial de `matches` de la semana se construyen matrices de veces-como-compañero y veces-como-rival. Fase A: se forman parejas minimizando repetición de compañero (heurística greedy). Fase B: se emparejan las parejas resultantes en mesas minimizando repetición de rival.
- **Equilibrado por ELO**: mismo criterio de descanso que "sin repetir". Se ordena por ELO y se empareja en "serpiente" (1º con último, 2º con penúltimo…) para formar equipos de nivel parejo; luego se emparejan mesas por ELO combinado más cercano.

Las 3 son heurísticas greedy documentadas, no solvers óptimos — suficiente para grupos de 8-16 amigos. El botón "Regenerar" vuelve a ejecutar el mismo modo (los empates aleatorios producen resultados distintos en cada click).

## Identidad de usuario

Sin contraseña — grupo cerrado de amigos. `localStorage['musete_user']` guarda `{id, name}` del jugador actual (`CURRENT_PLAYER` en `identity.js`). Se usa para preseleccionar formularios y para rellenar `matches.recorded_by` (trazabilidad sin autenticación real).

## CSS — variables y convenciones

Custom properties en `:root` de `index.html`: `--bg`, `--surface`, `--card`, `--border`, `--text`, `--text-dim`, `--accent`, `--pos`, `--neg`. Mismo naming que `mundial` por velocidad, `--accent` propio (rojo/dorado, distinto del dorado de `mundial`). Tema oscuro único, mobile-first, `clamp()` para tipografía, `env(safe-area-inset-bottom)` para el notch de iOS.

## Service Worker

`sw.js` tiene un `VERSION` que hay que incrementar **en cada deploy** para que los usuarios reciban el banner de actualización — si no se sube, la caché no se invalida y pueden quedarse en una versión vieja toda la semana.

## Flujo de commit

1. Bump de `VERSION` en `sw.js`.
2. `git commit` con prefijo `feat:`/`fix:`.
3. `git push`.

## Notas de seguridad

- La anon key de Supabase se publica intencionadamente en el JS del cliente — el control de acceso real es RLS, configurada en el dashboard.
- No hay validación server-side del cálculo de ELO: el cliente calcula y escribe directamente, mismo modelo de confianza que la quiniela de `mundial` (grupo pequeño y de confianza).
- No hay cola de escritura offline: si falla un `insert`/`update` por falta de conexión, el formulario de Registrar conserva los datos introducidos para reintentar, pero no reintenta automáticamente ni encola el envío.
