import { useEffect, useState } from 'react';
import GameGrid from './components/GameGrid';
import OnlineGame from './components/OnlineGame';
import { readLink, savedRooms } from './lib/online';

export default function App() {
  const [online,setOnline] = useState(readLink);
  useEffect(()=>{
    const follow=()=>setOnline(readLink());
    window.addEventListener('hashchange',follow);
    return ()=>window.removeEventListener('hashchange',follow);
  },[]);
  function close() {history.replaceState(null,'',location.pathname+location.search);setOnline(null);}
  return online ? <OnlineGame key={`${online.room || 'new'}:${online.player || online.invite || ''}`} options={online} onClose={close}/> :
    <GameGrid onOnline={setOnline} recentRooms={savedRooms().filter(r=>r.joined).slice(0,20)}/>;
}
