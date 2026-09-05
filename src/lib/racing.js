// Pure racing rules. Coordinates are notebook intersections, not cell centres.
export const COLS = 64;
export const ROWS = 40;
const EPS = 1e-7;
const TAU = Math.PI * 2;
export const PENS = [
  { color: '#234eac', label: 'Bleu' }, { color: '#c1343d', label: 'Rouge' },
  { color: '#25805c', label: 'Vert' }, { color: '#343743', label: 'Noir' },
  { color: '#8849a0', label: 'Violet' }, { color: '#b06525', label: 'Orange' },
];
export const point = (x, y) => ({ x, y });
export const same = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const sub = (a, b) => point(a.x - b.x, a.y - b.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const mix = (a, b, t) => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const edges = poly => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]);

export function distanceToSegment(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return Math.hypot(p.x - a.x - ab.x * t, p.y - a.y - ab.y * t);
}

// Includes tangencies and overlapping segments: touching a border is a crash.
export function intersection(a, b, c, d) {
  const r = sub(b, a), s = sub(d, c), ca = sub(c, a), den = cross(r, s);
  if (Math.abs(den) < EPS) {
    if (Math.abs(cross(ca, r)) > EPS) return null;
    const len = dot(r, r);
    if (len < EPS) return distanceToSegment(a, c, d) < EPS ? 0 : null;
    const t0 = dot(ca, r) / len, t1 = dot(sub(d, a), r) / len;
    const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
    return lo <= hi + EPS ? lo : null;
  }
  const t = cross(ca, s) / den, u = cross(ca, r) / den;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null;
}

export function inPolygon(p, poly) {
  let inside = false;
  for (const [a, b] of edges(poly)) {
    if (distanceToSegment(p, a, b) < EPS) return false;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const onRoad = (p, track) => p.x >= 0 && p.y >= 0 && p.x <= COLS && p.y <= ROWS &&
  inPolygon(p, track.outer) && !inPolygon(p, track.inner) &&
  edges(track.inner).every(([a, b]) => distanceToSegment(p, a, b) > EPS);

function simplePolygon(poly) {
  if (poly.length < 3) return false;
  const area = edges(poly).reduce((sum, [a, b]) => sum + cross(a, b), 0);
  if (Math.abs(area) < 1) return false;
  for (let i = 0; i < poly.length; i++) {
    if (same(poly[i], poly[(i + 1) % poly.length])) return false;
    const incoming = sub(poly[i], poly[(i + poly.length - 1) % poly.length]);
    const outgoing = sub(poly[(i + 1) % poly.length], poly[i]);
    if (Math.abs(cross(incoming,outgoing)) < EPS && dot(incoming,outgoing) < 0) return false;
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i + 1 || (i === 0 && j === poly.length - 1)) continue;
      if (intersection(poly[i], poly[(i + 1) % poly.length], poly[j], poly[(j + 1) % poly.length]) !== null) return false;
    }
  }
  return true;
}

export function validateTrack(track) {
  for (const [key, label] of [['outer', 'extérieur'], ['inner', 'intérieur']]) {
    if (!simplePolygon(track[key])) return `Le bord ${label} doit former une boucle sans croisement.`;
    if (track[key].some(p => p.x < 1 || p.x > COLS - 1 || p.y < 1 || p.y > ROWS - 1)) return 'Garde les bords à l’intérieur du cahier.';
  }
  if (!track.inner.every(p => inPolygon(p, track.outer))) return 'Le bord intérieur doit être entièrement dans le bord extérieur.';
  for (const [a, b] of edges(track.outer)) for (const [c, d] of edges(track.inner)) {
    if (intersection(a, b, c, d) !== null) return 'Les deux bords ne doivent pas se croiser.';
    if (Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b)) < 3 - EPS) return 'Laisse au moins trois carreaux entre les deux bords.';
  }
  return null;
}

export function presetTrack() {
  return {
    outer: [[12,4],[49,4],[57,9],[60,17],[58,29],[50,35],[15,36],[6,30],[4,19],[6,10]].map(([x,y]) => point(x,y)),
    inner: [[16,12],[45,12],[49,15],[51,21],[47,27],[18,28],[13,24],[12,19]].map(([x,y]) => point(x,y)),
    finish: { a: point(30,4), b: point(30,12) },
    direction: 1,
  };
}

