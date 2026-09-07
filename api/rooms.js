import { supabaseStore } from '../server/store.js';
import { makeHandler } from '../server/handler.js';

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
export default makeHandler({
  store:url && secret ? supabaseStore(url,secret) : null,
  secret,
  enabled:process.env.MULTIPLAYER_ENABLED === 'true' && !!url && !!secret
});
