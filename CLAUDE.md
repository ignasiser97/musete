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
│   ├── supabase.js           # cliente Supabase + helpers de acceso a datos + escHtml()/buildAvatarElement()
│   ├── elo.js                # fórmula de ELO (funciones puras)
│   ├── players.js             # pestaña Jugadores
│   ├── leaderboard.js         # pestaña Clasificación
│   ├── matches.js             # pestaña Registrar + feed de últimas partidas en Inicio
│   ├── history.js             # pestaña Historial (todas las partidas, filtro por jugador)
│   ├── playerdetail.js         # modal de detalle de jugador (nombre editable, foto, gráfica de ELO, curiosidades, sus partidas)
│   ├── pairings.js            # pestaña Emparejar (3 modos)
│   └── app.js                 # router switchTab(), SW, pull-to-refresh — último <script>
└── .github/workflows/deploy.yml
```

Orden de `<script>` en `index.html` es significativo: cada archivo define funciones/variables globales que los siguientes usan; `app.js` va siempre el último porque arranca la app al cargarse.

## Datos — jugadores y partidos

- `players.matches_played` es un contador denormalizado = `wins + losses`, mantenido a mano en cada `updatePlayer()` (no hay trigger en BD).
- `matches.score_a`/`score_b` son **sets ganados** por cada equipo, no puntos/piedras — el formato de la partida (al mejor de 3, de 5, u otro) puede variar de una ronda a otra, la app no lo fuerza.
- `matches.played_at` es la hora **de la partida** (editable en el formulario de Registrar, por defecto "ahora" pero se puede corregir si se apunta más tarde); `matches.created_at` sigue siendo la hora en la que se **insertó** la fila, y es la que se usa para ordenar Inicio/Historial/modal de jugador y para decidir cuál es "la partida más reciente" a efectos de Editar/Borrar (ver más abajo). `played_at` solo se **muestra** en la fila, no reordena nada — si se cambia manualmente a una hora anterior a la real de inserción, la fila seguirá apareciendo en su sitio por orden de registro, no por la hora que se le haya puesto.
- `matches.score_a != score_b` siempre — el mus no tiene empates, se valida en el formulario (`validateMatchForm` en `matches.js`).
- `elo_history` guarda `elo_before`/`elo_after`/`delta` por jugador y partida. Alimenta dos cosas: la gráfica de evolución de ELO del modal de detalle de jugador (`playerdetail.js`), y los botones "✏️ Editar"/"🗑️ Borrar" de `matches.js`.
- **Editar/borrar partida**: solo está disponible en la **partida más reciente de toda la app por orden de inserción** (`created_at`, no `played_at` — los botones ✏️/🗑️ solo aparecen en esa fila, en Inicio/Historial/modal de jugador). Ambos comparten `revertMatchEffects()`: revierte el `elo`/`wins`/`losses`/`matches_played` de los 4 jugadores a partir de sus filas de `elo_history` (usa `elo_before` directamente, no resta el `delta` a mano) y borra la fila de `matches` (cascade sobre sus 4 filas de `elo_history`). "Editar" además precarga el formulario de Registrar con los mismos jugadores/marcador para corregirlo rápido; "Borrar" simplemente refresca la pestaña actual. Deliberadamente **no** se permite tocar partidas antiguas: hacerlo bien exigiría recalcular en cadena el ELO de todas las partidas posteriores de esos 4 jugadores, lo cual no está implementado.
- `matches.recorded_by` siempre se inserta a `null` — no hay mecanismo de identidad de usuario en la app (se quitó por no aportar nada: nadie consultaba quién había apuntado cada partida). La columna se deja en el esquema por si se retoma en el futuro.
- `players.avatar_url` (nullable) — foto de perfil opcional, ver sección "Storage — fotos de perfil" más abajo.

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
  avatar_url text,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  played_at timestamptz not null default now(),
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

Si el proyecto ya existía antes de añadir `played_at`/`avatar_url`, faltan por aplicar:
```sql
alter table matches add column played_at timestamptz not null default now();
alter table players add column avatar_url text;
```

**RLS** (configurar manualmente en el dashboard tras crear las tablas, no versionado en el repo):
- Rol `anon`: `SELECT` en `players`, `matches`, `elo_history`.
- Rol `anon`: `INSERT`/`UPDATE` en `players`, `matches`, `elo_history`.
- Rol `anon`: `DELETE` en `matches` — necesario para los botones "✏️ Editar"/"🗑️ Borrar" (`deleteMatch()` en `supabase.js`), que borran la última partida. En teoría no hace falta política de `DELETE` en `elo_history` (el `on delete cascade` de la FK debería aplicarse sin pasar por RLS de la tabla referenciada); si al probar esos botones da error de permisos en `elo_history`, añadir la misma política ahí también.

Ejemplo de política a añadir en el SQL editor si el proyecto ya existía sin ella:
```sql
create policy "anon delete matches" on matches for delete to anon using (true);
```

**Storage — fotos de perfil**: bucket `avatars` (público), usado por `uploadAvatar()`/`buildAvatarElement()` en `supabase.js`. Setup completo en el SQL editor:
```sql
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "anon upload avatars" on storage.objects
  for insert to anon with check (bucket_id = 'avatars');
create policy "anon update avatars" on storage.objects
  for update to anon using (bucket_id = 'avatars');
