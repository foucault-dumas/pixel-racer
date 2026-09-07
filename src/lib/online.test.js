import test from 'node:test';
import assert from 'node:assert/strict';
import { savedRooms, remember, parsePersonalLink, resumeView, roomPeople, resumeLabel, refreshRoomPeople, setRoomHidden } from './online.js';

const room='00000000-0000-4000-8000-000000000001', token='a'.repeat(43);
test('remembering a Bic preserves its identity and recovery confirmation across subsequent saves',()=>{
  let content=null;
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>content,setItem:(_,v)=>{content=v;}}});
  try {
    const entry={room,token};
    remember(entry);
    remember({...entry,name:'Charles',joined:true});
    remember({...entry,recoverySaved:true});
    remember(entry); // A later move must not erase the earlier confirmations.
    const reopened=savedRooms()[0];
    assert.equal(reopened.token,token);assert.equal(reopened.joined,true);
    assert.equal(reopened.name,'Charles');assert.equal(reopened.recoverySaved,true);
    setRoomHidden(room);
    remember({...entry,name:'Charles',joined:true}); // A still-open tab must not resurrect a hidden room.
    assert.equal(savedRooms()[0].hidden,true);
    assert.equal(savedRooms()[0].token,token);
    setRoomHidden(room,false);
    assert.equal(savedRooms()[0].hidden,false);
    content='[null, {}, {"room":"bad","token":"bad"}]';
    assert.deepEqual(savedRooms(),[]);
  } finally {
    if(old)Object.defineProperty(globalThis,'localStorage',old);
    else delete globalThis.localStorage;
  }
});

test('recent games name other players by ID, including namesakes and groups',()=>{
  const members=[{id:0,name:'Charles'},{id:1,name:'Julie'},{id:2,name:'X'},{id:3,name:'Y'}];
  assert.equal(resumeLabel(roomPeople({members:members.slice(0,2),me:0,capacity:2})),'Reprendre avec Julie');
  assert.equal(resumeLabel(roomPeople({members,me:0,capacity:4})),'Reprendre avec Julie, X et Y');
  assert.equal(resumeLabel(roomPeople({members:[members[0],{id:1,name:'Charles'}],me:0,capacity:2})),'Reprendre avec Charles');
  assert.equal(resumeLabel({name:'Charles'}),'Reprendre la course');
  assert.equal(resumeLabel(roomPeople({members:[members[0]],me:0,capacity:2})),'Reprendre la course');
});

test('legacy room metadata refresh preserves hidden status, dates and credentials',async()=>{
  let content=JSON.stringify([{room,token,name:'Charles',joined:true,updatedAt:'2026-09-07'}]);
  const storage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'), previousFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>content,setItem:(_,v)=>{content=v;}}});
  globalThis.fetch=async(url,options)=>{
    assert.ok(url.endsWith('&summary=1'));assert.equal(options.headers.Authorization,`Bearer ${token}`);
    setRoomHidden(room); // The user removes a card while its summary is loading.
    return {ok:true,json:async()=>({me:0,capacity:2,members:[{id:0,name:'Charles'},{id:1,name:'Julie'}]})};
  };
  try {
    await refreshRoomPeople(savedRooms()[0]);
    const saved=savedRooms()[0];
    assert.equal(resumeLabel(saved),'Reprendre avec Julie');
    assert.equal(saved.rosterComplete,true);assert.equal(saved.hidden,true);
    assert.equal(saved.token,token);assert.equal(saved.updatedAt,'2026-09-07');
  } finally {
    globalThis.fetch=previousFetch;
    if(storage)Object.defineProperty(globalThis,'localStorage',storage);else delete globalThis.localStorage;
  }
});

test('personal recovery accepts only a player link for the expected room',()=>{
  const link=`https://pixel-racer-six.vercel.app/#room=${room}&player=${token}`;
  assert.deepEqual(parsePersonalLink(link,room),{room,player:token});
  assert.throws(()=>parsePersonalLink(link.replace('player=','invite='),room),/personnel/);
  assert.throws(()=>parsePersonalLink(link,'00000000-0000-4000-8000-000000000002'),/autre cahier/);
  assert.throws(()=>parsePersonalLink(`javascript:alert(1)#room=${room}&player=${token}`),/personnel/);
  assert.throws(()=>parsePersonalLink('not a link'),/personnel/);
});

test('network failures never send returning players to a new-player form',()=>{
  const existing={room,token,invite:'b'.repeat(43),joined:true};
  for(const status of [undefined,404,429,503])assert.equal(resumeView({status},existing),'error');
  assert.equal(resumeView({status:403},existing),'recover');
  assert.equal(resumeView({status:403},{...existing,joined:false},true),'recover');
  assert.equal(resumeView({status:403},{...existing,joined:false}),'join');
  assert.equal(resumeView({status:403},{room,token}),'recover');
});
