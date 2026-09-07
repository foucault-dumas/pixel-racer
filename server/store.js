import { GameError } from './game.js';

// This module is imported only by the Vercel function, never by the frontend.
export function supabaseStore(url, key) {
  async function request(path, method='GET', body, prefer) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      method, headers:{ apikey:key, ...(key.startsWith('sb_secret_') ? {} : {Authorization:`Bearer ${key}`}),
        'Content-Type':'application/json', ...(prefer ? {Prefer:prefer} : {}) },
      body:body===undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(10_000)
    });
    if (response.status === 409) throw new GameError(409,'Le cahier a changé. Réessaie.');
    if (!response.ok) throw new GameError(503,'Le cahier en ligne est momentanément indisponible. Réessaie dans un instant.');
    return response.status===204 ? null : response.json();
  }
  return {
    async get(id) { return (await request(`pixel_racer_rooms?id=eq.${id}&select=*`))[0] ?? null; },
    async insert(room) { return (await request('pixel_racer_rooms','POST',room,'return=representation'))[0]; },
    async save(room, version) {
      const rows = await request(`pixel_racer_rooms?id=eq.${room.id}&version=eq.${version}`,'PATCH',
        {document:room.document,version:room.version,updated_at:new Date().toISOString()},'return=representation');
      return rows[0] ?? null;
    },
    async limit(key, maximum, seconds) {
      return request('rpc/pixel_racer_rate_limit','POST',{bucket_key:key,max_hits:maximum,window_seconds:seconds});
    }
  };
}
