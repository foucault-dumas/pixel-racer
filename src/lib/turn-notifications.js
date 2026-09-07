export const SOUND_KEY = 'pixel-racer.turn-sound.v1';

export function turnKey(snapshot) {
  const race=snapshot?.race, player=race?.players[race.active];
  if(!player || !['placement','playing'].includes(race.phase) || player.id!==snapshot.me)return null;
  // Placement and the first move belong to the same turn (turns remains zero).
  return `${snapshot.id}:${snapshot.me}:${player.turns}`;
}

export function createTurnObserver() {
  let initialized=false, previous=null;
  return {
    observe(snapshot) {
      if(!snapshot || snapshot.unchanged)return false;
      const key=turnKey(snapshot);
      const arrived=initialized && key!==null && key!==previous;
      initialized=true;previous=key;
      return arrived;
    }
  };
}

// A short, quiet approximation of a retractable four-colour pen mechanism.
// Generated locally; no audio download, tracker or additional dependency.
export function penClickSamples(rate) {
  const samples=new Float32Array(Math.ceil(rate*.075));
  let seed=48271, previousNoise=0;
  for(let i=0;i<samples.length;i++) {
    const t=i/rate;
    seed=(seed*16807)%2147483647;
    const noise=seed/2147483647*2-1;
    const envelope=Math.exp(-t/.0035)+(t>=.023 ? .5*Math.exp(-(t-.023)/.005) : 0);
    samples[i]=.14*envelope*(.55*(noise-previousNoise*.75)+.3*Math.sin(2*Math.PI*1900*t));
    previousNoise=noise;
  }
  return samples;
}

export function createPenAudio(environment=globalThis) {
  let enabled=true, context=null, buffer=null, unlocking=null;
  const sources=new Set();
  try {enabled=environment.localStorage.getItem(SOUND_KEY)!=='off';} catch { /* Default on even without storage. */ }
  function stop() {
    for(const source of sources){try{source.stop();}catch{/* Already ended. */}}
    sources.clear();
  }
  return {
    get enabled(){return enabled;},
    setEnabled(value) {
      enabled=value;
      try {environment.localStorage.setItem(SOUND_KEY,value?'on':'off');} catch { /* Keep the choice for this page. */ }
      if(!value)stop();
    },
    async unlock() {
      if(!enabled)return false;
      if(unlocking)return unlocking;
      try {
        if(!context) {
          const Audio=environment.AudioContext || environment.webkitAudioContext;
          if(!Audio)return false;
          context=new Audio();
        }
        if(context.state!=='running') {
          unlocking=context.resume();
          await unlocking;
        }
        return context.state==='running';
      } catch {return false;}
      finally {unlocking=null;}
    },
    play() {
      // Do not queue a missed alert for the next gesture or force background
      // playback: Safari may suspend audio until another user interaction.
      if(!enabled || context?.state!=='running')return false;
      try {
        if(!buffer) {
          const samples=penClickSamples(context.sampleRate);
          buffer=context.createBuffer(1,samples.length,context.sampleRate);
          buffer.getChannelData(0).set(samples);
        }
        const source=context.createBufferSource();
        source.buffer=buffer;source.connect(context.destination);
        source.onended=()=>{sources.delete(source);source.disconnect();};
        sources.add(source);source.start();return true;
      } catch {return false;}
    },
    dispose() {
      stop();
      if(context)context.close().catch(()=>{});
      context=null;buffer=null;
    }
  };
}