// Axis-aligned cross-sections give exact, clickable lattice start positions.
// Their endpoints are intersections with the actual polygon borders.
export function finishAt(p, track) {
  if (!onRoad(p, track)) return null;
  const candidates = [];
  for (const axis of ['x','y']) {
    const other = axis === 'x' ? 'y' : 'x';
    const hits = [];
    for (const key of ['outer','inner']) for (const [a,b] of edges(track[key])) {
      if ((a[other] > p[other]) === (b[other] > p[other])) continue;
      const t = (p[other] - a[other]) / (b[other] - a[other]);
      hits.push({ p: mix(a,b,t), key });
    }
    hits.sort((a,b) => a.p[axis] - b.p[axis]);
    for (let i = 0; i < hits.length - 1; i++) {
      const a = hits[i], b = hits[i + 1];
      if (a.key === b.key || p[axis] <= a.p[axis] || p[axis] >= b.p[axis]) continue;
      candidates.push({ a: a.key === 'outer' ? a.p : b.p, b: a.key === 'inner' ? a.p : b.p });
    }
  }
  candidates.sort((a,b) => Math.hypot(a.a.x-a.b.x,a.a.y-a.b.y) - Math.hypot(b.a.x-b.b.x,b.a.y-b.b.y));
  return candidates[0] ?? null;
}

export function innerAnchor(track) {
  for (let y = 1; y < ROWS; y += .5) for (let x = 1; x < COLS; x += .5) {
    if (inPolygon(point(x,y),track.inner)) return point(x,y);
  }
  return track.inner[0];
}

export function raceTangent(track) {
  const { a,b } = track.finish;
  // A -> B goes from outside into the hole. In screen coordinates this
  // right-hand normal is the clockwise race direction, even for concave tracks.
  const dx = b.x-a.x, dy = b.y-a.y, len = Math.hypot(dx,dy);
  return point(dy / len * track.direction, -dx / len * track.direction);
}

export function startPositions(track, occupied = []) {
  if (!track.finish) return [];
  const { a,b } = track.finish, tangent = raceTangent(track);
  const taken = p => occupied.some(q => same(p,q));
  // Prefer the first row, then place overflow one square behind it.
  for (let row = 0; row <= 6; row++) {
    const nodes = [];
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) {
      const p = point(x,y), projected = point(x + row*tangent.x,y + row*tangent.y);
      if (distanceToSegment(projected,a,b) < EPS && onRoad(p,track) && !taken(p) && firstBorderHit(p,projected,track) === null) nodes.push(p);
    }
    if (nodes.length) return nodes;
  }
  return [];
}

export function firstBorderHit(a,b,track) {
  let first = null;
  for (const poly of [track.outer,track.inner]) for (const [c,d] of edges(poly)) {
    const t = intersection(a,b,c,d);
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}

export function makeRace(names, random = Math.random) {
  const players = names.map((name,i) => ({ ...PENS[i], id: i, name: name.trim() || `Bic ${PENS[i].label.toLowerCase()}`, position: null, previous: null, velocity: point(0,0), penalty: 0, turns: 0, progress: 0, path: [], crashes: [] }));
  for (let i = players.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i+1));
    [players[i],players[j]] = [players[j],players[i]];
  }
  return { phase: 'placement', players, active: 0, winner: null, message: 'Place ton point sur la ligne de départ.' };
}

export function placePlayer(race,p,track) {
  if (race.phase !== 'placement') return race;
  const options = startPositions(track,race.players.map(player => player.position).filter(Boolean));
  if (!options.some(q => same(p,q))) return { ...race, message: 'Choisis un point libre sur la rangée de départ indiquée.' };
  const players = race.players.map((player,i) => i === race.active ? { ...player, position:p, path:[p] } : player);
  const last = race.active === players.length-1;
  return { ...race, players, active: last ? 0 : race.active+1, phase: last ? 'playing' : 'placement', message: last ? 'C’est parti ! Ton premier déplacement : un carreau maximum.' : 'Au suivant : choisis ta place sur le départ.' };
}

export const naturalPoint = player => point(player.position.x + (player.penalty ? 0 : player.velocity.x), player.position.y + (player.penalty ? 0 : player.velocity.y));
export function choices(player) {
  const center = naturalPoint(player), result = [];
  for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) result.push(point(center.x+dx,center.y+dy));
  return result;
}

