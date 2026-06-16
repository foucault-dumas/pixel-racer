import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

const ROWS = 40;
const COLS = 64;
const OUTER = 'outer';
const INNER = 'inner';
const MIN_CELL = 6;
const MAX_CELL = 48;
const ZOOM_STEP = 3;

const PLAYER_COLORS = ['#ef4444', '#818cf8', '#facc15', '#4ade80', '#f472b6', '#67e8f9'];
const PLAYER_NAMES  = ['Rouge',   'Indigo',  'Jaune',   'Vert',    'Rose',    'Cyan'];

const createGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function bresenham(r0, c0, r1, c1) {
  const pts = [];
  let dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  let sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dr - dc, r = r0, c = c0;
  for (;;) {
    pts.push([r, c]);
    if (r === r1 && c === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr)  { err += dr; c += sc; }
  }
  return pts;
}

function neighbors8(r, c) {
  const ns = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) ns.push([nr, nc]);
    }
  return ns;
}

function analyzeBorder(grid, type) {
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === type) cells.push([r, c]);
  if (cells.length === 0) return { state: 'empty' };

  const visited = new Set();
  const queue = [cells[0]];
  visited.add(cells[0].join(','));
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of neighbors8(r, c)) {
      const key = `${nr},${nc}`;
      if (grid[nr][nc] === type && !visited.has(key)) {
        visited.add(key); queue.push([nr, nc]);
      }
    }
  }
  if (visited.size !== cells.length) return { state: 'disconnected' };

  const endpoints = cells.filter(([r, c]) =>
    neighbors8(r, c).filter(([nr, nc]) => grid[nr][nc] === type).length <= 1
  );
  if (endpoints.length === 0) return { state: 'closed' };
  if (endpoints.length === 2) return { state: 'open', endpoints };
  return { state: 'branched', endpoints };
}

function nearestOfType(grid, type, r, c) {
  let best = null, bestDist = Infinity;
  for (let nr = 0; nr < ROWS; nr++)
    for (let nc = 0; nc < COLS; nc++)
      if (grid[nr][nc] === type) {
        const d = (nr - r) ** 2 + (nc - c) ** 2;
        if (d < bestDist) { bestDist = d; best = [nr, nc]; }
      }
  return best;
}

const CELL_BG = { [OUTER]: 'bg-orange-500', [INNER]: 'bg-blue-500' };

const STATUS = {
  empty:        { label: '—',             cls: 'text-gray-500' },
  closed:       { label: '✓ Fermé',       cls: 'text-emerald-400' },
  open:         { label: '◌ Ouvert',      cls: 'text-yellow-400' },
  branched:     { label: '✗ Branches',    cls: 'text-red-400' },
  disconnected: { label: '✗ Déconnecté', cls: 'text-red-400' },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  const launchGame = () => {
    const colorIndices = shuffle(Array.from({ length: playerCount }, (_, i) => i));
    setPlayers(colorIndices.map(ci => ({
      color: PLAYER_COLORS[ci],
      name:  PLAYER_NAMES[ci],
      position: null,
    })));
    setCurrentPlayerIdx(0);
    setPhase('placement');
  };

  const backToEditor = () => {
    setPhase('editor');
    setPlayers([]);
    setCurrentPlayerIdx(0);
  };

  const resetAll = () => {
    setGrid(createGrid());
    setFinishLine(null);
    setTool(OUTER);
    setManualCellSize(null);
    setPhase('editor');
    setPlayers([]);
    setCurrentPlayerIdx(0);
  };

  // ── Placement ───────────────────────────────────────────────────
  const handleNodeClick = (nr, nc) => {
    if (phase !== 'placement') return;
    if (players.some(p => p.position?.r === nr && p.position?.c === nc)) return;
    setPlayers(prev => prev.map((p, i) =>
      i === currentPlayerIdx ? { ...p, position: { r: nr, c: nc } } : p
    ));
    const nextIdx = currentPlayerIdx + 1;
    if (nextIdx >= playerCount) {
      setCurrentPlayerIdx(0);
      setPhase('playing');
    } else {
      setCurrentPlayerIdx(nextIdx);
    }
  };

  // ── Derived SVG values ──────────────────────────────────────────
  const carRadius     = Math.max(4, Math.round(cellSize * 0.32));
  const finishStroke  = Math.max(2, Math.round(cellSize / 6));
  const currentPlayer = players[currentPlayerIdx];

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
          /* Back to editor button in non-editor phases */
          <button onClick={backToEditor}
            className="px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300"
          >← Modifier le circuit</button>
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

      {/* ── Current player banner (placement & playing) ─────────── */}
      {phase !== 'editor' && currentPlayer && (
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
              : "c'est ton tour"}
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
