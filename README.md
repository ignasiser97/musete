# 🃏 Musete

> PWA para llevar el ranking ELO de una peña de mus durante una semana de playa.

## ¿Qué es esto?

Se juega al mus con cartas reales — esta app solo lleva la cuenta: roster de jugadores, resultados de cada partida, clasificación ELO en vivo (¿quién va líder?) y un generador de parejas/emparejamientos para cada ronda, con 3 modos: aleatorio puro, evitando repetir parejas/rivales, o equilibrado por ELO.

## Stack

Vanilla JS/HTML/CSS sin build step, Supabase como backend, GitHub Actions + GitHub Pages para el despliegue. Ver [CLAUDE.md](CLAUDE.md) para el detalle de arquitectura, esquema de datos y la fórmula de ELO.

## Ejecutar en local

```bash
git clone <repo>
cd musete
python3 -m http.server 8765
```

Necesitas un proyecto Supabase propio — ver la sección "Backend — Supabase" en [CLAUDE.md](CLAUDE.md) para el SQL de las tablas y las políticas RLS.

## Despliegue

Automático a GitHub Pages al hacer push a `main`. Configura los secrets `SUPABASE_URL` y `SUPABASE_KEY` en *Settings → Secrets and variables → Actions* antes del primer deploy.

---

*Proyecto personal para amigos, sin ánimo de lucro.*
