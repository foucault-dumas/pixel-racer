import test from 'node:test';
import assert from 'node:assert/strict';
import { savedRooms, remember, parsePersonalLink, resumeView } from './online.js';

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
    content='[null, {}, {"room":"bad","token":"bad"}]';
    assert.deepEqual(savedRooms(),[]);
  } finally {
    if(old)Object.defineProperty(globalThis,'localStorage',old);
    else delete globalThis.localStorage;
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
