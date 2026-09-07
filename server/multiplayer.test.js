import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { makeHandler } from './handler.js';
import { memoryStore } from './memory-store.js';
import { createRoom, cleanTrack } from './game.js';
import { presetTrack, startPositions, choices, inspectMove } from '../src/lib/racing.js';

const token=()=>randomBytes(32).toString('base64url');
function fixture() {
  const store=memoryStore(), handler=makeHandler({store,secret:token()});
  const room=randomUUID(), invite=token(), players=Array.from({length:6},token);
  async function call(action,who=0,extra={},headers={}) {
    const body={action,room,requestId:randomUUID(),...extra};
    const req={method:action==='read'?'GET':'POST',query:{room,...extra},
      headers:{host:'localhost','content-type':'application/json',authorization:`Bearer ${players[who]}`,...headers},
      body,socket:{remoteAddress:'127.0.0.1'}};
    const res={code:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};
    await handler(req,res);return res;
  }
  async function create(capacity=2) {const r=await call('create',0,{invite,name:'Charles',capacity,track:presetTrack()});assert.equal(r.code,201);return r.data;}
  async function join(who) {return call('join',who,{invite,name:`Copain ${who}`});}
  async function setup(capacity=2) {
    await create(capacity);
    for(let i=1;i<capacity;i++)assert.equal((await join(i)).code,200);
    let state=(await call('read')).data;
    state=(await call('start',0,{version:state.version})).data;
    while(state.race.players.some(p=>p.turns===0)) {
      const who=state.race.players[state.race.active].id;
      const p=startPositions(state.track,state.race.players.map(p=>p.position).filter(Boolean))[0];
      const r=await call('place',who,{version:state.version,point:p});
      assert.equal(r.code,200);state=r.data;
      assert.equal(state.race.players[state.race.active].id,who);
      assert.equal((await call('move',(who+1)%capacity,{version:state.version,point:p})).code,403);
      const moved=await call('move',who,{version:state.version,point:p});
      assert.equal(moved.code,200);state=moved.data;
    }
    return state;
  }
  return {store,handler,room,invite,players,call,create,join,setup};
}

test('private state requires membership; snapshots never disclose credentials',async()=>{
  const f=fixture();await f.create();
  assert.equal((await f.call('read',1)).code,403);
  assert.equal((await f.call('read',0,{}, {authorization:''})).code,401);
  const r=await f.call('read');
  assert.equal(r.code,200);
  const text=JSON.stringify(r.data);
  for(const secret of [...f.players,f.invite,'tokenHash','invite_hash','receipts'])assert.equal(text.includes(secret),false);
  assert.equal(r.headers['Cache-Control'],'no-store');
  assert.equal((await f.call('read',0,{version:'0'})).data.unchanged,true);
  assert.equal((await f.call('read',1,{version:'0'})).code,403);
  const summary=await f.call('read',0,{summary:'1'});
  assert.deepEqual(summary.data,{id:f.room,me:0,members:[{id:0,name:'Charles'}],capacity:2});
  assert.equal((await f.call('read',1,{summary:'1'})).code,403);
});

test('invalid invitations, capacity and host authority are enforced',async()=>{
  const f=fixture();await f.create();
  assert.equal((await f.call('join',1,{invite:token(),name:'Intrus'})).code,403);
  assert.equal((await f.call('start',0,{version:0})).code,409);
  assert.equal((await f.join(1)).code,200);
  assert.equal((await f.join(2)).code,409);
  assert.equal((await f.call('start',1,{version:1})).code,403);
  assert.equal((await f.call('start',0,{version:1})).code,200);
  assert.equal((await f.join(2)).code,409);
  // Existing members can reopen their invitation without taking another seat.
  assert.equal((await f.join(1)).code,200);
});

test('simultaneous joins cannot overbook the last Bic',async()=>{
  const f=fixture();await f.create();
  const results=await Promise.all([f.join(1),f.join(2)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
  assert.equal((await f.call('read')).data.members.length,2);
});

test('an invitation can reveal join availability without exposing a private game',async()=>{
  const f=fixture();await f.create();
  assert.equal((await f.call('invitation',1,{invite:token()})).code,403);
  assert.deepEqual((await f.call('invitation',1,{invite:f.invite})).data,{canJoin:true});
  await f.join(1);
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:false});
  await f.call('start',0,{version:1});
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:false});
  assert.equal((await f.call('read',2)).code,403);
});

