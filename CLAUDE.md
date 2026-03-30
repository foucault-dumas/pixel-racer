# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Jeu de course sur grille inspiré du jeu papier-crayon. Les règles complètes sont dans `RULES.md` — lire en priorité au début de chaque session.

## Deployment

Le jeu est déployé sur **pixel-racer-six.vercel.app** via Vercel connecté à GitHub. Vercel est l'environnement de test — ne pas utiliser `npm run dev`. Pousser sur `main` déclenche un déploiement automatique.

## Commands

```bash
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

No test framework is configured yet.

## Architecture

**Stack**: React 19 + Vite 6 + Tailwind CSS 4 (via `@tailwindcss/vite` plugin — no separate `tailwind.config.js` or `postcss.config.js`).

**Entry points**: `index.html` → `src/main.jsx` → `src/App.jsx` → `src/components/GameGrid.jsx`

`App.jsx` provides the dark full-screen shell; `GameGrid.jsx` owns all game rendering and will own game state as the project grows.

## Game Rules (from RULES.md)

Pixel Racer is a digital adaptation of the classic paper grid racing game (2–6 players).

**Movement mechanics (inertia-based):**
- Each turn, find the symmetric point of `position[t-2]` relative to `position[t-1]` — that is the "natural" landing point.
- The player may land on that point or any of its 8 adjacent cells (9 choices total).
- First move: max 1 cell in any direction from start.

**Track:**
- Grid with outer and inner borders; minimum track width: 3 cells.
- A single line serves as both start and finish (perpendicular to track borders).
- Going off-track: player restarts with reduced speed (1 cell/turn for 4 turns).

**Win condition:** First player to cross the finish line in the correct direction.

**Visual aid mode:** Optionally highlight the 9 reachable cells each turn.
