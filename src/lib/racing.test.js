import test from 'node:test';
import assert from 'node:assert/strict';
import { point, same, presetTrack, validateTrack, onRoad, finishAt, startPositions, makeRace, placePlayer, choices, inspectMove, advanceRace, firstBorderHit } from './racing.js';
const polygon = coordinates => coordinates.map(([x,y])=>point(x,y));
const square = () => ({outer:polygon([[2,2],[62,2],[62,38],[2,38]]),inner:polygon([[14,12],[50,12],[50,28],[14,28]]),finish:{a:point(30,2),b:point(30,12)},direction:1});
function ready(track=square()) {
  let race=makeRace(['Alice','Benoît'],()=>.99);
  race=placePlayer(race,point(30,7),track);
  race=placePlayer(race,point(30,8),track);
  return race;
}
function withPlayer(race, values){return {...race,players:race.players.map((p,i)=>i===0?{...p,...values}:p)};}
test('the supplied circuit is valid and has six free starting places',()=>{
  const track=presetTrack();assert.equal(validateTrack(track),null);
  assert.ok(startPositions(track).length>=6);
  assert.equal(onRoad(point(30,4),track),false);
  assert.equal(onRoad(point(30,12),track),false);
  assert.equal(onRoad(point(30,20),track),false);
});
test('track validation rejects crossed, unnested and narrow boundaries',()=>{
  assert.match(validateTrack({...square(),outer:polygon([[2,2],[62,38],[62,2],[2,38]])}),/croisement/);
  assert.match(validateTrack({...square(),inner:polygon([[1,12],[50,12],[50,28],[1,28]])}),/entièrement/);
  assert.match(validateTrack({...square(),inner:polygon([[4,12],[50,12],[50,28],[4,28]])}),/trois/);
});
test('placement cannot leave the starting line or overwrite another player',()=>{
  const track=square(),race=makeRace(['Alice','Bob'],()=>.99);
  assert.equal(placePlayer(race,point(31,7),track).active,0);
  const placed=placePlayer(race,point(30,7),track);
  assert.equal(placePlayer(placed,point(30,7),track).active,1);
  assert.equal(placed.players[1].position,null);
});
test('six players overflow onto successive rear rows on a narrow track',()=>{
  const track={...square(),inner:polygon([[14,5],[50,5],[50,28],[14,28]]),finish:{a:point(30,2),b:point(30,5)}};
  assert.equal(validateTrack(track),null);
  let race=makeRace(['A','B','C','D','E','F'],()=>.99);
  for(let i=0;i<6;i++)race=placePlayer(race,startPositions(track,race.players.map(p=>p.position).filter(Boolean))[0],track);
  assert.equal(race.phase,'playing');
  assert.equal(new Set(race.players.map(p=>`${p.position.x},${p.position.y}`)).size,6);
  assert.ok(race.players.some(p=>p.position.x<30));
});
test('finish placement follows a valid cross-section of the two borders',()=>{
  const track=square(),finish=finishAt(point(30,6),track);
  assert.deepEqual(finish,{a:point(30,2),b:point(30,12)});
  assert.equal(finishAt(point(30,20),track),null);
  assert.equal(finishAt(point(0,0),track),null);
});
test('inertia offers precisely the nine neighbors of the projected point',()=>{
  const race=withPlayer(ready(),{position:point(35,7),velocity:point(3,-1)});
  const options=choices(race.players[0]);
  assert.equal(options.length,9);assert.ok(options.some(p=>same(p,point(38,6))));
  assert.equal(inspectMove(race,point(35,7),square()).valid,false);
  assert.equal(inspectMove(ready(),point(32,7),square()).valid,false);
});
test('occupied destinations are rejected, historical trails may be crossed',()=>{
  const race=ready();assert.equal(inspectMove(race,point(30,8),square()).valid,false);
  const blocked=advanceRace(race,point(30,8),square());assert.equal(blocked.active,0);assert.equal(blocked.players,race.players);
  const next={...race,players:race.players.map((p,i)=>i?{...p,path:[point(30,6),point(31,8)]}:p)};
  assert.equal(inspectMove(next,point(31,7),square()).valid,true);
});
test('crossing the hole is a crash even when the destination is on the road',()=>{
  const track=square(),race=withPlayer(ready(),{position:point(10,20),velocity:point(45,0),path:[point(10,20)]});
  const next=advanceRace(race,point(55,20),track),p=next.players[0];
  assert.equal(p.penalty,4);assert.deepEqual(p.velocity,point(0,0));assert.ok(p.position.x<14);
  assert.ok(onRoad(p.position,track));assert.equal(next.phase,'playing');
});
test('tangent border contact is a crash, including collinear contact',()=>{
  assert.notEqual(firstBorderHit(point(10,12),point(52,12),square()),null);
  assert.notEqual(firstBorderHit(point(13,11),point(15,13),square()),null);
});
test('four own turns of reduced speed are counted independently of the opponent',()=>{
  const track=square();let race=withPlayer(ready(),{position:point(12,20),velocity:point(2,0)});
  race=advanceRace(race,point(14,20),track);assert.equal(race.players[0].penalty,4);
  for(let n=3;n>=0;n--){
    race=advanceRace(race,race.players[1].position,track);
    const p=race.players[0];assert.equal(inspectMove(race,point(p.position.x+2,p.position.y),track).valid,false);
    race=advanceRace(race,point(p.position.x,p.position.y-1),track);
    assert.equal(race.players[0].penalty,n);
  }
  assert.deepEqual(race.players[0].velocity,point(0,-1));
});
test('an unavoidable off-page move recovers inside the track without hanging',()=>{
  const track=square(),race=withPlayer(ready(),{position:point(60,7),velocity:point(12,0)});
  const next=advanceRace(race,point(72,7),track);
  assert.equal(next.players[0].penalty,4);assert.ok(next.players[0].position.x<62);assert.equal(next.active,1);
});
test('the initial forward crossing never wins',()=>{
  const next=advanceRace(ready(),point(31,7),square());assert.equal(next.phase,'playing');assert.equal(next.winner,null);
});
for(const direction of [1,-1])test(`a full real two-player race wins only on the final crossing (direction ${direction})`,()=>{
  const track={...square(),direction};let race=ready(track);
  const route=direction===1?[[55,7],[55,32],[8,32],[8,7],[31,7]]:[[8,7],[8,32],[55,32],[55,7],[29,7]];
  let moveCount=0;
  for(const [x,y] of route){
    while(!same(race.players[0].position,point(x,y))){
      assert.equal(race.phase,'playing');
      const p=race.players[0].position,target=point(p.x+Math.sign(x-p.x),p.y+Math.sign(y-p.y));
      const check=inspectMove(race,target,track);assert.equal(check.valid,true);assert.equal(check.crash,false);
      race=advanceRace(race,target,track);moveCount++;
      if(race.phase==='playing')race=advanceRace(race,race.players[1].position,track);
      assert.ok(moveCount<250);
    }
  }
  assert.equal(race.phase,'finished');assert.equal(race.winner,0);assert.equal(race.players[0].turns,moveCount);
  assert.equal(advanceRace(race,point(32,7),track).players,race.players);
});
test('a backwards lap cannot count as a victory',()=>{
  const track=square(),race=withPlayer(ready(),{position:point(29,7),velocity:point(1,0),progress:-Math.PI*2});
  const next=advanceRace(race,point(31,7),track);assert.equal(next.phase,'playing');
});
test('standing on the finish line is not enough: cross it fully',()=>{
  const track=square(),race=withPlayer(ready(),{position:point(29,7),velocity:point(1,0),progress:Math.PI*2});
  const next=advanceRace(race,point(30,7),track);assert.equal(next.phase,'playing');
});
