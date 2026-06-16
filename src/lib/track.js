// Logique pure du jeu (géométrie de la piste, inertie, arrivée).
// Aucune dépendance à React → testable en isolation (voir track.test.mjs).

export const ROWS = 40;
export const COLS = 64;
export const OUTER = 'outer';
export const INNER = 'inner';

// Tous les points entiers de la droite (r0,c0)→(r1,c1) (algorithme de Bresenham).
export function bresenham(r0, c0, r1, c1) {
  const pts = [];
  let dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  let sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dr - dc, r = r0, c = c0;
  for (;;) {
    pts.push([r, c]);
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr)  { err += dr; c += sc; }
  }
  return pts;
}

// Les 8 cellules voisines (dans la grille) d'une cellule.
export function neighbors8(r, c) {
  const ns = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) ns.push([nr, nc]);
    }
  return ns;
}

// État d'un bord : vide / fermé / ouvert / branché / déconnecté.
export function analyzeBorder(grid, type) {
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === type) cells.push([r, c]);
  if (cells.length === 0) return { state: 'empty' };

  const visited = new Set();
  const queue = [cells[0]];
  visited.add(cells[0].join(','));
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of neighbors8(r, c)) {
      const key = `${nr},${nc}`;
      if (grid[nr][nc] === type && !visited.has(key)) {
        visited.add(key); queue.push([nr, nc]);
      }
    }
  }
  if (visited.size !== cells.length) return { state: 'disconnected' };

  const endpoints = cells.filter(([r, c]) =>
    neighbors8(r, c).filter(([nr, nc]) => grid[nr][nc] === type).length <= 1
  );
  if (endpoints.length === 0) return { state: 'closed' };
  if (endpoints.length === 2) return { state: 'open', endpoints };
  return { state: 'branched', endpoints };
}

// Cellule du type donné la plus proche de (r,c).
export function nearestOfType(grid, type, r, c) {
  let best = null, bestDist = Infinity;
  for (let nr = 0; nr < ROWS; nr++)
    for (let nc = 0; nc < COLS; nc++)
      if (grid[nr][nc] === type) {
        const d = (nr - r) ** 2 + (nc - c) ** 2;
        if (d < bestDist) { bestDist = d; best = [nr, nc]; }
      }
  return best;
}

// Cellules atteignables depuis le coin (0,0) sans franchir un bord = extérieur.
export function computeExterior(grid) {
  const ext = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const isWall = (r, c) => grid[r][c] === OUTER || grid[r][c] === INNER;
  const stack = [];
  if (!isWall(0, 0)) { ext[0][0] = true; stack.push([0, 0]); }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (ext[nr][nc] || isWall(nr, nc)) continue;
      ext[nr][nc] = true; stack.push([nr, nc]);
    }
  }
  return ext;
}

// Une cellule est roulable si elle est dans le circuit et n'est pas un bord.
export function cellDrivable(grid, ext, r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
  if (grid[r][c] === OUTER || grid[r][c] === INNER) return false;
  return !ext[r][c];
}

// Un nœud (coin de cellule) est sur la piste s'il touche une cellule roulable.
export function nodeOnTrack(grid, ext, r, c) {
  for (const [cr, cc] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]])
    if (cellDrivable(grid, ext, cr, cc)) return true;
  return false;
}

// Le déplacement en ligne droite entre deux nœuds reste-t-il sur la piste ?
export function pathClear(grid, ext, ar, ac, br, bc) {
  if (!nodeOnTrack(grid, ext, br, bc)) return false;
  const dist = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
  const steps = Math.max(1, Math.ceil(dist * 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pr = ar + (br - ar) * t;
    const pc = ac + (bc - ac) * t;
    const cr = Math.min(ROWS - 1, Math.max(0, Math.floor(pr - 1e-6)));
    const cc = Math.min(COLS - 1, Math.max(0, Math.floor(pc - 1e-6)));
    if (!cellDrivable(grid, ext, cr, cc)) return false;
  }
  return true;
}

// Nœud le plus avancé vers la cible qui reste sur la piste (point de sortie).
export function lastClearNode(grid, ext, ar, ac, br, bc) {
  const line = bresenham(ar, ac, br, bc);
  let best = { r: ar, c: ac };
  for (const [r, c] of line) {
    if (r === ar && c === ac) continue;
    if (pathClear(grid, ext, ar, ac, r, c)) best = { r, c };
    else break;
  }
  return best;
}

function ccw(ax, ay, bx, by, cx, cy) {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

// Intersection stricte de deux segments [a,b] et [c,d] (nœuds [r,c] ; x=c, y=r).
export function segmentsIntersect(a, b, c, d) {
  const d1 = ccw(c[1], c[0], d[1], d[0], a[1], a[0]);
  const d2 = ccw(c[1], c[0], d[1], d[0], b[1], b[0]);
  const d3 = ccw(a[1], a[0], b[1], b[0], c[1], c[0]);
  const d4 = ccw(a[1], a[0], b[1], b[0], d[1], d[0]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

// Distance d'un nœud p={r,c} au segment [a,b] (a,b = [r,c]).
export function pointSegDist(p, a, b) {
  const px = p.c, py = p.r, ax = a[1], ay = a[0], bx = b[1], by = b[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Mélange (Fisher-Yates) — pour l'ordre de jeu aléatoire.
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Coups possibles depuis (pos) avec point précédent (prev) : point symétrique
// C = 2*pos - prev (ou pos elle-même en 1re vitesse), puis les 9 cases 3×3.
// Renvoie [{r,c,crash}] en excluant hors-grille et nœuds occupés.
export function computeCandidates({ grid, ext, pos, prev, firstGear, occupied = [] }) {
  const center = (prev == null || firstGear)
    ? { r: pos.r, c: pos.c }
    : { r: 2 * pos.r - prev.r, c: 2 * pos.c - prev.c };
  const list = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const tr = center.r + dr, tc = center.c + dc;
      if (tr < 0 || tr > ROWS || tc < 0 || tc > COLS) continue;
      if (occupied.some(o => o.r === tr && o.c === tc)) continue;
      list.push({ r: tr, c: tc, crash: !pathClear(grid, ext, pos.r, pos.c, tr, tc) });
    }
  return list;
}
