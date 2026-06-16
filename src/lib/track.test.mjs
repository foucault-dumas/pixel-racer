// Test de la logique de jeu — exécuter avec : node src/lib/track.test.mjs
import {
  ROWS, COLS, OUTER, INNER,
  computeExterior, cellDrivable, nodeOnTrack, pathClear,
  lastClearNode, segmentsIntersect, pointSegDist, computeCandidates,
} from './track.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error(`  ✗ ${name}`); }
}

// ── Circuit rectangulaire : anneau entre deux rectangles concentriques ──
const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
function rect(type, r0, c0, r1, c1) {
  for (let c = c0; c <= c1; c++) { grid[r0][c] = type; grid[r1][c] = type; }
  for (let r = r0; r <= r1; r++) { grid[r][c0] = type; grid[r][c1] = type; }
}
rect(OUTER, 5, 5, 30, 55);    // bord extérieur
rect(INNER, 12, 15, 23, 45);  // bord intérieur (anneau gauche large d'environ 9 cases)

const ext = computeExterior(grid);

// ── Régions ──────────────────────────────────────────────────────────
check('coin (0,0) est extérieur', ext[0][0] === true);
check('cellule anneau (17,10) roulable', cellDrivable(grid, ext, 17, 10) === true);
check('cellule extérieure (0,0) non roulable', cellDrivable(grid, ext, 0, 0) === false);
check('cellule bord (5,5) non roulable', cellDrivable(grid, ext, 5, 5) === false);
check('nœud (17,10) sur la piste', nodeOnTrack(grid, ext, 17, 10) === true);
check('nœud (0,0) hors piste', nodeOnTrack(grid, ext, 0, 0) === false);

// ── Trajets ──────────────────────────────────────────────────────────
check('trajet anneau (17,10)->(17,12) OK', pathClear(grid, ext, 17, 10, 17, 12) === true);
check('trajet vers infield (17,10)->(17,30) bloqué (traverse bord int.)',
  pathClear(grid, ext, 17, 10, 17, 30) === false);
check('trajet vers extérieur (17,10)->(17,2) bloqué (traverse bord ext.)',
  pathClear(grid, ext, 17, 10, 17, 2) === false);

// ── Point de sortie ──────────────────────────────────────────────────
const landing = lastClearNode(grid, ext, 17, 13, 17, 18); // file vers l'infield
check('lastClearNode reste sur la piste', nodeOnTrack(grid, ext, landing.r, landing.c) === true);
check('lastClearNode ne dépasse pas le bord intérieur', landing.c <= 15);

// ── Coups possibles : inertie ────────────────────────────────────────
// Vecteur (0,+2) : pos (17,10), prev (17,8) → symétrique (17,12)
const cands = computeCandidates({ grid, ext, pos: { r: 17, c: 10 }, prev: { r: 17, c: 8 }, firstGear: false });
check('9 coups proposés autour du point symétrique', cands.length === 9);
check('coups centrés sur le point symétrique (17,12)',
  cands.some(k => k.r === 17 && k.c === 12) &&
  cands.every(k => Math.abs(k.r - 17) <= 1 && Math.abs(k.c - 12) <= 1));
check('coups dans l\'anneau sans sortie', cands.filter(k => !k.crash).length >= 6);

// Coup qui file droit dans le bord intérieur → sortie détectée
const crashCands = computeCandidates({ grid, ext, pos: { r: 17, c: 13 }, prev: { r: 17, c: 10 }, firstGear: false });
const intoWall = crashCands.find(k => k.r === 17 && k.c === 16);
check('coup (17,16) traversant le bord int. = sortie', intoWall && intoWall.crash === true);

// 1re vitesse : centre = position, 8 voisins + sur place
const firstMove = computeCandidates({ grid, ext, pos: { r: 17, c: 10 }, prev: null, firstGear: true });
check('1er coup : 9 cases autour de la position', firstMove.length === 9);
check('1er coup limité à 1 case', firstMove.every(k => Math.abs(k.r - 17) <= 1 && Math.abs(k.c - 10) <= 1));

// Nœud occupé par un adversaire = exclu
const blocked = computeCandidates({ grid, ext, pos: { r: 17, c: 10 }, prev: { r: 17, c: 8 },
  firstGear: false, occupied: [{ r: 17, c: 12 }] });
check('nœud occupé exclu des coups', !blocked.some(k => k.r === 17 && k.c === 12));

// ── Ligne d'arrivée ──────────────────────────────────────────────────
const fA = [17, 5], fB = [17, 15]; // arrivée horizontale en travers de l'anneau gauche
check('franchissement vertical détecté',
  segmentsIntersect([16, 10], [18, 10], fA, fB) === true);
check('déplacement parallèle ne franchit pas',
  segmentsIntersect([16, 10], [16, 13], fA, fB) === false);
check('distance nœud->arrivée ~0 sur la ligne', pointSegDist({ r: 17, c: 10 }, fA, fB) < 0.001);
check('distance nœud->arrivée croît en s\'éloignant', pointSegDist({ r: 25, c: 10 }, fA, fB) > 4);

// ── Simulation d'un pilotage maîtrisé (montée à vitesse constante) ────
// On vise une montée d'1 case/tour : le point (pos.r-1, pos.c) est toujours
// le point symétrique quand la vitesse vaut 1, donc toujours proposé.
let pos = { r: 25, c: 10 }, prev = null, ok = true;
for (let turn = 0; turn < 8 && ok; turn++) {
  const list = computeCandidates({ grid, ext, pos, prev, firstGear: prev == null });
  const safe = list.filter(k => !k.crash);
  if (safe.length === 0) { ok = false; break; }
  const next = safe.find(k => k.r === pos.r - 1 && k.c === pos.c)
            ?? safe.sort((a, b) => a.r - b.r)[0];
  prev = pos; pos = { r: next.r, c: next.c };
}
check('simulation : 8 coups joués sans blocage', ok === true);
check('simulation : la voiture a remonté l\'anneau de 8 cases', pos.r === 17);

console.log(`\n${pass} tests OK, ${fail} échec(s).`);
process.exit(fail ? 1 : 0);