```
El nombre de fichero es el `id` del jugador (`{id}.jpg`) con `upsert: true` — subir una foto nueva siempre sustituye a la anterior, sin dejar huérfanas en el bucket. La foto se redimensiona a un cuadrado de 300×300 con `<canvas>` en el propio navegador antes de subirla (`resizeImageToBlob()` en `playerdetail.js`), para no gastar de más en datos/Storage con una foto de cámara sin comprimir. No hay botón de "quitar foto" — solo subir/sustituir; sin foto se muestra un círculo con la inicial del nombre (`buildAvatarElement()`).

Secrets de GitHub (`Settings → Secrets and variables → Actions`) a configurar **antes** del primer deploy: `SUPABASE_URL`, `SUPABASE_KEY` (anon/public). Si faltan, el `sed` del workflow no sustituye nada y se publican los placeholders `%%...%%` literales en producción.

## ELO — fórmula

Constantes (`js/elo.js`, fáciles de ajustar):

```
STARTING_ELO      = 1000
K_FACTOR          = 32
MAX_MARGIN_FACTOR = 1.5    // techo para que un resultado exagerado no dispare el ranking
MIN_ELO           = 100
```

El resultado que se registra son **sets ganados** (`score_a`/`score_b`), no puntos, y el formato de la partida (mejor de 3, de 5...) puede cambiar de una ronda a otra. Por eso el margen no se mide como diferencia absoluta de sets, sino como proporción de sets ganados (`winRatio`) — así un 2-0 (mejor de 3) y un 3-0 (mejor de 5) pesan lo mismo (ambos son un paseíllo completo), y un 2-1 pesa parecido a un 3-2 (ambos son el margen mínimo posible).

1. `teamRating` = media de ELO de sus 2 jugadores.
2. `expectedA = 1 / (1 + 10^((teamBRating - teamARating) / 400))` (Elo estándar).
3. `actualA = scoreA > scoreB ? 1 : 0`.
4. `baseDelta = K_FACTOR * (actualA - expectedA)`.
5. `winRatio = max(scoreA, scoreB) / (scoreA + scoreB)` — va de "justo más de la mitad" (victoria mínima, ej. 3-2) a 1 (paseíllo, ej. 3-0 o 2-0).
6. `marginFactor = 1 + (winRatio - 0.5) * 2 * (MAX_MARGIN_FACTOR - 1)` — mapea `winRatio` 0.5→1 (sin bonus) y 1→`MAX_MARGIN_FACTOR` (tope).
7. `finalDelta = round(baseDelta * marginFactor)`.
8. Ganadores: `+|finalDelta|`; perdedores: `-|finalDelta|` (con suelo `MIN_ELO`).

Ejemplos verificados (ver comentario al final de `elo.js`):
- Equipos iguales (1000 vs 1000), ganan 2-0 (paseíllo, mejor de 3) → `finalDelta = 24`.
- Equipos iguales, ganan 2-1 (mejor de 3, ajustada) → `finalDelta = 19`.
- Equipos iguales, ganan 3-2 (mejor de 5, al límite) → `finalDelta = 18`.
- Equipo A (media 950) gana a equipo B (media 1050) 2-0 → `expectedA≈0.36`, recompensa mayor por la sorpresa antes de aplicar el margen; `finalDelta = 31`.

**Nota de integridad**: la actualización no es transaccional (no hay RPC de Postgres) — es un cálculo en cliente seguido de varios `insert`/`update` secuenciales a Supabase. Riesgo de condición de carrera si dos personas envían resultados simultáneamente: bajo dado el contexto (amigos turnándose para apuntar), aceptado para el MVP. Posible mejora futura: función `record_match()` en Postgres llamada vía `supabase.rpc()` envolviendo todo en una transacción.

**Aviso de posible duplicado**: antes de insertar, `handleSubmitMatch` compara contra la última partida registrada (`isDuplicateOfLast` en `matches.js`) — mismos 4 jugadores (da igual el orden o qué equipo es A/B) y mismo marcador (incluyendo el caso de equipos intercambiados con marcador espejado). Si coincide, salta un `confirm()` antes de seguir. Pensado para el caso típico de que dos personas apunten el mismo resultado casi a la vez sin saberlo; no bloquea el envío, solo avisa, y si la comprobación falla (p.ej. sin conexión) se deja pasar sin más.

## Emparejamientos — algoritmos

`js/pairings.js`. Dado el conjunto de presentes (`N`): `sitOutCount = N % 4`, `tableCount = floor(N/4)`. Si `N < 4`, se avisa y no se genera nada.

- **Aleatorio puro**: Fisher-Yates sobre los presentes; los primeros `sitOutCount` del shuffle descansan (también al azar); el resto se trocea en grupos de 4.
- **Sin repetir**: descansan primero quienes menos `matches_played` llevan (rotación justa, con desempate al azar). Con el historial de `matches` de la semana se construyen matrices de veces-como-compañero y veces-como-rival. Fase A: se forman parejas minimizando repetición de compañero (heurística greedy). Fase B: se emparejan las parejas resultantes en mesas minimizando repetición de rival.
- **Equilibrado por ELO**: mismo criterio de descanso que "sin repetir". Se ordena por ELO y se empareja en "serpiente" (1º con último, 2º con penúltimo…) para formar equipos de nivel parejo; luego se emparejan mesas por ELO combinado más cercano.

Las 3 son heurísticas greedy documentadas, no solvers óptimos — suficiente para grupos de 8-16 amigos. El botón "Regenerar" vuelve a ejecutar el mismo modo (los empates aleatorios producen resultados distintos en cada click).

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
