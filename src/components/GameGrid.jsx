/* eslint-disable react/prop-types -- Internal screen callbacks. */
import { useState, useRef, useMemo, useEffect } from 'react';
import { COLS, ROWS, PENS, point, same, presetTrack, validateTrack, finishAt, raceTangent, startPositions, makeRace, placePlayer, naturalPoint, choices, inspectMove, advanceRace } from '../lib/racing';
import Notebook from './Notebook';
import Rules from './Rules';

export default function GameGrid({onOnline, recentRooms=[]}) {
  const [track,setTrack] = useState(presetTrack);
  const [race,setRace] = useState(null);
  const [names,setNames] = useState(['','','','','','']);
  const [count,setCount] = useState(2);
  const [help,setHelp] = useState(true);
  const [rules,setRules] = useState(false);
  const [editing,setEditing] = useState(false);
  const [tool,setTool] = useState('outer');
  const [draft,setDraft] = useState([]);
  const [message,setMessage] = useState('Choisis ton Bic. Le dernier arrivé commence ? On tire au sort.');
  const [selected,setSelected] = useState(null);
  const [zoom,setZoom] = useState(1);
  const [confirm,setConfirm] = useState(false);
  const [notebook,setNotebook] = useState(1);
  const dialogRef = useRef(null);
  const player = race?.players[race.active];
  const phase = race?.phase ?? 'setup';
  const error = useMemo(()=>validateTrack(track),[track]);
  const startNodes = useMemo(()=>phase==='placement'?startPositions(track,race.players.map(p=>p.position).filter(Boolean)):[],[phase,race,track]);
  const moves = phase==='playing'?choices(player):[];
  const center = phase==='playing'?naturalPoint(player):null;
  const moveCheck = selected && phase==='playing'?inspectMove(race,selected,track):null;
  const ready = !error && track.finish && !editing;
  const winner = phase==='finished'?race.players.find(p=>p.id===race.winner):null;
  useEffect(()=>{ if(rules||confirm) dialogRef.current?.showModal(); else dialogRef.current?.close(); },[rules,confirm]);

  function newRace() {
    if(!ready)return;
    const next=makeRace(names.slice(0,count));
    setRace(next);setSelected(null);setMessage(next.message);
  }
  function resetRace() {
    setRace(null);setSelected(null);setConfirm(false);setMessage('Les Bics sont prêts. On en refait une ?');
  }
  function startDrawing() {
    setTrack({outer:[],inner:[],finish:null,direction:track.direction});
    setEditing(true);setTool('outer');setDraft([]);setSelected(null);setNotebook(n=>n+1);
    setMessage('Trace le bord extérieur : clique les coins ou dessine en maintenant le doigt.');
  }
  function closeBorder() {
    if(draft.length<3){setMessage('Il faut au moins trois points pour fermer une boucle.');return;}
    const closed=same(draft[0],draft.at(-1))?draft.slice(0,-1):draft;
    const next={...track,[tool]:closed,finish:null};
    setTrack(next);setDraft([]);
    if(tool==='outer'){setTool('inner');setMessage('Trace une deuxième boucle à l’intérieur. Laisse au moins trois carreaux de piste.');}
    else {const problem=validateTrack(next);if(problem){setMessage(problem);return;}setTool('finish');setMessage('Clique dans la piste pour poser la ligne de départ.');}
  }
  function usePreset(){setTrack(presetTrack());setEditing(false);setDraft([]);setMessage('Le circuit de la récré est prêt.');}
  function selectPoint(p) {
    if(!p)return;
    if(editing){
      if(tool==='finish'){
        if(error){setMessage(error);return;}
        const finish=finishAt(p,track);
        if(!finish){setMessage('Clique entre les deux bords, sur une portion assez droite.');return;}
        setTrack(t=>({...t,finish}));setEditing(false);setMessage('Circuit terminé. Rassemble les Bics !');
      } else setDraft(prev=>same(prev.at(-1),p)?prev:[...prev,p]);
      return;
    }
    if(phase==='placement'){const next=placePlayer(race,p,track);setRace(next);setMessage(next.message);setSelected(null);}
    else if(phase==='playing')setSelected(p);
  }
  function commitMove(){
    if(!selected||phase!=='playing')return;
    const next=advanceRace(race,selected,track);setRace(next);setMessage(next.message);
    if(next.players!==race.players)setSelected(null);
  }
  function keyboard(event){
    const steps={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    if(event.key==='Enter'||event.key===' '){event.preventDefault();if(phase==='playing')commitMove();else if(phase==='placement')selectPoint(selected??startNodes[0]);}
    else if(steps[event.key]){
      event.preventDefault();
      if(phase==='placement' && startNodes.length){const i=startNodes.findIndex(p=>same(p,selected));const d=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;setSelected(startNodes[(i+d+startNodes.length)%startNodes.length]);}
      else if(phase==='playing'){const base=selected??(help?center:player.position),[dx,dy]=steps[event.key];setSelected(point(Math.max(0,Math.min(COLS,base.x+dx)),Math.max(0,Math.min(ROWS,base.y+dy))));}
    }else if(event.key==='Escape')setSelected(null);
  }
  const hint=phase==='setup'?(editing?(tool==='finish'?'3. Pose la ligne de départ':tool==='outer'?'1. Dessine le bord extérieur':'2. Dessine le bord intérieur'):'Un circuit, deux à six copains, un Bic chacun.'):phase==='placement'?'Choisis une intersection libre sur le départ.':phase==='finished'?'La sonnerie peut attendre. Une revanche ?':player.penalty?`Première vitesse · encore ${player.penalty} coup${player.penalty>1?'s':''} à un carreau maximum.`:'Reporte ton dernier trait. Choisis le point suivant.';
  return <div className="desk">
    <header className="masthead"><a className="brand" href="./" aria-label="Pixel Racer, accueil"><span className="brand-mark">pr<span>↗</span></span><span>PIXEL RACER<small>LES JEUX DU FOND DE LA CLASSE</small></span></a><button className="rules-button" onClick={()=>setRules(true)}><span aria-hidden="true">?</span> Les règles du cahier</button></header>
    <div className="title-row"><div><p className="eyebrow">UN CAHIER. QUELQUES BICS. ENCORE UN TOUR.</p><h1>La course des <em>petits carreaux.</em></h1></div><span className="margin-note" aria-hidden="true">Comme à la récré.<br/><span>Mais sans la sonnerie.</span></span></div>
    <main className="game-layout">
      <Notebook {...{track,race,player,phase,error,editing,tool,draft,notebook,zoom,setZoom,help,selected,moveCheck,moves,center,startNodes,selectPoint,keyboard}} tangent={track.finish?raceTangent(track):null}/>
      <aside className="side-panel">
        <div className="panel-kicker">{phase==='setup'?'01 / ON SORT LES BICS':phase==='placement'?'02 / À VOS PLACES':phase==='finished'?'LA GLOIRE DE LA RÉCRÉ':'03 / À TOI DE JOUER'}</div>
        <h2 style={{color:player?.color}}>{winner?`${winner.name} gagne !`:player?player.name:'Qui joue ?'}</h2><p className="hint">{hint}</p>
        {phase==='setup' && <>
          <fieldset className="player-count"><legend>Autour du cahier</legend>{[2,3,4,5,6].map(n=><button key={n} aria-pressed={count===n} onClick={()=>setCount(n)}>{n}</button>)}</fieldset>
          <div className="name-list">{PENS.slice(0,count).map((pen,i)=><label key={pen.label} className="name-row" style={{'--pen':pen.color}}><span className="pen" aria-hidden="true"/><span className="sr-only">Nom du joueur au Bic {pen.label.toLowerCase()}</span><input maxLength={20} value={names[i]} placeholder={`Bic ${pen.label.toLowerCase()}`} onChange={e=>setNames(ns=>ns.map((n,j)=>j===i?e.target.value:n))}/></label>)}</div>
          <label className="toggle"><input type="checkbox" checked={help} onChange={e=>setHelp(e.target.checked)}/><span>Montrer les points possibles<small>Pour retrouver le coup de main.</small></span></label>
          <button className="primary" disabled={!ready} onClick={newRace}>On fait la course <span>↗</span></button>
          <button className="secondary online-create" disabled={!ready} onClick={()=>onOnline({create:true,track,capacity:count,name:names[0]})}>Jouer à distance avec les copains ↗</button>
          <p className="small-note">Un lien à envoyer. Chacun joue quand il peut.</p>
          {recentRooms.length>0 && <details className="recent-rooms"><summary>Mes cahiers en ligne ({recentRooms.length})</summary>{recentRooms.map(r=><button className="text-button" key={r.room} onClick={()=>onOnline({room:r.room})}>{r.name || 'Mon Bic'} · {new Date(r.updatedAt).toLocaleDateString('fr-FR')}</button>)}</details>}
          <div className="circuit-tools"><p>Le circuit</p>{editing?<>
            <div className="tool-tabs">{[['outer','Extérieur'],['inner','Intérieur'],['finish','Départ']].map(([key,label])=><button key={key} aria-pressed={tool===key} onClick={()=>{setTool(key);setDraft([]);}}>{label}</button>)}</div>
            {tool!=='finish' && <><button className="secondary" onClick={closeBorder} disabled={draft.length<3}>Fermer ce bord</button><div className="small-actions"><button disabled={!draft.length} onClick={()=>setDraft(d=>d.slice(0,-1))}>↶ Dernier point</button><button onClick={()=>{setDraft([]);setTrack(t=>({...t,[tool]:[],finish:null}));}}>Effacer ce bord</button></div></>}
            {error && <p className="editor-error">{error}</p>}<button className="text-button" onClick={usePreset}>Reprendre le circuit de la récré</button>
          </>:<><button className="secondary" onClick={startDrawing}>✎ Dessiner notre circuit</button><button className="text-button" onClick={()=>setTrack(t=>({...t,direction:-t.direction}))}>Sens {track.direction===1?'horaire':'antihoraire'} <span>⇄</span></button><button className="text-button" onClick={()=>{setEditing(true);setTool('finish');setDraft([]);setMessage('Clique dans la piste pour déplacer le départ.');}}>Déplacer la ligne de départ</button></>}</div>
        </>}
        {phase==='placement' && <><div className="placement-symbol" style={{color:player.color}}>×<span>Pose ton Bic ici.</span></div><p className="small-note">Les points colorés indiquent les places libres. L’ordre a été tiré au sort.</p><button className="secondary" onClick={()=>selectPoint(selected??startNodes[0])} disabled={!startNodes.length}>Choisir {selected?'ce point':'une place libre'}</button></>}
        {phase==='playing' && <>
          <div className="player-stats"><div><strong>{player.turns+1}</strong><span>prochain coup</span></div><div><strong>{Math.max(Math.abs(player.velocity.x),Math.abs(player.velocity.y))}</strong><span>carreaux / coup</span></div></div>
          {help && <div className="move-pad" aria-label="Les neuf destinations possibles">{moves.map((p,i)=>{const check=inspectMove(race,p,track);return <button key={i} aria-label={`Destination colonne ${p.x}, ligne ${p.y}${check.crash?', sortie de piste':''}${!check.valid?', occupée':''}`} aria-pressed={same(selected,p)} disabled={!check.valid} className={check.crash?'risky':''} onClick={()=>setSelected(p)}>{['↖','↑','↗','←','•','→','↙','↓','↘'][i]}</button>;})}</div>}
          <p className="selection-note">{selected?`Point choisi : ${selected.x} · ${selected.y}`:'Clique une intersection du cahier.'}</p>
          {moveCheck && (!moveCheck.valid||moveCheck.crash) && <p className="move-warning">{!moveCheck.valid?moveCheck.reason:'Ce trait sort de la piste : retour avant le bord et quatre coups au ralenti.'}</p>}
          <button className="primary" style={{background:player.color}} disabled={!moveCheck?.valid} onClick={commitMove}>{moveCheck?.crash?'Jouer avec la pénalité':'Tracer mon coup'} <span>↗</span></button>
          <label className="toggle"><input type="checkbox" checked={help} onChange={e=>{setHelp(e.target.checked);setSelected(null);}}/><span>Aide au calcul<small>Masque les points pour jouer de tête.</small></span></label>
          {!help && <button className="text-button" onClick={()=>setSelected(naturalPoint(player))}>Je suis bloqué : montrer mon point d’inertie</button>}
        </>}
        {winner && <><div className="winner-doodle" aria-hidden="true">★</div><p className="winner-summary">Un tour complet en <strong>{winner.turns} coups</strong>.<br/>Ça mérite une étoile dans la marge.</p><button className="primary" onClick={newRace}>La revanche <span>↻</span></button></>}
        {race && <><ol className="scoreboard">{race.players.map((p,i)=><li key={p.id} className={race.active===i?'active':''} style={{'--pen':p.color}}><span className="ink-dot"/><span>{p.name}<small>{p.position?`${p.turns} coup${p.turns>1?'s':''}${p.penalty?` · ralenti ${p.penalty}`:''}`:'Sur le banc de départ'}</small></span>{race.active===i && <b aria-label="Joueur actif">←</b>}</li>)}</ol><button className="text-button abandon" onClick={()=>setConfirm(true)}>Revenir au début</button></>}
      </aside>
    </main>
    <footer className="game-footer"><p role="status" aria-live="polite">{message}</p><span>2–6 joueurs · un écran · un tour pour gagner</span></footer>
    {(rules||confirm) && <dialog ref={dialogRef} onCancel={()=>{setRules(false);setConfirm(false);}} className="paper-dialog">
      {confirm?<><p className="eyebrow">ON TOURNE LA PAGE ?</p><h2>Recommencer la partie</h2><p>Les traits de cette course seront effacés. Le circuit et les prénoms restent.</p><div className="dialog-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Continuer la course</button><button className="primary" onClick={resetRace}>Recommencer</button></div></>:<Rules close={()=>setRules(false)}/>}
    </dialog>}
  </div>;
}
