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

**Stack**: React 19 + Vite 6 + Tailwind CSS 4 (via `@tailwindcss/vite` plugin — no separate `tailwind.config.js` ou `postcss.config.js`).

**Entry points**: `index.html` → `src/main.jsx` → `src/App.jsx` → `src/components/GameGrid.jsx`

`App.jsx` : shell plein écran sombre (`h-screen flex-col`). `GameGrid.jsx` possède tout — rendu, état éditeur, état de jeu.

## État actuel de l'implémentation

### Éditeur de circuit (`phase === 'editor'`)
- Grille **40×64** cellules, taille de cellule adaptative via `ResizeObserver` (remplit le viewport)
- Zoom manuel −/+ (pas de 3 px/cellule, min 6 px, max 48 px) + bouton "auto" pour revenir au fit
- **Bord extérieur** (orange) et **bord intérieur** (bleu) : dessin cliquer-glisser
- Fermeture automatique d'un bord ouvert via Bresenham entre les deux extrémités
- Validation temps réel : bord fermé ✓ / ouvert / branches / déconnecté
- **Règle des 3 cases** : toute cellule tracée à moins de 4 cases d'un bord opposé est bloquée + message d'erreur animé
- **Ligne d'arrivée** : un clic place automatiquement une ligne SVG entre le bord extérieur le plus proche et le bord intérieur le plus proche (coordonnées nœuds de grille). Débloquée seulement quand les deux bords sont fermés.
- Sélecteur de joueurs 2–6 dans la toolbar

### Phase de placement (`phase === 'placement'`)
- Déclenchée par "🏁 Lancer la partie" (visible quand les deux bords sont fermés ET ligne d'arrivée posée)
- L'ordre de jeu est tiré au sort ; chaque joueur reçoit une couleur fixe (rouge, indigo, jaune, vert, rose, cyan)
- Les nœuds de la ligne de départ s'affichent comme cercles SVG cliquables, tintés de la couleur du joueur actif
- Un clic place la voiture (cercle SVG plein avec numéro de tour)
- Bannière joueur actif au-dessus de la grille + barre de joueurs en bas (chips ordonnées, glow sur joueur actif)
- "← Modifier le circuit" revient à l'éditeur sans effacer le circuit

### Phase de jeu (`phase === 'playing'`)
- Les voitures sont placées ; le premier joueur est actif
- **Mécanique de déplacement non encore implémentée**

## Modèle de données clé

```js
// Coordonnées : nœuds de grille (intersections), pas centres de cellules
// Nœud (r, c) → pixel (c * cellSize, r * cellSize)
// Plage valide : r ∈ [0, ROWS], c ∈ [0, COLS]

// finishLine : { r1, c1, r2, c2 }  — nœuds aux extrémités de la ligne d'arrivée

// player : { color, name, position: {r,c} | null, prevPosition: {r,c} | null }
// players[] est ordonné par tour de jeu (index = ordre de passage)
```

## Couche SVG

Un `<svg>` en `position: absolute` superposé à la grille de cellules gère :
- La ligne d'arrivée (trait fin `#34d399`)
- Les cibles de placement (cercles cliquables avec `pointerEvents: 'all'`)
- Les voitures des joueurs (cercles colorés avec numéro)
- (À venir) Les trajectoires de déplacement : lignes de nœud à nœud

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