for(const capacity of [2,6])test(`${capacity} separate credentials can join, place and play asynchronously`,async()=>{
  const f=fixture();let state=await f.setup(capacity);
  const previous=state.version;
  for(let i=0;i<capacity;i++) {
    const active=state.race.players[state.race.active];
    const point=choices(active).find(p=>{const c=inspectMove(state.race,p,state.track);return c.valid&&!c.crash;});
    const r=await f.call('move',active.id,{version:state.version,point});
    assert.equal(r.code,200);state=r.data;
  }
  assert.equal(state.version,previous+capacity);
  // A fresh handler/server instance sees persisted state and the same seat.
  const reader=makeHandler({store:f.store,secret:'another-instance'});
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await reader({method:'GET',headers:{authorization:`Bearer ${f.players[1]}`},query:{room:f.room}},res);
  assert.equal(res.code,200);assert.equal(res.data.me,1);assert.equal(res.data.version,state.version);
});

test('wrong turn, arbitrary coordinates, client race and stale versions cannot change a game',async()=>{
  const f=fixture();const state=await f.setup();
  const active=state.race.players[state.race.active];
  assert.equal((await f.call('move',1-active.id,{version:state.version,point:active.position})).code,403);
  assert.equal((await f.call('move',active.id,{version:state.version,point:{x:999999,y:0}})).code,400);
  assert.equal((await f.call('move',active.id,{version:state.version-1,point:active.position})).code,409);
  assert.equal((await f.call('move',active.id,{version:state.version,point:{x:0.5,y:1},race:{winner:active.id}})).code,400);
  assert.equal((await f.call('read')).data.version,state.version);
});

test('concurrent double submits commit once; lost responses can be retried safely',async()=>{
  const f=fixture(), state=await f.setup();
  const active=state.race.players[state.race.active], requestId=randomUUID();
  const command={version:state.version,point:active.position,requestId};
  const results=await Promise.all([f.call('move',active.id,command),f.call('move',active.id,command)]);
  assert.ok(results.some(r=>r.code===200));
  assert.ok(results.every(r=>[200,409].includes(r.code)));
  const retry=await f.call('move',active.id,command);
  assert.equal(retry.code,200);assert.equal(retry.data.version,state.version+1);
  const after=(await f.call('read')).data;
  assert.equal(after.race.players.find(p=>p.id===active.id).turns,active.turns+1);
});

test('foreign room credentials and cross-origin requests are rejected',async()=>{
  const f=fixture();await f.create();
  assert.equal((await f.call('read',0,{}, {authorization:`Bearer ${token()}`})).code,403);
  assert.equal((await f.call('read',0,{}, {origin:'https://evil.example'})).code,403);
  assert.equal((await f.call('read',0,{}, {'sec-fetch-site':'cross-site'})).code,403);
  assert.equal((await f.call('join',1,{invite:f.invite,name:'Joe'},{'content-type':'text/plain'})).code,415);
  assert.equal((await f.call('join',1,{invite:f.invite,name:'x'.repeat(40000)})).code,413);
});

test('disabled backend fails closed and does not access the database',async()=>{
  const handler=makeHandler({enabled:false});
  const res={setHeader(){},status(code){this.code=code;return this;},json(){}};
  await handler({method:'GET'},res);assert.equal(res.code,503);
});

test('input validation bounds geometry and rejects forged finish lines',()=>{
  const track=presetTrack();
  assert.throws(()=>cleanTrack({...track,outer:Array(257).fill({x:1,y:1})},2),/256/);
  assert.throws(()=>cleanTrack({...track,finish:{a:{x:20,y:20},b:{x:30,y:30}}},2),/départ/);
  assert.throws(()=>createRoom({room:randomUUID(),invite:token(),name:'',capacity:2,track},token()),/prénom/);
  assert.throws(()=>createRoom({room:randomUUID(),invite:token(),name:'A',capacity:7,track},token()),/2 à 6/);
});

test('rate limit is enforced by the shared store before reading private state',async()=>{
  const f=fixture();await f.create();
  const handler=makeHandler({store:{...f.store,limit:async()=>false},secret:token()});
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await handler({method:'GET',headers:{authorization:`Bearer ${f.players[0]}`},query:{room:f.room}},res);
  assert.equal(res.code,429);
});
