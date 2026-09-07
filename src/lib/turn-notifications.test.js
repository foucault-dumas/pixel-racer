import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnObserver, createPenAudio, SOUND_KEY } from './turn-notifications.js';

const state=(active=0,turns=0,phase='playing')=>({
  id:'room',me:0,race:{active,phase,players:[{id:0,turns},{id:1,turns:0}]}
});
test('turn alerts fire once, including placement followed by the first move',()=>{
  const observer=createTurnObserver();
  assert.equal(observer.observe({id:'room',me:0,race:null}),false);
  assert.equal(observer.observe(state(0,0,'placement')),true);
  assert.equal(observer.observe(state()),false); // Kept the pen after placing.
  assert.equal(observer.observe(state()),false); // Repeated polling.
  assert.equal(observer.observe({unchanged:true}),false);
  assert.equal(observer.observe(state(1,1)),false);
  assert.equal(observer.observe(state(0,1)),true);
  assert.equal(observer.observe(state(0,1)),false);
  assert.equal(observer.observe(state(0,2,'finished')),false);
});
test('opening a saved turn is silent; a missed round still counts as a new turn',()=>{
  const observer=createTurnObserver();
  assert.equal(observer.observe(null),false); // Not yet loaded.
  assert.equal(observer.observe(state(0,3)),false);
  assert.equal(observer.observe(null),false); // Temporary loss of connection.
  assert.equal(observer.observe(state(0,3)),false);
  assert.equal(observer.observe(state(0,4)),true); // Other device played between reads.
});

function audioFixture(saved=null,{blocked=false}={}) {
  const storage=new Map(saved===null?[]:[[SOUND_KEY,saved]]);
  const stats={created:0,played:0,stopped:0};
  class AudioContext {
    constructor(){stats.created++;this.state='suspended';this.sampleRate=48000;}
    async resume(){if(blocked)throw new Error('NotAllowedError');this.state='running';}
    async close(){this.state='closed';}
    createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){return {connect(){},disconnect(){},start(){stats.played++;},stop(){stats.stopped++;}};}
  }
  const env={AudioContext,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)}};
  return {audio:createPenAudio(env),stats,storage,env};
}
test('audio defaults on, unlocks only on request, and keeps mute after reopening',async()=>{
  const {audio,stats,storage,env}=audioFixture();
  assert.equal(audio.enabled,true);assert.equal(stats.created,0);
  assert.equal(audio.play(),false); // No automatic attempt before a gesture.
  assert.equal(await audio.unlock(),true);
  assert.equal(audio.play(),true);assert.equal(stats.played,1);
  audio.setEnabled(false);
  assert.equal(stats.stopped,1);
  assert.equal(audio.play(),false);assert.equal(storage.get(SOUND_KEY),'off');
  const reopened=createPenAudio(env);
  assert.equal(reopened.enabled,false);assert.equal(await reopened.unlock(),false);
  assert.equal(stats.created,1);
  audio.setEnabled(true);assert.equal(audio.play(),true);
  audio.dispose();
});
test('browser audio blocking is silent and cannot break the game',async()=>{
  const {audio,stats}=audioFixture(null,{blocked:true});
  assert.equal(await audio.unlock(),false);
  assert.equal(audio.play(),false);assert.equal(stats.played,0);
  const unsupported=createPenAudio({});
  assert.equal(unsupported.enabled,true);
  assert.equal(await unsupported.unlock(),false);
  assert.equal(unsupported.play(),false);
  unsupported.setEnabled(false);
  assert.equal(unsupported.enabled,false); // Works even if saving preferences fails.
});
