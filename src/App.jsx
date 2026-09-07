import { useEffect, useState } from 'react';
import GameGrid from './components/GameGrid';
import OnlineGame from './components/OnlineGame';
import { readLink, savedRooms, refreshRoomPeople, setRoomHidden } from './lib/online';
import { createPenAudio, SOUND_KEY } from './lib/turn-notifications';

const recentSaved=()=>savedRooms().filter(r=>r.joined && !r.hidden).slice(0,20);

export default function App() {
  const [penAudio] = useState(createPenAudio);
  const [soundEnabled,setSoundEnabled] = useState(()=>penAudio.enabled);
  useEffect(()=>{
    // Capture the normal Create / Join / Resume click, and gestures on direct
    // invitation pages, before asynchronous requests lose user activation.
    const unlock=e=>{if(e.isTrusted)void penAudio.unlock();};
    const sync=e=>{
      if(e.key===SOUND_KEY || e.key===null){penAudio.setEnabled(e.newValue!=='off');setSoundEnabled(penAudio.enabled);}
    };
    document.addEventListener('pointerup',unlock,true);
    document.addEventListener('click',unlock,true);
    document.addEventListener('keydown',unlock,true);
    window.addEventListener('storage',sync);
    return ()=>{
      document.removeEventListener('pointerup',unlock,true);
      document.removeEventListener('click',unlock,true);
      document.removeEventListener('keydown',unlock,true);
      window.removeEventListener('storage',sync);
      penAudio.dispose();
    };
  },[penAudio]);
  function toggleSound() {
    const enabled=!penAudio.enabled;
    penAudio.setEnabled(enabled);setSoundEnabled(enabled);
    if(enabled)void penAudio.unlock();
  }
  const [online,setOnline] = useState(readLink);
  const [recentRooms,setRecentRooms] = useState(recentSaved);
  useEffect(()=>{
    if(online)return;
    let cancelled=false;
    const rooms=recentSaved();
    setRecentRooms(rooms);
    const incomplete=rooms.filter(r=>!Array.isArray(r.opponents) || !r.rosterComplete);
    if(incomplete.length)Promise.allSettled(incomplete.map(refreshRoomPeople)).then(()=>{
      if(!cancelled)setRecentRooms(recentSaved());
    });
    return ()=>{cancelled=true;};
  },[online]);
  useEffect(()=>{
    const follow=()=>setOnline(readLink());
    window.addEventListener('hashchange',follow);
    return ()=>window.removeEventListener('hashchange',follow);
  },[]);
  function close() {history.replaceState(null,'',location.pathname+location.search);setOnline(null);}
  function hideRoom(room,hidden=true) {setRoomHidden(room,hidden);setRecentRooms(recentSaved());}
  return online ? <OnlineGame key={`${online.room || 'new'}:${online.player || online.invite || ''}`} options={online} onClose={close} onRecover={setOnline} penAudio={penAudio} soundEnabled={soundEnabled} toggleSound={toggleSound}/> :
    <GameGrid onOnline={setOnline} recentRooms={recentRooms} onHideRoom={hideRoom}/>;
}
