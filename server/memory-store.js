// Local tests only. Production api/rooms.js always uses Supabase.
export function memoryStore() {
  const rooms = new Map(), limits = new Map();
  return {
    async get(id) {return structuredClone(rooms.get(id) || null);},
    async insert(room) {
      if(rooms.has(room.id)) {const error=new Error('Conflict');error.status=409;throw error;}
      rooms.set(room.id,structuredClone(room));return structuredClone(room);
    },
    async save(room,version) {
      if(rooms.get(room.id)?.version!==version)return null;
      rooms.set(room.id,structuredClone(room));return structuredClone(room);
    },
    async limit(key,maximum,seconds) {
      let counter=limits.get(key);
      if(!counter || counter.expires<=Date.now())counter={hits:0,expires:Date.now()+seconds*1000};
      counter.hits++;limits.set(key,counter);return counter.hits<=maximum;
    }
  };
}
