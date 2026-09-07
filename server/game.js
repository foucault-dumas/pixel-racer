import { createHash, randomInt } from 'node:crypto';
import { COLS, ROWS, validateTrack, finishAt, same, startPositions, makeRace, placePlayer, advanceRace } from '../src/lib/racing.js';

export class GameError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new GameError(status, message); };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const coord = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= COLS * 3 && Math.abs(p.y) <= ROWS * 3;
function nameOf(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 20 || [...name].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127)) fail(400, 'Choisis un prénom de 1 à 20 caractères.');
  return name.trim();
}
export function cleanTrack(input, capacity) {
  if (!input || ![1, -1].includes(input.direction)) fail(400, 'Sens de course invalide.');
  for (const key of ['outer', 'inner']) {
    if (!Array.isArray(input[key]) || input[key].length < 3 || input[key].length > 256 || !input[key].every(coord)) fail(400, 'Circuit invalide (256 sommets maximum par bord).');
  }
  const track = { outer: input.outer.map(({x,y})=>({x,y})), inner: input.inner.map(({x,y})=>({x,y})), direction: input.direction };
  const error = validateTrack(track);
  if (error) fail(400, error);
  if (!coord(input.finish?.a) || !coord(input.finish?.b)) fail(400, 'Ligne de départ manquante.');
  const {a,b} = input.finish;
  const canonical = finishAt({x:(a.x+b.x)/2,y:(a.y+b.y)/2},track);
  if (!canonical || !same(a,canonical.a) || !same(b,canonical.b)) fail(400, 'La ligne de départ doit relier les deux bords.');
  track.finish = canonical;
  const occupied = [];
  for (let i=0;i<capacity;i++) {
    const p = startPositions(track,occupied)[0];
    if (!p) fail(400, 'Ce départ ne laisse pas assez de places pour tous les Bics.');
    occupied.push(p);
  }
  return track;
}
export function memberOf(room, token) {
  if (!validToken(token)) fail(401, 'Rouvre ton lien personnel ou rejoins avec une invitation.');
  const member = room.document.members.find(p=>p.tokenHash === hash(token));
  if (!member) fail(403, 'Ce Bic n’appartient pas à cette partie.');
  return member;
}
export function snapshot(room, token) {
  const me = memberOf(room,token);
  const {track,capacity,race,members} = room.document;
  return { id:room.id, version:room.version, track, capacity, race, me:me.id,
    members:members.map(({id,name})=>({id,name})), updatedAt:room.updated_at };
}
export function createRoom(body, token) {
  if (!validId(body.room) || !validToken(token) || !validToken(body.invite)) fail(400, 'Identifiants invalides.');
  if (!Number.isInteger(body.capacity) || body.capacity < 2 || body.capacity > 6) fail(400, 'La course accueille 2 à 6 joueurs.');
  return { id:body.room, version:0, invite_hash:hash(body.invite), document:{
    capacity:body.capacity, track:cleanTrack(body.track,body.capacity), race:null,
    members:[{id:0,name:nameOf(body.name),tokenHash:hash(token)}], receipts:[]
  }};
}

// Every transition is computed on the server. The repository must then commit
// with WHERE version = oldVersion; never save a client-supplied race or player ID.
export function transition(room, body, token) {
  if (!validToken(token) || !validId(body.requestId)) fail(400, 'Requête invalide.');
  const doc = room.document;
  const tokenHash = hash(token);
  if (doc.receipts.some(r=>r.id===body.requestId && r.tokenHash===tokenHash)) return room;
  const member = doc.members.find(p=>p.tokenHash===tokenHash);
  if (body.action === 'join' && member) return room;
  if (body.action !== 'join') memberOf(room,token);
  if (body.version !== room.version && body.action !== 'join') fail(409, 'Le cahier a changé. Relis-le avant de jouer.');
  const next = structuredClone(room);
  if (body.action === 'join') {
    if (!validToken(body.invite) || hash(body.invite)!==room.invite_hash) fail(403, 'Invitation invalide.');
    if (doc.race) fail(409, 'La course a commencé : les invitations sont fermées.');
    if (doc.members.length >= doc.capacity) fail(409, 'Tous les Bics sont déjà pris.');
    next.document.members.push({id:doc.members.length,name:nameOf(body.name),tokenHash});
  } else if (body.action === 'start') {
    if (member.id !== 0) fail(403, 'Seul le créateur peut lancer la course.');
    if (doc.race || doc.members.length !== doc.capacity) fail(409, 'Attends que tous les Bics aient rejoint le cahier.');
    next.document.race = makeRace(doc.members.map(p=>p.name),()=>randomInt(0,0x1000000)/0x1000000);
  } else if (body.action === 'place' || body.action === 'move') {
    const race = doc.race;
    const phase = body.action === 'place' ? 'placement' : 'playing';
    if (!race || race.phase !== phase) fail(409, 'Cette action n’est pas possible maintenant.');
    if (race.players[race.active].id !== member.id) fail(403, 'Ce n’est pas ton tour.');
    if (!coord(body.point) || !Number.isInteger(body.point.x) || !Number.isInteger(body.point.y)) fail(400, 'Choisis une intersection du cahier.');
    const point = {x:body.point.x,y:body.point.y};
    const updated = (body.action === 'place' ? placePlayer : advanceRace)(race,point,doc.track);
    if (updated.players === race.players) fail(400, updated.message);
    next.document.race = updated;
  } else fail(400, 'Action inconnue.');
  next.document.receipts = [...doc.receipts,{id:body.requestId,tokenHash}].slice(-32);
  next.version++;
  if (JSON.stringify(next.document).length > 1_500_000) fail(409, 'Ce cahier est plein. Créez une nouvelle course.');
  return next;
}
