/* eslint-disable react/prop-types -- Internal game screen. */
import { useEffect, useRef, useState } from 'react';
import Notebook from './Notebook';
import Rules from './Rules';
import { PENS, choices, inspectMove, naturalPoint, raceTangent, startPositions, same, presetTrack } from '../lib/racing';
import { newToken, savedRooms, remember, roomLink, roomRequest, parsePersonalLink, resumeView, roomPeople } from '../lib/online';

export default function OnlineGame({options,onClose,onRecover}) {
  const [entry] = useState(()=>{
    const old = savedRooms().find(r=>r.room===options.room);
    return { ...(old?.joined?{joined:true}:{}), ...(old?.recoverySaved?{recoverySaved:true}:{}), room:options.room || crypto.randomUUID(), token:options.player || old?.token || newToken(),
      invite:options.invite || old?.invite || (options.create ? newToken() : null) };
  });
  const [data,setData] = useState(null);
  const latest = useRef(null), mounted = useRef(true), lock = useRef(false);
  const [name,setName] = useState(options.name || '');
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [connection,setConnection] = useState('loading');
  const [view,setView] = useState(options.create?'create':'checking');
  const [recoveryLink,setRecoveryLink] = useState('');
  const [backedUp,setBackedUp] = useState(!!entry.recoverySaved);
  const [selected,setSelected] = useState(null), [help,setHelp] = useState(true), [zoom,setZoom] = useState(1);
  const [share,setShare] = useState(null), [copied,setCopied] = useState(false), [rules,setRules] = useState(false);
  const dialog = useRef(null);
  const race = data?.race, track = data?.track || options.track || presetTrack();
  const phase = race?.phase || 'setup', player = race?.players[race.active];
  const myTurn = !!player && player.id===data.me && phase!=='finished';
  const moves = phase==='playing' && myTurn ? choices(player) : [];
  const center = moves.length ? naturalPoint(player) : null;
  const startNodes = phase==='placement' && myTurn ? startPositions(track,race.players.map(p=>p.position).filter(Boolean)) : [];
  const moveCheck = selected && phase==='playing' ? inspectMove(race,selected,track) : null;
  const winner = phase==='finished' ? race.players.find(p=>p.id===race.winner) : null;
  const available = !busy && connection==='ok';

  function accept(next) {
    if (next.unchanged || (latest.current && next.version < latest.current.version)) return;
    if (next.version !== latest.current?.version) setSelected(null);
    latest.current=next;setData(next);
    const mine=next.members.find(p=>p.id===next.me);
    try {
      remember({...entry,name:mine.name,joined:true,...roomPeople(next),updatedAt:new Date().toISOString()});
      history.replaceState(null,'',roomLink(entry.room));
    } catch {
      setBackedUp(false);setShare('player');
      setError('La course est enregistrée, mais ce navigateur ne peut pas garder ton Bic. Conserve ton lien personnel pour revenir.');
    }
    setView('ready');
  }
  const acceptRef = useRef(accept);
  acceptRef.current=accept;
  async function refresh() {
    try {
      const next = await roomRequest(entry.room,entry.token,null,latest.current?.version);
      if (!mounted.current) return;
      if(!latest.current)setError('');
      acceptRef.current(next);setConnection('ok');
    } catch (e) {
      if (!mounted.current) return;
      let nextView=resumeView(e,entry,!!options.player), message=e.message;
      if(nextView==='join') {
        try {
          const invitation=await roomRequest(entry.room,entry.token,{action:'invitation',invite:entry.invite});
          nextView=invitation.canJoin?'join':'recover';
        } catch(invitationError){nextView='error';message=invitationError.message;}
      }
      if(!mounted.current)return;
      setConnection(nextView==='error'?'offline':'ok');
      if(nextView!=='error' && latest.current){latest.current=null;setData(null);setSelected(null);}
      if (!latest.current) {
        setView(nextView);
        setError(nextView==='error'?message:'');
      }
    }
  }
  const refreshRef=useRef(refresh);
  refreshRef.current=refresh;
  useEffect(()=>{
    mounted.current=true;
    try {
      // A pasted personal link is untrusted until the server accepts it.
      // In particular, a bad link must not overwrite an already saved Bic.
      if(!options.player)remember(entry);
      // Fragments aren't sent to servers. Remove credentials from the address
      // once stored so copying the address cannot accidentally share a Bic.
      if (!options.create && !options.player) history.replaceState(null,'',roomLink(entry.room));
    } catch { setError('Ton navigateur bloque la sauvegarde de ton Bic. Autorise le stockage du site puis réessaie.'); }
    if (!options.create) refreshRef.current(); else setConnection('ok');
    let timer, cancelled=false;
    const tick=async()=>{
      if (document.visibilityState==='visible' && latest.current) await refreshRef.current();
      if (!cancelled) timer=setTimeout(tick,10000);
    };
    timer=setTimeout(tick,10000);
    const focus=()=>{if(document.visibilityState==='visible' && latest.current)refreshRef.current();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return ()=>{cancelled=true;mounted.current=false;clearTimeout(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[entry,options.create,options.player]);
  useEffect(()=>{if(rules)dialog.current?.showModal();},[rules]);
  useEffect(()=>{
    document.title = myTurn ? 'À toi de jouer ! · Pixel Racer' : 'Pixel Racer · Le cahier partagé';
    return ()=>{document.title='Pixel Racer — La course des petits carreaux';};
  },[myTurn]);

  async function act(action,extra={}) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      try {remember(entry);} catch {throw new Error('Autorise le stockage de ce site dans ton navigateur pour garder ton Bic.');}
      const next=await roomRequest(entry.room,entry.token,{action,requestId:crypto.randomUUID(),version:latest.current?.version,...extra});
      if(!mounted.current)return;
      accept(next);setConnection('ok');history.replaceState(null,'',roomLink(entry.room));
      if((action==='create' || action==='join') && !backedUp)setShare('player');
    } catch(e) {
      if(!mounted.current)return;
      setError(e.message);
      // A timeout can follow a successful commit: reload before any retry.
      if(latest.current || !e.status || e.status===409)await refreshRef.current();
    } finally {lock.current=false;if(mounted.current)setBusy(false);}
  }
  function selectPoint(p) {if(myTurn && available)setSelected(p);}
  function commit() {
    if(!myTurn || !available)return;
    if(phase==='placement')act('place',{point:selected || startNodes[0]});
    if(phase==='playing' && moveCheck?.valid)act('move',{point:selected});
  }
  function keyboard(e) {
    if(!myTurn || !available)return;
    if(e.key==='Enter' || e.key===' '){e.preventDefault();commit();}
    else if(e.key==='Escape')setSelected(null);
    else if(e.key.startsWith('Arrow')) {
      e.preventDefault();
      const nodes=phase==='placement'?startNodes:moves;
      const delta=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;
      const index=nodes.findIndex(p=>same(p,selected));
      if(nodes.length)setSelected(nodes[(index+delta+nodes.length)%nodes.length]);
    }
  }
  function showLink(kind) {setCopied(false);setShare(kind);}
  function recover(e) {
    e.preventDefault();
    try {onRecover(parsePersonalLink(recoveryLink,entry.room));}
    catch(error){setError(error.message);}
  }
  function keepLink() {
    try {remember({...entry,recoverySaved:true});setBackedUp(true);setShare(null);}
    catch {setShare(null);}
  }
  const link=share ? roomLink(entry.room,share==='invite'?'invite':'player',share==='invite'?entry.invite:entry.token) : '';
  return <div className="desk">
    <header className="masthead"><button className="brand brand-button" onClick={onClose}><span className="brand-mark">pr<span>↗</span></span><span>PIXEL RACER<small>LE CAHIER QUI VOYAGE</small></span></button><button className="rules-button" onClick={()=>setRules(true)}>ⓘ Les règles du cahier</button></header>
    <div className="title-row"><div><p className="eyebrow">CHACUN CHEZ SOI. LE MÊME CAHIER.</p><h1>Les copains, <em>à un trait d’ici.</em></h1></div><span className="margin-note">400 km ?<br/><span>Toujours la même récré.</span></span></div>
    <div className="session-tools">
        {data && !backedUp && share!=='player' && <div className="backup-note"><strong>Pour revenir demain</strong><p>Garde ton lien personnel, même si ce navigateur mémorise ton Bic.</p><button className="secondary" onClick={()=>showLink('player')}>Garder mon lien personnel</button></div>}
        {data && share && <div className="share-box"><p><strong>{share==='invite'?'À envoyer aux copains':'Ton passeport pour cette course'}</strong><br/>{share==='invite'?'Ce lien permet de prendre un Bic avant le départ.':'Garde ce lien dans tes notes ou tes favoris. Il retrouve ton Bic même sur un autre appareil. Il est privé : ne l’envoie pas aux autres joueurs.'}</p><input aria-label={share==='invite'?'Lien d’invitation':'Lien personnel privé'} readOnly value={link} onFocus={e=>e.target.select()}/><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setError('Sélectionne le lien et copie-le manuellement.');}}}>{copied?'Lien copié ✓':'Copier le lien'}</button>{share==='player' && <button className="secondary" onClick={keepLink}>J’ai gardé mon lien</button>}<button className="text-button" onClick={()=>setShare(null)}>{share==='player'?'Plus tard':'Fermer'}</button></div>}
    </div>
    <main className={`game-layout ${!data ? 'entry-layout' : ''}`}>
      <Notebook {...{track,race,player,phase,zoom,setZoom,help,selected,moveCheck,moves,center,startNodes,selectPoint,keyboard}} error={null} editing={false} draft={[]} notebook={1} tangent={raceTangent(track)}/>
      <aside className="side-panel online-panel">
        <div className="panel-kicker">{!data?'ON OUVRE LE CAHIER':!race?'LES COPAINS ARRIVENT':winner?'LA GLOIRE DE LA RÉCRÉ':myTurn?'À TON TOUR':'LE CAHIER CIRCULE'}</div>
        <h2 style={{color:player?.color}}>{winner?`${winner.name} gagne !`:data ? myTurn?'À toi de jouer !':player?`À ${player.name} de jouer`:'On attend les Bics…':view==='checking'?'On retrouve ton Bic…':view==='create'?'Inviter les copains':view==='join'?'Première visite ?':'Reprendre la course'}</h2>
        {!data && view==='checking' && <p className="hint" role="status">Un instant, on vérifie ta place dans ce cahier.</p>}
        {!data && ['create','join'].includes(view) && <form onSubmit={e=>{e.preventDefault();act(options.create?'create':'join',options.create?{name,capacity:options.capacity,track:options.track,invite:entry.invite}:{name,invite:entry.invite});}}>
          <p className="hint">{options.create?`Un cahier privé pour ${options.capacity} joueurs. Chacun pourra jouer à son rythme.`:'Ton prénom, un Bic et c’est parti. Pas de compte à créer.'}</p>
          {(options.create || entry.invite) && <><label className="online-name">Ton prénom<input required maxLength={20} autoComplete="given-name" value={name} onChange={e=>setName(e.target.value)} placeholder="Charles"/></label><button className="primary" disabled={busy || !name.trim()}>{busy?'On ouvre le cahier…':options.create?'Créer notre cahier ↗':'Rejoindre la course ↗'}</button></>}
        </form>}
        {!data && ['join','recover'].includes(view) && <section className="recover-box">
          <h3>{view==='join'?'Tu as déjà joué ?':'Retrouvons ton Bic'}</h3>
          <p>{view==='join'?'Reprends ta place avec ton lien personnel, sans choisir un nouveau prénom.':'Ton Bic n’a pas été reconnu. Ta course peut toujours être enregistrée : il faut ton lien personnel pour reprendre ta place.'}</p>
          <form onSubmit={recover}><label className="online-name">Ton lien personnel<input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={recoveryLink} onChange={e=>setRecoveryLink(e.target.value)} placeholder="Colle le lien que tu as gardé"/></label><button className="secondary" disabled={!recoveryLink.trim()}>Reprendre avec mon Bic ↗</button></form>
          <p className="small-note">Essaie aussi le navigateur et l’adresse utilisés au départ. En navigation privée, le Bic peut être oublié à la fermeture. Sans ton lien ni le navigateur d’origine, ton prénom seul ne permet pas de récupérer une place.</p>
        </section>}
        {data && <>
          <p className="my-pen" style={{color:PENS[data.me].color}}>Ton Bic : {data.members[data.me].name} · {PENS[data.me].label.toLowerCase()}</p>
          {!race && <><p className="hint">{data.members.length} / {data.capacity} Bics autour du cahier. Le circuit est prêt.</p>{entry.invite && data.me===0 && <button className="primary" onClick={()=>showLink('invite')}>Inviter les copains ↗</button>}<ol className="scoreboard">{data.members.map(p=><li key={p.id} style={{'--pen':PENS[p.id].color}}><span className="ink-dot"/><span>{p.name}{p.id===0?' · créateur':''}</span></li>)}</ol>{data.me===0?<button className="secondary" disabled={!available || data.members.length!==data.capacity} onClick={()=>act('start')}>Tout le monde est là, on joue !</button>:<p className="small-note">Le créateur lancera la course quand tout le monde sera là.</p>}</>}
          {race && !winner && !myTurn && <div className="waiting-note"><span aria-hidden="true">✎</span><p>Le Bic est chez {player.name}.<br/>Tu peux fermer cette page et revenir plus tard.</p></div>}
          {myTurn && phase==='placement' && <><p className="hint">Choisis ta place, puis joue ton premier coup dans la foulée.</p><button className="primary" disabled={!available || !startNodes.length || (selected && !startNodes.some(p=>same(p,selected)))} onClick={commit}>Poser mon Bic {selected?'ici':'au départ'} ↗</button></>}
          {myTurn && phase==='playing' && <>
            <p className="hint">{player.turns===0?'Garde la main : joue ton premier coup maintenant, un carreau maximum.':player.penalty?`Encore ${player.penalty} coups à un carreau maximum.`:'Reporte ton dernier trait. Choisis le point suivant.'}</p>
            {help && <div className="move-pad" aria-label="Les neuf destinations possibles">{moves.map((p,i)=>{const check=inspectMove(race,p,track);return <button key={i} aria-label={`Destination ${p.x}, ${p.y}${check.crash?', sortie de piste':''}`} aria-pressed={same(selected,p)} disabled={!available || !check.valid} className={check.crash?'risky':''} onClick={()=>setSelected(p)}>{['↖','↑','↗','←','•','→','↙','↓','↘'][i]}</button>;})}</div>}
            <p className="selection-note">{selected?`Point choisi : ${selected.x} · ${selected.y}`:'Choisis une intersection du cahier.'}</p>
            {moveCheck && (!moveCheck.valid || moveCheck.crash) && <p className="move-warning">{moveCheck.valid?'Sortie de piste : quatre coups au ralenti.':moveCheck.reason}</p>}
            <button className="primary" style={{background:player.color}} disabled={!available || !moveCheck?.valid} onClick={commit}>{busy?'Enregistrement…':'Tracer mon coup ↗'}</button>
          </>}
          {race && !winner && <label className="toggle"><input type="checkbox" checked={help} onChange={e=>setHelp(e.target.checked)}/><span>Aide au calcul<small>Les neuf points pour retrouver la main.</small></span></label>}
          {winner && <><div className="winner-doodle" aria-hidden="true">★</div><p className="winner-summary">Un tour complet en {winner.turns} coups.<br/>Les traits restent dans ce cahier.</p><button className="primary" onClick={onClose}>Préparer une autre course ↗</button></>}
          {race && <ol className="scoreboard">{race.players.map((p,i)=><li key={p.id} className={i===race.active?'active':''} style={{'--pen':p.color}}><span className="ink-dot"/><span>{p.name}<small>{p.turns} coups{p.penalty?` · ralenti ${p.penalty}`:''}</small></span>{i===race.active && <b>←</b>}</li>)}</ol>}
          <button className="text-button" onClick={()=>showLink('player')}>Retrouver mon lien personnel</button>
        </>}
        {error && <p className="editor-error" role="alert">{error}</p>}
        {connection==='offline' && <p className="connection-warning" role="status">Connexion interrompue. {data?'Les derniers traits enregistrés restent visibles.':''} <button className="text-button" disabled={busy} onClick={()=>refreshRef.current()}>Réessayer</button></p>}
        <button className="text-button abandon" onClick={onClose}>Revenir à mes cahiers</button>
      </aside>
    </main>
    <footer className="game-footer"><p role="status">{busy?'Le cahier enregistre…':connection==='offline'?'En attente de connexion.':race?.message || 'Chacun son Bic, chacun son rythme. Aucun chronomètre.'}</p><span>2–6 joueurs · à distance · sauvegarde après chaque coup</span></footer>
    {rules && <dialog ref={dialog} className="paper-dialog" onCancel={()=>setRules(false)}><Rules close={()=>setRules(false)}/></dialog>}
  </div>;
}
