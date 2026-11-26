import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { makeHandler } from './handler.js';
import { memoryStore } from './memory-store.js';
import { createRoom, cleanTrack } from './game.js';
import { point, presetTrack, startPositions, raceStartPositions, choices, inspectMove, onRoad } from '../src/lib/racing.js';
import { normalizeTrack, MAX_BORDER_POINTS, MAX_BORDER_SAMPLES, validateTrack } from '../src/lib/racing.js';
import { freehandTrack } from '../test/fixtures/freehand-track.js';

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
      const p=raceStartPositions(state.track,state.race.players)[0];
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

test('online rooms accept page walls and persist a crash and four own penalty moves',async()=>{
  const f=fixture();
  const track={...presetTrack(),outer:[point(0,0),point(64,0),point(64,40),point(0,40)],finish:{a:point(30,0),b:point(30,12)}};
  assert.deepEqual(cleanTrack(track,6),track);
  const created=await f.call('create',0,{invite:f.invite,name:'Charles',capacity:2,track});
  assert.equal(created.code,201);
  await f.join(1);
  let state=(await f.call('start',0,{version:1})).data;
  const driver=state.race.players[state.race.active].id;
  state=(await f.call('place',driver,{version:state.version,point:point(30,1)})).data;
  const crashed=await f.call('move',driver,{version:state.version,point:point(30,0)});
  assert.equal(crashed.code,200);state=crashed.data;
  assert.equal(state.race.players.find(p=>p.id===driver).penalty,4);
  const opponent=1-driver;
  state=(await f.call('place',opponent,{version:state.version,point:point(30,6)})).data;
  for(let remaining=3;remaining>=0;remaining--){
    state=(await f.call('move',opponent,{version:state.version,point:point(30,6)})).data;
    const player=state.race.players.find(p=>p.id===driver);
    assert.equal((await f.call('move',driver,{version:state.version,point:point(player.position.x+2,1)})).code,400);
    const moved=await f.call('move',driver,{version:state.version,point:point(player.position.x+1,1)});
    assert.equal(moved.code,200);state=moved.data;
    const saved=(await f.call('read',driver)).data.race.players.find(p=>p.id===driver);
    assert.equal(saved.penalty,remaining);
    assert.ok(onRoad(saved.position,track));
  }
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

test('the server rejects reuse of a vacated starting place without changing the saved race',async()=>{
  const f=fixture();await f.create();await f.join(1);
  let state=(await f.call('start',0,{version:1})).data;
  const driver=state.race.players[state.race.active].id,start=point(30,7);
  state=(await f.call('place',driver,{version:state.version,point:start})).data;
  const moved=await f.call('move',driver,{version:state.version,point:point(31,7)});
  assert.equal(moved.code,200);state=moved.data;
  const opponent=state.race.players[state.race.active].id;
  const before=await f.store.get(f.room);
  assert.equal((await f.call('place',opponent,{version:state.version,point:start})).code,400);
  assert.deepEqual(await f.store.get(f.room),before);
  const placed=await f.call('place',opponent,{version:state.version,point:point(30,8)});
  assert.equal(placed.code,200);
  assert.equal(placed.data.race.phase,'playing');
  assert.equal(placed.data.race.players[placed.data.race.active].id,opponent);
  const saved=(await f.call('read',opponent)).data.race;
  assert.deepEqual(saved.players.find(p=>p.id===driver).path,[start,point(31,7)]);
  assert.deepEqual(saved.players.find(p=>p.id===opponent).path,[point(30,8)]);
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
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:false,reason:'full'});
  await f.call('start',0,{version:1});
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:false,reason:'started'});
  assert.equal((await f.call('read',2)).code,403);
});

test('a full two-player lobby can expand to four and keep its track, seats and invitation',async()=>{
  const f=fixture();await f.create();await f.join(1);
  const before=await f.store.get(f.room);
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:false,reason:'full'});
  const requestId=randomUUID();
  const expanded=await f.call('capacity',0,{version:1,capacity:4,requestId});
  assert.equal(expanded.code,200);assert.equal(expanded.data.capacity,4);
  const after=await f.store.get(f.room);
  assert.deepEqual(after.document.members,before.document.members);
  assert.deepEqual(after.document.track,before.document.track);
  assert.equal(after.invite_hash,before.invite_hash);
  assert.equal((await f.call('capacity',0,{version:1,capacity:4,requestId})).data.version,2);
  assert.equal((await f.call('read',1)).data.me,1);
  assert.deepEqual((await f.call('invitation',2,{invite:f.invite})).data,{canJoin:true});
  assert.equal((await f.join(2)).code,200);assert.equal((await f.join(3)).code,200);
  assert.equal((await f.join(4)).code,409);
  let state=(await f.call('read')).data;
  const started=await f.call('start',0,{version:state.version});
  assert.equal(started.code,200);state=started.data;
  assert.equal(state.race.players.length,4);
  for(let i=0;i<4;i++){
    const driver=state.race.players[state.race.active].id;
    const p=raceStartPositions(state.track,state.race.players)[0];
    state=(await f.call('place',driver,{version:state.version,point:p})).data;
    const moved=await f.call('move',driver,{version:state.version,point:p});
    assert.equal(moved.code,200);state=moved.data;
  }
  assert.ok(state.race.players.every(p=>p.turns===1));
});

