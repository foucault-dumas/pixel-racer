import { useEffect, useState } from 'react';
import GameGrid from './components/GameGrid';
import OnlineGame from './components/OnlineGame';
import { readLink, savedRooms, refreshRoomPeople, setRoomHidden } from './lib/online';

const recentSaved=()=>savedRooms().filter(r=>r.joined && !r.hidden).slice(0,20);

export default function App() {
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
  return online ? <OnlineGame key={`${online.room || 'new'}:${online.player || online.invite || ''}`} options={online} onClose={close} onRecover={setOnline}/> :
    <GameGrid onOnline={setOnline} recentRooms={recentRooms} onHideRoom={hideRoom}/>;
}
