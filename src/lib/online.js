const KEY = 'pixel-racer.cahiers.v1';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  const room = params.get('room');
  if (!room || !idPattern.test(room)) return null;
  const invite = params.get('invite'), player = params.get('player');
  return {room,invite:tokenPattern.test(invite||'')?invite:null,player:tokenPattern.test(player||'')?player:null};
}
export function savedRooms() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(r=>r && idPattern.test(r.room) && tokenPattern.test(r.token)) : [];
  } catch { return []; }
}
export function remember(entry) {
  const existing = savedRooms();
  localStorage.setItem(KEY,JSON.stringify([{...existing.find(r=>r.room===entry.room),...entry},...existing.filter(r=>r.room!==entry.room)]));
}
export function newToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function roomLink(room, field, token) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({room,...(field ? {[field]:token} : {})}).toString();
  return url.href;
}

export function parsePersonalLink(value, expectedRoom) {
  let url;
  try { url=new URL(value.trim(),'https://pixel-racer.invalid'); } catch { throw new Error('Colle ton lien personnel complet.'); }
  const params=new URLSearchParams(url.hash.slice(1)), room=params.get('room'), player=params.get('player');
  if (!['http:','https:'].includes(url.protocol) || !idPattern.test(room || '') || !tokenPattern.test(player || '')) throw new Error('Il faut ton lien personnel, obtenu avec « Garder mon lien personnel », et non le lien d’invitation.');
  if(expectedRoom && room!==expectedRoom)throw new Error('Ce lien personnel appartient à un autre cahier.');
  return {room,player};
}

// Only an explicit authorization failure can lead to a join/recovery form.
// A failed connection must never make an existing player appear to be new.
export function resumeView(error, entry, personalLink=false) {
  if(error.status===401 || error.status===403)return entry.invite && !entry.joined && !personalLink ? 'join' : 'recover';
  return 'error';
}
export async function roomRequest(room, token, body, version) {
  const response = await fetch(`/api/rooms${body ? '' : `?room=${room}${version===undefined?'':`&version=${version}`}`}`,{
    method:body?'POST':'GET', headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
    body:body ? JSON.stringify({...body,room}) : undefined, cache:'no-store', signal:AbortSignal.timeout(15000)
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('Le jeu en ligne n’est pas disponible sur ce déploiement.'); }
  if (!response.ok) { const error = new Error(data.error || 'Connexion impossible.'); error.status=response.status; throw error; }
  return data;
}