test('only the host can resize before starting, within two to six and without removing anyone',async()=>{
  const f=fixture();await f.create();await f.join(1);
  assert.equal((await f.call('capacity',1,{version:1,capacity:4})).code,403);
  assert.equal((await f.call('capacity',2,{version:1,capacity:4})).code,403);
  for(const capacity of [1,7,2.5,'4',null])assert.equal((await f.call('capacity',0,{version:1,capacity})).code,400);
  assert.equal((await f.call('capacity',0,{version:0,capacity:4})).code,409);
  assert.equal((await f.call('read')).data.version,1);
  assert.equal((await f.call('capacity',0,{version:1,capacity:6})).code,200);
  assert.equal((await f.call('capacity',0,{version:2,capacity:3})).code,200);
  await f.join(2);
  assert.equal((await f.call('capacity',0,{version:4,capacity:2})).code,409);
  assert.equal((await f.call('start',0,{version:4})).code,200);
  assert.equal((await f.call('capacity',0,{version:5,capacity:4})).code,409);
  assert.equal((await f.call('read')).data.capacity,3);
});

test('a simultaneous join and capacity reduction never removes or overbooks a player',async()=>{
  const f=fixture();await f.create(3);await f.join(1);
  const results=await Promise.all([f.call('capacity',0,{version:1,capacity:2}),f.join(2)]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
  const state=(await f.call('read')).data;
  assert.equal(state.version,2);
  assert.equal(state.members.length,state.capacity);
  assert.equal(state.members[0].id,0);assert.equal(state.members[1].id,1);
});

test('starting and adding places simultaneously commits only one coherent lobby transition',async()=>{
  const f=fixture();await f.create();await f.join(1);
  const results=await Promise.all([f.call('capacity',0,{version:1,capacity:4}),f.call('start',0,{version:1})]);
  assert.deepEqual(results.map(r=>r.code).sort(),[200,409]);
  const state=(await f.call('read')).data;
  assert.equal(state.version,2);
  if(state.race){assert.equal(state.capacity,2);assert.equal(state.race.players.length,2);}
  else assert.equal(state.capacity,4);
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
  assert.throws(()=>cleanTrack({...track,outer:Array(MAX_BORDER_SAMPLES+1).fill({x:1,y:1})},2),/4096/);
  assert.throws(()=>cleanTrack({...track,finish:{a:{x:20,y:20},b:{x:30,y:30}}},2),/départ/);
  assert.throws(()=>createRoom({room:randomUUID(),invite:token(),name:'',capacity:2,track},token()),/prénom/);
  assert.throws(()=>createRoom({room:randomUUID(),invite:token(),name:'A',capacity:7,track},token()),/2 à 6/);
});

test('an old open editor can submit its unsimplified freehand circuit and start online',async()=>{
  const f=fixture(),raw=freehandTrack(),normalized=normalizeTrack(raw);
  assert.ok(raw.outer.length>256);assert.ok(normalized.outer.length>256);
  assert.ok(Buffer.byteLength(JSON.stringify({track:raw}))<30000);
  assert.deepEqual(cleanTrack(raw,6),normalized);
  const created=await f.call('create',0,{invite:f.invite,name:'Charles',capacity:2,track:raw});
  assert.equal(created.code,201);
  assert.deepEqual(created.data.track,normalized);
  assert.deepEqual((await f.call('read')).data.track,normalized);
  await f.join(1);
  let state=(await f.call('start',0,{version:1})).data;
  const driver=state.race.players[state.race.active].id;
  const start=startPositions(state.track)[0];
  state=(await f.call('place',driver,{version:state.version,point:start})).data;
  const next=choices(state.race.players[state.race.active]).find(p=>{const c=inspectMove(state.race,p,state.track);return c.valid&&!c.crash;});
  assert.equal((await f.call('move',driver,{version:state.version,point:next})).code,200);
});

test('server and editor return the same useful error for truly over-detailed borders',()=>{
  const raw=freehandTrack();
  raw.outer=Array.from({length:MAX_BORDER_POINTS+1},(_,i)=>point(32+31*Math.cos(i*2*Math.PI/(MAX_BORDER_POINTS+1)),20+19*Math.sin(i*2*Math.PI/(MAX_BORDER_POINTS+1))));
  const message=validateTrack(raw);
  assert.match(message,/extérieur.*513.*512/);
  assert.throws(()=>cleanTrack(raw,2),error=>error.status===400 && error.message===message);
});

test('rate limit is enforced by the shared store before reading private state',async()=>{
  const f=fixture();await f.create();
  const handler=makeHandler({store:{...f.store,limit:async()=>false},secret:token()});
  const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await handler({method:'GET',headers:{authorization:`Bearer ${f.players[0]}`},query:{room:f.room}},res);
  assert.equal(res.code,429);
});