export function inspectMove(race,target,track) {
  if (race.phase !== 'playing') return { valid:false, reason:'La course n’a pas encore commencé.' };
  if (!Number.isInteger(target.x) || !Number.isInteger(target.y)) return { valid:false, reason:'Choisis une intersection des carreaux.' };
  const player = race.players[race.active];
  if (!choices(player).some(p => same(p,target))) return { valid:false, reason:player.penalty ? 'En première vitesse : un carreau maximum.' : 'Reporte ton dernier déplacement, puis choisis un des neuf points autour.' };
  if (race.players.some((p,i) => i !== race.active && same(p.position,target))) return { valid:false, reason:'Ce point est déjà occupé. Les traits peuvent se croiser, les voitures non.' };
  const hit = firstBorderHit(player.position,target,track);
  return { valid:true, crash:hit !== null || !onRoad(target,track), hit };
}

function angleDelta(a,b,anchor) {
  const delta = Math.atan2(b.y-anchor.y,b.x-anchor.x) - Math.atan2(a.y-anchor.y,a.x-anchor.x);
  return Math.atan2(Math.sin(delta),Math.cos(delta));
}

// Return a free lattice point on (or just behind) the pre-crash trajectory.
// Never jump forward through a wall, even when the target is back on the track.
function recoveryPoint(player,target,hit,track,others) {
  const steps = Math.max(Math.abs(target.x-player.position.x),Math.abs(target.y-player.position.y))*4;
  for (let step=Math.ceil(steps*(hit ?? 1))-1;step>=0;step--) {
    const p = mix(player.position,target,step/(steps || 1));
    const q = point(Math.round(p.x),Math.round(p.y));
    if (onRoad(q,track) && firstBorderHit(player.position,q,track) === null && !others.some(other => same(other.position,q))) return q;
  }
  return player.position;
}

export function advanceRace(race,target,track) {
  const check = inspectMove(race,target,track);
  if (!check.valid) return { ...race,message:check.reason };
  const player = race.players[race.active], anchor = innerAnchor(track);
  const end = check.crash ? recoveryPoint(player,target,check.hit,track,race.players.filter((_,i) => i!==race.active)) : target;
  const progress = player.progress + angleDelta(player.position,end,anchor)*track.direction;
  const tangent = raceTangent(track), mid = mix(track.finish.a,track.finish.b,.5);
  const before = dot(sub(player.position,mid),tangent), after = dot(sub(end,mid),tangent);
  const finishHit = intersection(player.position,end,track.finish.a,track.finish.b);
  const crossed = finishHit !== null && before <= EPS && after > EPS;
  // Signed winding prevents the initial crossing, backwards laps and oscillation
  // over the finish from awarding a win. Collision checking prevents shortcuts.
  const crossingPoint = finishHit === null ? end : mix(player.position,end,finishHit);
  const progressAtCrossing = player.progress + angleDelta(player.position,crossingPoint,anchor)*track.direction;
  // Remove the angular offset between the actual starting and finishing lanes.
  // Counting winding at the crossing works for long, off-centre finish lines too.
  const angularOffset = angleDelta(player.path[0],crossingPoint,anchor)*track.direction;
  const laps = Math.round((progressAtCrossing-angularOffset)/TAU);
  const won = !check.crash && crossed && laps >= 1;
  const updated = { ...player, position:end, previous:player.position,
    velocity: check.crash ? point(0,0) : sub(end,player.position),
    penalty: check.crash ? 4 : Math.max(0,player.penalty-1), turns:player.turns+1,
    progress, path:[...player.path,end],
    crashes: check.crash ? [...player.crashes,mix(player.position,target,check.hit ?? 0)] : player.crashes };
  return { ...race, players:race.players.map((p,i) => i===race.active ? updated:p),
    active:won ? race.active : (race.active+1)%race.players.length, winner:won ? player.id:null, phase:won ? 'finished':'playing',
    message: won ? `${player.name} a gagné en ${updated.turns} coups !` : check.crash ? `${player.name} : sortie de piste ! Quatre prochains coups en première vitesse.` : `${player.name} a joué. Au suivant !` };
}
