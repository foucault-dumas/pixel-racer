import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  ROWS, COLS, OUTER, INNER,
  bresenham, analyzeBorder, nearestOfType, computeExterior,
  lastClearNode, segmentsIntersect, pointSegDist, shuffle, computeCandidates,
} from '../lib/track.js';

const MIN_CELL = 6;
const MAX_CELL = 48;
const ZOOM_STEP = 3;

const PLAYER_COLORS = ['#ef4444', '#818cf8', '#facc15', '#4ade80', '#f472b6', '#67e8f9'];
const PLAYER_NAMES  = ['Rouge',   'Indigo',  'Jaune',   'Vert',    'Rose',    'Cyan'];

const createGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

const CELL_BG = { [OUTER]: 'bg-orange-500', [INNER]: 'bg-blue-500' };

const STATUS = {
  empty:        { label: '—',             cls: 'text-gray-500' },
  closed:       { label: '✓ Fermé',       cls: 'text-emerald-400' },
  open:         { label: '◌ Ouvert',      cls: 'text-yellow-400' },
  branched:     { label: '✗ Branches',    cls: 'text-red-400' },
  disconnected: { label: '✗ Déconnecté', cls: 'text-red-400' },
};

export default function GameGrid() {
  // ── Circuit state ──────────────────────────────────────────────
  const [grid, setGrid]           = useState(createGrid);
  const [tool, setTool]           = useState(OUTER);
  const [widthError, setWidthError] = useState(false);
  const [finishLine, setFinishLine] = useState(null);
  const [playerCount, setPlayerCount] = useState(2);

  // ── Game state ─────────────────────────────────────────────────
  // phase: 'editor' | 'placement' | 'playing'
  const [phase, setPhase]               = useState('editor');
  const [players, setPlayers]           = useState([]);   // ordered by turn
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [assist, setAssist]             = useState(true); // aide visuelle (9 points)
  const [winner, setWinner]             = useState(null); // index du gagnant

  // ── Display state ──────────────────────────────────────────────
  const [manualCellSize, setManualCellSize] = useState(null);
  const [containerSize, setContainerSize]   = useState({ w: 900, h: 500 });

  const painting    = useRef(false);
  const lastCell    = useRef(null);   // dernière case peinte (pour relier le tracé)
  const gridRef     = useRef(grid);
  const errorTimer  = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { gridRef.current = grid; }, [grid]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Zoom ────────────────────────────────────────────────────────
  const baseCellSize = Math.max(MIN_CELL,
    Math.floor(Math.min(containerSize.w / COLS, containerSize.h / ROWS)));
  const cellSize = manualCellSize ?? baseCellSize;
  const zoomIn   = () => setManualCellSize(s => Math.min(MAX_CELL, (s ?? baseCellSize) + ZOOM_STEP));
  const zoomOut  = () => setManualCellSize(s => Math.max(MIN_CELL, (s ?? baseCellSize) - ZOOM_STEP));
  const fitScreen = () => setManualCellSize(null);
  const isAuto   = manualCellSize === null;
  const zoomPct  = Math.round((cellSize / baseCellSize) * 100);

  // ── Circuit analysis ────────────────────────────────────────────
  const outerInfo = useMemo(() => analyzeBorder(grid, OUTER), [grid]);
  const innerInfo = useMemo(() => analyzeBorder(grid, INNER), [grid]);
  const exterior  = useMemo(() => computeExterior(grid), [grid]);
  const bothClosed = outerInfo.state === 'closed' && innerInfo.state === 'closed';
  const circuitReady = bothClosed && finishLine !== null;

  // Grid nodes on the finish line (used as placement targets)
  const finishNodes = useMemo(() => {
    if (!finishLine) return [];
    return bresenham(finishLine.r1, finishLine.c1, finishLine.r2, finishLine.c2);
  }, [finishLine]);

  // ── Min-width enforcement ───────────────────────────────────────
  const violatesMinWidth = useCallback((r, c, type) => {
    const opposite = type === OUTER ? INNER : OUTER;
    const g = gridRef.current;
    for (let nr = 0; nr < ROWS; nr++)
      for (let nc = 0; nc < COLS; nc++)
        if (g[nr][nc] === opposite && (nr - r) ** 2 + (nc - c) ** 2 < 16)
          return true;
    return false;
  }, []);

  const triggerWidthError = useCallback(() => {
    setWidthError(true);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setWidthError(false), 3000);
  }, []);

  // ── Editor drawing ──────────────────────────────────────────────
  // Peint une liste de cases en une seule fois. Les cases qui violent la
  // largeur minimale sont ignorées (et déclenchent le message d'erreur),
  // les autres sont peintes : un glissé rapide ne laisse plus de trous.
  const paintCells = useCallback((cells) => {
    let violated = false;
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      for (const [r, c] of cells) {
        if (tool === 'eraser') { next[r][c] = null; continue; }
        if (violatesMinWidth(r, c, tool)) { violated = true; continue; }
        next[r][c] = tool;
      }
      return next;
    });
    if (violated) triggerWidthError();
  }, [tool, violatesMinWidth, triggerWidthError]);

  const placeFinishLine = useCallback((clickR, clickC) => {
    const g = gridRef.current;
    const outerCell = nearestOfType(g, OUTER, clickR, clickC);
    const innerCell = nearestOfType(g, INNER, clickR, clickC);
    if (!outerCell || !innerCell) return;
    setFinishLine({ r1: outerCell[0], c1: outerCell[1], r2: innerCell[0], c2: innerCell[1] });
  }, []);

  const onMouseDown = (r, c) => {
    if (phase !== 'editor') return;
    painting.current = true;
    if (tool === 'finish') { placeFinishLine(r, c); return; }
    lastCell.current = [r, c];
    paintCells([[r, c]]);
  };
  const onMouseEnter = (r, c) => {
    if (phase !== 'editor' || !painting.current || tool === 'finish') return;
    const last = lastCell.current;
    // Relie la dernière case à la nouvelle pour combler les sauts de souris.
    const cells = last ? bresenham(last[0], last[1], r, c) : [[r, c]];
    lastCell.current = [r, c];
    paintCells(cells);
  };
  const stopPainting = () => { painting.current = false; lastCell.current = null; };

  const closeBorder = (type) => {
    const info = type === OUTER ? outerInfo : innerInfo;
    if (info.state !== 'open') return;
    const [[r0, c0], [r1, c1]] = info.endpoints;
    const line = bresenham(r0, c0, r1, c1);
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      line.forEach(([r, c]) => { next[r][c] = type; });
      return next;
    });
  };

  // ── Game launch ─────────────────────────────────────────────────
  const startPlacement = () => {
    const colorIndices = shuffle(Array.from({ length: playerCount }, (_, i) => i));
    setPlayers(colorIndices.map(ci => ({
      color: PLAYER_COLORS[ci],
      name:  PLAYER_NAMES[ci],
      position: null,   // nœud actuel
      prev:     null,   // nœud précédent (pour le vecteur d'inertie)
      penalty:  0,      // tours restants en 1re vitesse après une sortie
      movedAway: false, // a quitté la zone de départ (pour valider l'arrivée)
      trail:    [],     // historique des nœuds visités
    })));
    setCurrentPlayerIdx(0);
    setWinner(null);
    setPhase('placement');
  };
  const launchGame = startPlacement;

  const backToEditor = () => {
    setPhase('editor');
    setPlayers([]);
    setCurrentPlayerIdx(0);
    setWinner(null);
  };

  const resetAll = () => {
    setGrid(createGrid());
    setFinishLine(null);
    setTool(OUTER);
    setManualCellSize(null);
    setPhase('editor');
    setPlayers([]);
    setCurrentPlayerIdx(0);
    setWinner(null);
  };

  // ── Placement ───────────────────────────────────────────────────
  const handleNodeClick = (nr, nc) => {
    if (phase !== 'placement') return;
    if (players.some(p => p.position?.r === nr && p.position?.c === nc)) return;
    setPlayers(prev => prev.map((p, i) =>
      i === currentPlayerIdx
        ? { ...p, position: { r: nr, c: nc }, trail: [{ r: nr, c: nc }] }
        : p
    ));
    const nextIdx = currentPlayerIdx + 1;
    if (nextIdx >= playerCount) {
      setCurrentPlayerIdx(0);
      setPhase('playing');
    } else {
      setCurrentPlayerIdx(nextIdx);
    }
  };

  // ── Coups possibles du joueur actif (point symétrique ± 1 case) ──
  const currentPlayer = players[currentPlayerIdx];
  const candidates = useMemo(() => {
    if (phase !== 'playing' || winner !== null) return [];
    const p = players[currentPlayerIdx];
    if (!p || !p.position) return [];
    const occupied = players
      .filter((q, qi) => qi !== currentPlayerIdx && q.position)
      .map(q => q.position);
    return computeCandidates({
      grid, ext: exterior, pos: p.position, prev: p.prev,
      firstGear: p.penalty > 0, occupied,
    });
  }, [phase, winner, players, currentPlayerIdx, grid, exterior]);

  // ── Jouer un coup ────────────────────────────────────────────────
  const playMove = (tr, tc) => {
    if (phase !== 'playing' || winner !== null) return;
    const cand = candidates.find(k => k.r === tr && k.c === tc);
    if (!cand) return;
    const p = players[currentPlayerIdx];
    const from = p.position;

    // Franchissement de l'arrivée (seulement si le joueur a quitté la zone départ).
    let win = false;
    if (!cand.crash && finishLine && p.movedAway) {
      win = segmentsIntersect(
        [from.r, from.c], [tr, tc],
        [finishLine.r1, finishLine.c1], [finishLine.r2, finishLine.c2]);
    }

    setPlayers(prev => prev.map((pl, i) => {
      if (i !== currentPlayerIdx) return pl;
      if (cand.crash) {
        // Sortie de piste : retour au dernier point sur la piste, vecteur
        // remis à zéro, 4 tours en 1re vitesse.
        const landing = lastClearNode(grid, exterior, from.r, from.c, tr, tc);
        return { ...pl, prev: null, position: landing, penalty: 4,
                 trail: [...pl.trail, landing] };
      }
      const pos = { r: tr, c: tc };
      const away = pl.movedAway || (finishLine &&
        pointSegDist(pos, [finishLine.r1, finishLine.c1],
                          [finishLine.r2, finishLine.c2]) > 4);
      return { ...pl, prev: from, position: pos,
               penalty: Math.max(0, pl.penalty - 1),
               movedAway: away, trail: [...pl.trail, pos] };
    }));

    if (win) { setWinner(currentPlayerIdx); return; }
    setCurrentPlayerIdx(i => (i + 1) % playerCount);
  };

  // ── Derived SVG values ──────────────────────────────────────────
  const carRadius     = Math.max(4, Math.round(cellSize * 0.32));
  const finishStroke  = Math.max(2, Math.round(cellSize / 6));

  // ── Tool definitions ────────────────────────────────────────────
  const toolDefs = [
    { id: OUTER,    label: 'Bord extérieur', bg: 'bg-orange-500' },
    { id: INNER,    label: 'Bord intérieur',  bg: 'bg-blue-500' },
    { id: 'finish', label: "Ligne d'arrivée", bg: 'bg-emerald-500', disabled: !bothClosed },
    { id: 'eraser', label: 'Effacer',          bg: 'bg-gray-600' },
  ];
  const borderDefs = [
    { type: OUTER, label: 'Bord ext.', labelCls: 'text-orange-400', info: outerInfo },
    { type: INNER, label: 'Bord int.', labelCls: 'text-blue-400',   info: innerInfo },
  ];

  return (
    <div
      className="h-full flex flex-col p-3 gap-2 select-none"
      onMouseUp={stopPainting}
      onMouseLeave={stopPainting}
    >
      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">

        {phase === 'editor' ? (
          <>
            {toolDefs.map(t => (
              <button key={t.id} disabled={t.disabled}
                onClick={() => !t.disabled && setTool(t.id)}
                className={`px-3 py-1.5 rounded text-white text-sm font-medium transition-all
                  ${t.bg}
                  ${tool === t.id ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-950 scale-105' : 'opacity-50 hover:opacity-80'}
                  disabled:cursor-not-allowed disabled:opacity-25`}
              >{t.label}</button>
            ))}
            {/* Player count */}
            <div className="flex items-center gap-1 border-l border-gray-700 pl-3">
              <span className="text-xs text-gray-400 mr-1">Joueurs</span>
              {[2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => setPlayerCount(n)}
                  className={`w-7 h-7 rounded text-sm font-bold transition-all
                    ${playerCount === n
                      ? 'bg-violet-500 text-white scale-110'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'}`}
                >{n}</button>
              ))}
            </div>
          </>
        ) : (
          /* Back to editor + visual-aid toggle in non-editor phases */
          <>
            <button onClick={backToEditor}
              className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300"
            >← Modifier le circuit</button>
            {phase === 'playing' && (
              <button onClick={() => setAssist(a => !a)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors
                  ${assist ? 'bg-violet-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                title="Affiche ou masque les coups possibles (point symétrique ± 1)"
              >Aide visuelle : {assist ? 'ON' : 'OFF'}</button>
            )}
          </>
        )}

        {/* Zoom controls — always visible */}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={zoomOut} className="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-base" title="Dézoomer">−</button>
          <button onClick={fitScreen}
            className={`px-2 h-7 rounded text-xs font-mono transition-colors
              ${isAuto ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            title="Adapter à l'écran"
          >{isAuto ? 'auto' : `${zoomPct}%`}</button>
          <button onClick={zoomIn} className="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-base" title="Zoomer">+</button>
        </div>

        <button onClick={resetAll}
          className="px-3 py-1.5 rounded text-white text-sm font-medium bg-red-800 opacity-50 hover:opacity-80"
        >Réinitialiser</button>
      </div>

      {/* ── Editor status row ───────────────────────────────────── */}
      {phase === 'editor' && (
        <div className="shrink-0 flex flex-wrap items-center gap-4 text-sm">
          {borderDefs.map(({ type, label, labelCls, info }) => {
            const s = STATUS[info.state];
            return (
              <div key={type} className="flex items-center gap-2">
                <span className={`font-medium ${labelCls}`}>{label} :</span>
                <span className={s.cls}>{s.label}</span>
                {info.state === 'open' && (
                  <button onClick={() => closeBorder(type)}
                    className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
                  >Fermer</button>
                )}
                {info.state === 'branched' && (
                  <span className="text-xs text-gray-500">(simplifiez)</span>
                )}
              </div>
            );
          })}
          {circuitReady && (
            <button onClick={launchGame}
              className="ml-auto px-4 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors"
            >🏁 Lancer la partie</button>
          )}
        </div>
      )}

      {/* ── Width violation message ─────────────────────────────── */}
      {phase === 'editor' && (
        <div className={`shrink-0 overflow-hidden transition-all duration-300 ${widthError ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-3 py-2 rounded bg-amber-900/50 border border-amber-500/40 text-amber-200 text-sm">
            🏎️ <strong>Trop serré !</strong> Il faut au moins <strong>3 cases</strong> entre les deux bords pour que les voitures puissent manœuvrer.
          </div>
        </div>
      )}

      {/* ── Victory banner ──────────────────────────────────────── */}
      {winner !== null && players[winner] && (
        <div
          className="shrink-0 px-4 py-3 rounded-lg flex flex-wrap items-center gap-3 text-base font-bold"
          style={{ backgroundColor: `${players[winner].color}22`, border: `2px solid ${players[winner].color}` }}
        >
          <span className="text-2xl">🏆</span>
          <span style={{ color: players[winner].color }}>
            Joueur {winner + 1} — {players[winner].name} remporte la course !
          </span>
          <button onClick={startPlacement}
            className="ml-auto px-3 py-1.5 rounded text-sm bg-violet-600 hover:bg-violet-500 text-white">
            Rejouer (même circuit)
          </button>
        </div>
      )}

      {/* ── Current player banner (placement & playing) ─────────── */}
      {winner === null && phase !== 'editor' && currentPlayer && (
        <div
          className="shrink-0 px-4 py-2 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors"
          style={{ backgroundColor: `${currentPlayer.color}22`, border: `1px solid ${currentPlayer.color}66` }}
        >
          <span
            className="w-3 h-3 rounded-full shrink-0 animate-pulse"
            style={{ backgroundColor: currentPlayer.color, boxShadow: `0 0 8px ${currentPlayer.color}` }}
          />
          <span style={{ color: currentPlayer.color }} className="font-bold">
            Joueur {currentPlayerIdx + 1} — {currentPlayer.name}
          </span>
          <span className="text-gray-300">
            {phase === 'placement'
              ? 'clique sur la ligne de départ pour placer ta voiture'
              : currentPlayer.penalty > 0
                ? `sortie de piste — 1re vitesse (${currentPlayer.penalty} tour${currentPlayer.penalty > 1 ? 's' : ''} restant${currentPlayer.penalty > 1 ? 's' : ''})`
                : currentPlayer.prev == null
                  ? 'premier coup : choisis une case adjacente (1 case max)'
                  : 'clique un point vert pour avancer · rouge = sortie de piste'}
          </span>
        </div>
      )}

      {/* ── Scrollable grid container ───────────────────────────── */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto rounded bg-gray-950">
        <div style={{ position: 'relative', width: cellSize * COLS, height: cellSize * ROWS }}>

          {/* Cell grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
          }}>
            {Array.from({ length: ROWS * COLS }, (_, i) => {
              const r = Math.floor(i / COLS), c = i % COLS;
              const type = grid[r][c];
              return (
                <div key={i}
                  className={`border border-gray-800/40 ${phase === 'editor' ? 'cursor-crosshair' : ''}
                    ${CELL_BG[type] ?? (phase === 'editor' ? 'hover:bg-gray-700/50' : '')}`}
                  onMouseDown={() => onMouseDown(r, c)}
                  onMouseEnter={() => onMouseEnter(r, c)}
                />
              );
            })}
          </div>

          {/* SVG overlay — finish line, placement targets, cars */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            width={cellSize * COLS}
            height={cellSize * ROWS}
          >
            {/* Finish line */}
            {finishLine && (
              <g>
                <line
                  x1={finishLine.c1 * cellSize} y1={finishLine.r1 * cellSize}
                  x2={finishLine.c2 * cellSize} y2={finishLine.r2 * cellSize}
                  stroke="#34d399" strokeWidth={finishStroke} strokeLinecap="round"
                />
                <circle cx={finishLine.c1 * cellSize} cy={finishLine.r1 * cellSize} r={finishStroke} fill="#34d399" />
                <circle cx={finishLine.c2 * cellSize} cy={finishLine.r2 * cellSize} r={finishStroke} fill="#34d399" />
              </g>
            )}

            {/* Placement targets (unoccupied finish-line nodes) */}
            {phase === 'placement' && finishNodes.map(([nr, nc], i) => {
              const occupied = players.find(p => p.position?.r === nr && p.position?.c === nc);
              const px = nc * cellSize, py = nr * cellSize;
              if (occupied) return null; // placed car rendered below
              return (
                <circle key={i}
                  cx={px} cy={py} r={carRadius}
                  fill={`${currentPlayer.color}33`}
                  stroke={currentPlayer.color}
                  strokeWidth={2}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => handleNodeClick(nr, nc)}
                />
              );
            })}

            {/* Trajectories */}
            {phase !== 'editor' && players.map((p, i) => {
              if (!p.trail || p.trail.length < 2) return null;
              const pts = p.trail.map(n => `${n.c * cellSize},${n.r * cellSize}`).join(' ');
              return (
                <polyline key={`trail-${i}`} points={pts} fill="none"
                  stroke={p.color} strokeWidth={2} opacity={0.35} strokeLinejoin="round" />
              );
            })}

            {/* Previous position of the active car (for the symmetry calc) */}
            {phase === 'playing' && winner === null && currentPlayer?.prev && (
              <circle
                cx={currentPlayer.prev.c * cellSize} cy={currentPlayer.prev.r * cellSize}
                r={Math.max(3, carRadius * 0.5)} fill="none"
                stroke={currentPlayer.color} strokeWidth={1.5}
                strokeDasharray="3 2" opacity={0.8} />
            )}

            {/* Possible moves (symmetric point ± 1 case) */}
            {phase === 'playing' && winner === null && currentPlayer && candidates.map((k, i) => {
              const px = k.c * cellSize, py = k.r * cellSize;
              const color = k.crash ? '#ef4444' : '#4ade80';
              return (
                <circle key={`cand-${i}`} cx={px} cy={py}
                  r={assist ? Math.max(4, carRadius * 0.7) : 4}
                  fill={assist ? `${color}55` : 'rgba(255,255,255,0.12)'}
                  stroke={assist ? color : 'rgba(255,255,255,0.35)'}
                  strokeWidth={assist ? 2 : 1}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => playMove(k.r, k.c)} />
              );
            })}

            {/* Placed cars */}
            {players.map((p, i) => {
              if (!p.position) return null;
              const px = p.position.c * cellSize, py = p.position.r * cellSize;
              const isCurrent = i === currentPlayerIdx && phase === 'playing';
              return (
                <g key={i}>
                  {isCurrent && (
                    <circle cx={px} cy={py} r={carRadius + 4}
                      fill="none" stroke={p.color} strokeWidth={2} opacity={0.5}
                      style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                    />
                  )}
                  <circle cx={px} cy={py} r={carRadius}
                    fill={p.color}
                    stroke={isCurrent ? 'white' : 'rgba(0,0,0,0.4)'}
                    strokeWidth={isCurrent ? 2 : 1}
                  />
                  {/* Turn order number inside car */}
                  <text
                    x={px} y={py}
                    textAnchor="middle" dominantBaseline="central"
                    fontSize={Math.max(6, carRadius * 0.9)}
                    fontWeight="bold"
                    fill={isCurrent ? '#111' : 'rgba(0,0,0,0.7)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{i + 1}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── Player bar (placement & playing) ────────────────────── */}
      {phase !== 'editor' && players.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 py-1 overflow-x-auto">
          <span className="text-xs text-gray-500 shrink-0">Ordre :</span>
          {players.map((p, i) => {
            const isCurrent = i === currentPlayerIdx;
            const isPlaced = p.position !== null;
            return (
              <div key={i}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium shrink-0 transition-all duration-300
                  ${isCurrent ? 'scale-110' : 'opacity-50'}`}
                style={{
                  backgroundColor: isCurrent ? `${p.color}33` : 'transparent',
                  border: `1.5px solid ${isCurrent ? p.color : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: isCurrent ? `0 0 10px ${p.color}55` : 'none',
                }}
              >
                <span className="text-xs text-gray-400 font-mono">{i + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span style={{ color: isCurrent ? p.color : '#9ca3af' }}>{p.name}</span>
                {isPlaced && phase === 'placement' && (
                  <span className="text-xs text-gray-500">✓</span>
                )}
                {isCurrent && <span className="text-xs" style={{ color: p.color }}>◀</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Editor instructions ──────────────────────────────────── */}
      {phase === 'editor' && (
        <p className="shrink-0 text-xs text-gray-600">
          Cliquer-glisser pour tracer · «&nbsp;Fermer&nbsp;» referme un bord ouvert · La ligne d&apos;arrivée se place en un clic une fois les deux bords fermés
        </p>
      )}
    </div>
  );
}
