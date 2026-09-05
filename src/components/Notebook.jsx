/* eslint-disable react/prop-types -- Internal view receives the typed-by-contract game state. */
import { useRef } from 'react';
import { COLS, ROWS, point, inspectMove } from '../lib/racing';
const points = ps => ps.map(p=>`${p.x},${p.y}`).join(' ');
const path = ps => ps.length?`M${ps.map(p=>`${p.x} ${p.y}`).join('L')}Z`:'';

export default function Notebook({track,race,player,phase,error,editing,tool,draft,notebook,zoom,setZoom,help,selected,moveCheck,moves,center,startNodes,selectPoint,keyboard,tangent}) {
  const svgRef=useRef(null), drawing=useRef(false), pointerStart=useRef(null);
  const mid=track.finish?point((track.finish.a.x+track.finish.b.x)/2,(track.finish.a.y+track.finish.b.y)/2):null;
  function localPoint(event){
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(svgRef.current.getScreenCTM().inverse());
    return point(Math.max(0,Math.min(COLS,Math.round(p.x))),Math.max(0,Math.min(ROWS,Math.round(p.y))));
  }
  return <section className="notebook" aria-label="Cahier de course">
    <div className="binding" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i}/>)}</div>
    <div className="page-heading"><span>Cahier de courses <b>n° {String(notebook).padStart(2,'0')}</b></span><span className="page-status">{phase==='setup'?editing?'Le coin dessin':'Avant la récré':phase==='placement'?'Sur la ligne':phase==='finished'?'Le dernier mot':`Manche ${Math.min(...race.players.map(p=>p.turns))+1}`}</span></div>
    <div className="board-scroll"><div className="board-size" style={{width:`${zoom*100}%`}}>
      <svg ref={svgRef} className={`board ${editing?'drawing':''}`} viewBox={`0 0 ${COLS} ${ROWS}`} tabIndex={0} role="application" aria-label="Circuit sur petits carreaux. Cliquer pour choisir un point. En course : flèches pour choisir, Entrée pour jouer, Échap pour annuler." onKeyDown={keyboard}
        onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.focus({preventScroll:true});pointerStart.current={x:e.clientX,y:e.clientY,moved:false};if(editing&&tool!=='finish'){selectPoint(localPoint(e));drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);}}}
        onPointerMove={e=>{if(pointerStart.current&&Math.hypot(e.clientX-pointerStart.current.x,e.clientY-pointerStart.current.y)>7)pointerStart.current.moved=true;if(drawing.current&&editing&&tool!=='finish')selectPoint(localPoint(e));}}
        onPointerUp={e=>{if(!drawing.current&&pointerStart.current&&!pointerStart.current.moved)selectPoint(localPoint(e));drawing.current=false;pointerStart.current=null;}} onPointerCancel={()=>{drawing.current=false;pointerStart.current=null;}}>
        <defs>
          <pattern id="squares" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#9cbeda" strokeWidth=".028"/></pattern>
          <pattern id="major-squares" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#squares)"/><path d="M5 0H0V5" fill="none" stroke="#8aaecb" strokeWidth=".035"/></pattern>
          <marker id="direction-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="#3e506b" strokeWidth="1.5"/></marker>
        </defs>
        <rect width={COLS} height={ROWS} fill="url(#major-squares)"/><path d="M3 0V40" stroke="#d78b8d" strokeWidth=".07" opacity=".7"/>
        {!error && <path d={`${path(track.outer)} ${path(track.inner)}`} fill="#faf7e9" fillOpacity=".55" fillRule="evenodd"/>}
        {[track.outer,track.inner].map((poly,i)=><polygon key={i} points={points(poly)} className="track-border"/>)}
        {editing&&draft.length>0 && <><polyline points={points(draft)} className="draft-border"/>{draft.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r=".15" fill="#b34b4c"/>)}</>}
        {track.finish && <g>
          <line x1={track.finish.a.x} y1={track.finish.a.y} x2={track.finish.b.x} y2={track.finish.b.y} stroke="#313e56" strokeWidth=".35"/>
          <line x1={track.finish.a.x} y1={track.finish.a.y} x2={track.finish.b.x} y2={track.finish.b.y} stroke="#faf7ed" strokeWidth=".2" strokeDasharray=".5 .5"/>
          <path d={`M${mid.x-tangent.x*1.7} ${mid.y-tangent.y*1.7}l${tangent.x*3.4} ${tangent.y*3.4}`} stroke="#3e506b" strokeWidth=".12" fill="none" markerEnd="url(#direction-arrow)"/>
          <text x={track.finish.a.x+.6} y={track.finish.a.y-1} className="board-note">départ / arrivée</text>
        </g>}
        {!race&&!editing && <g aria-hidden="true"><text x="24" y="20" className="board-title">Le circuit de la récré</text><text x="25" y="22.5" className="board-subtitle">On n’a pas fini de tourner.</text><path d="M25 24Q34 24.7 43 23.8" stroke="#8a9aad" strokeWidth=".08" fill="none"/></g>}
        {race?.players.map((p,index)=><g key={p.id} style={{color:p.color}}>
          <polyline points={points(p.path)} fill="none" stroke="currentColor" strokeWidth=".14" strokeLinejoin="round" strokeLinecap="round"/>
          {p.path.map((q,i)=><circle key={i} cx={q.x} cy={q.y} r=".105" fill="currentColor"/>)}
          {p.crashes.map((q,i)=><path key={i} d={`M${q.x-.3} ${q.y-.3}l.6 .6m0 -.6l-.6 .6`} stroke="currentColor" strokeWidth=".13"/>)}
          {p.previous && <circle cx={p.previous.x} cy={p.previous.y} r=".27" fill="#fbf8ee" stroke="currentColor" strokeWidth=".1"/>}
          {p.position && <g><circle cx={p.position.x} cy={p.position.y} r={p.id===player.id?'.52':'.4'} fill="#fbf8ee" stroke="currentColor" strokeWidth=".13"/><circle cx={p.position.x} cy={p.position.y} r=".22" fill="currentColor"/><text x={p.position.x+.65} y={p.position.y-.6} className="player-number" fill="currentColor">{index+1}</text></g>}
        </g>)}
        {startNodes.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r=".3" fill={player.color} fillOpacity=".22" stroke={player.color} strokeWidth=".07"/>)}
        {help&&center && <g style={{color:player.color}}>
          <line x1={player.position.x} y1={player.position.y} x2={center.x} y2={center.y} stroke="currentColor" opacity=".5" strokeWidth=".1" strokeDasharray=".25 .2"/>
          {moves.map((p,i)=>{const check=inspectMove(race,p,track);return <circle key={i} cx={p.x} cy={p.y} r=".23" fill={check.crash?'#b85241':'currentColor'} fillOpacity={check.valid?'.16':'.03'} stroke={check.crash?'#b85241':'currentColor'} strokeWidth=".065" strokeDasharray={check.crash?'.1 .1':undefined}/>;})}
          <path d={`M${center.x-.35} ${center.y}h.7m-.35 -.35v.7`} stroke="currentColor" strokeWidth=".08"/>
        </g>}
        {selected && <g>{phase==='playing' && <line x1={player.position.x} y1={player.position.y} x2={selected.x} y2={selected.y} stroke={moveCheck?.crash?'#b85241':player.color} strokeDasharray=".18 .13" strokeWidth=".14"/>}<circle cx={selected.x} cy={selected.y} r=".47" fill="none" stroke={player?.color??'#234eac'} strokeWidth=".12"/></g>}
      </svg>
    </div></div>
    <div className="page-footer"><span><i className="ink-dot"/>{editing?'Les traits suivent les intersections.':phase==='playing'?'Un point, un trait, au suivant.':'Les souvenirs tiennent dans un carreau.'}</span><div className="zoom"><button aria-label="Dézoomer" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.25))}>−</button><button onClick={()=>setZoom(1)} aria-label="Ajuster le circuit à la page">{Math.round(zoom*100)} %</button><button aria-label="Zoomer" disabled={zoom>=2} onClick={()=>setZoom(z=>Math.min(2,z+.25))}>+</button></div></div>
  </section>;
}
