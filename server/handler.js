import { createHmac } from 'node:crypto';
import { GameError, fail, hash, validId, validToken, createRoom, transition, snapshot } from './game.js';

export function makeHandler({store,secret,enabled=true}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if (!enabled) fail(503,'Le jeu en ligne n’est pas encore activé. Le cahier local reste disponible.');
      if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow','GET, POST'); fail(405,'Méthode non autorisée.'); }
      // Browser requests must be same-origin. Bearer credentials (no cookies)
      // also prevent cross-site form submissions from acting as a player.
      const origin = req.headers.origin;
      if (origin) {
        let originHost;
        try { originHost = new URL(origin).host; } catch { fail(403,'Origine non autorisée.'); }
        if (originHost !== req.headers.host) fail(403,'Origine non autorisée.');
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403,'Origine non autorisée.');
      const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      if (!validToken(token)) fail(401,'Rouvre ton lien personnel ou rejoins avec une invitation.');
      // On Vercel this header is overwritten by the trusted edge, unlike XFF.
      const ip = req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      const bucket = createHmac('sha256',secret).update(String(ip)).digest('hex');
      if (!await store.limit(`traffic:${bucket}`,180,60)) fail(429,'Trop de requêtes. Attends une minute.');
      if (req.method === 'GET') {
        if (!validId(req.query.room)) fail(400,'Lien de partie invalide.');
        const room = await store.get(req.query.room);
        if (!room) fail(404,'Partie introuvable.');
        const data = snapshot(room,token);
        if(req.query.summary==='1')return res.status(200).json({id:data.id,me:data.me,members:data.members,capacity:data.capacity});
        // Reduce egress while polling a game whose next turn may be hours away.
        return res.status(200).json(String(room.version)===req.query.version ? {unchanged:true,version:room.version} : data);
      }
      if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'Le format JSON est requis.');
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || Array.isArray(body) || Buffer.byteLength(JSON.stringify(body)) > 32_768) fail(413,'Requête trop volumineuse.');
      if (!validId(body.room)) fail(400,'Lien de partie invalide.');
      if (!await store.limit(`write:${bucket}`,60,60)) fail(429,'Trop de coups rapprochés. Attends une minute.');
      if (body.action === 'create') {
        const existing = await store.get(body.room);
        if (existing) return res.status(200).json(snapshot(existing,token));
        if (!await store.limit(`create:${bucket}`,10,3600)) fail(429,'Dix nouveaux cahiers par heure maximum. Réessaie plus tard.');
        const room = createRoom(body,token);
        try { return res.status(201).json(snapshot(await store.insert(room),token)); }
        catch (error) {
          if (error.status !== 409) throw error;
          return res.status(200).json(snapshot(await store.get(body.room),token));
        }
      }
      if (['join','invitation'].includes(body.action) && !await store.limit(`join:${bucket}`,30,3600)) fail(429,'Trop de tentatives pour rejoindre. Réessaie plus tard.');
      const room = await store.get(body.room);
      if (!room) fail(404,'Partie introuvable.');
      if(body.action==='invitation') {
        if(!validToken(body.invite) || hash(body.invite)!==room.invite_hash)fail(403,'Invitation invalide.');
        // Invitation holders can learn whether joining is possible, without
        // seeing players, moves, the track or any membership credentials.
        return res.status(200).json({canJoin:!room.document.race && room.document.members.length<room.document.capacity});
      }
      const next = transition(room,body,token);
      if (next === room) return res.status(200).json(snapshot(room,token));
      const saved = await store.save(next,room.version);
      if (!saved) fail(409,'Un autre Bic a joué ou rejoint. Actualise puis réessaie.');
      return res.status(200).json(snapshot(saved,token));
    } catch (error) {
      const status = error instanceof GameError ? error.status : error instanceof SyntaxError ? 400 : 503;
      return res.status(status).json({error:error instanceof GameError ? error.message : status===400 ? 'JSON invalide.' : 'Connexion au cahier impossible. Réessaie sans fermer cette page.'});
    }
  };
}
