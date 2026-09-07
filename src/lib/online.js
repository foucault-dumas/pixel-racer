const KEY = 'pixel-racer.cahiers.v1';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[0-9a-f-]{36}$/i;
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
    return Array.isArray(saved) ? saved.filter(r=>idPattern.test(r.room) && tokenPattern.test(r.token)) : [];
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
