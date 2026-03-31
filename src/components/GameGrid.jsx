import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

const ROWS = 40;
const COLS = 64;
const OUTER = 'outer';
const INNER = 'inner';
const FINISH = 'finish';
const MIN_CELL = 6;
const MAX_CELL = 48;
const ZOOM_STEP = 3;

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
    if (e2 < dr) { err += dr; c += sc; }
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
        visited.add(key);
        queue.push([nr, nc]);
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

const CELL_BG = {
  [OUTER]:  'bg-orange-500',
  [INNER]:  'bg-blue-500',
  [FINISH]: 'bg-emerald-400',
};

const STATUS = {
  empty:        { label: '—',             cls: 'text-gray-500' },
  closed:       { label: '✓ Fermé',       cls: 'text-emerald-400' },
  open:         { label: '◌ Ouvert',      cls: 'text-yellow-400' },
  branched:     { label: '✗ Branches',    cls: 'text-red-400' },
  disconnected: { label: '✗ Déconnecté', cls: 'text-red-400' },
};

export default function GameGrid() {
  const [grid, setGrid] = useState(createGrid);
  const [tool, setTool] = useState(OUTER);
  const [widthError, setWidthError] = useState(false);
  // null = auto-fit; number = manual override in px
  const [manualCellSize, setManualCellSize] = useState(null);
  const [containerSize, setContainerSize] = useState({ w: 900, h: 500 });

  const painting = useRef(false);
  const gridRef = useRef(grid);
  const errorTimer = useRef(null);
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

  const baseCellSize = Math.max(
    MIN_CELL,
    Math.floor(Math.min(containerSize.w / COLS, containerSize.h / ROWS))
  );
  const cellSize = manualCellSize ?? baseCellSize;

  const zoomIn  = () => setManualCellSize(s => Math.min(MAX_CELL, (s ?? baseCellSize) + ZOOM_STEP));
  const zoomOut = () => setManualCellSize(s => Math.max(MIN_CELL, (s ?? baseCellSize) - ZOOM_STEP));
  const fitScreen = () => setManualCellSize(null);

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

  const paint = useCallback((r, c) => {
    if ((tool === OUTER || tool === INNER) && violatesMinWidth(r, c, tool)) {
      triggerWidthError();
      return;
    }
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = tool === 'eraser' ? null : tool;
      return next;
    });
  }, [tool, violatesMinWidth, triggerWidthError]);

  const placeFinishLine = useCallback((clickR, clickC) => {
    setGrid(prev => {
      const outerCell = nearestOfType(prev, OUTER, clickR, clickC);
      const innerCell = nearestOfType(prev, INNER, clickR, clickC);
      if (!outerCell || !innerCell) return prev;
      const line = bresenham(outerCell[0], outerCell[1], innerCell[0], innerCell[1]);
      const next = prev.map(row => [...row]);
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (next[r][c] === FINISH) next[r][c] = null;
      line.forEach(([r, c]) => {
        if (next[r][c] !== OUTER && next[r][c] !== INNER) next[r][c] = FINISH;
      });
      return next;
    });
  }, []);

  const onMouseDown = (r, c) => {
    painting.current = true;
    if (tool === FINISH) placeFinishLine(r, c);
    else paint(r, c);
  };
  const onMouseEnter = (r, c) => { if (painting.current && tool !== FINISH) paint(r, c); };
  const stopPainting = () => { painting.current = false; };

  const outerInfo = useMemo(() => analyzeBorder(grid, OUTER), [grid]);
  const innerInfo = useMemo(() => analyzeBorder(grid, INNER), [grid]);
  const bothClosed = outerInfo.state === 'closed' && innerInfo.state === 'closed';

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

  const toolDefs = [
    { id: OUTER,    label: 'Bord extérieur', bg: 'bg-orange-500' },
    { id: INNER,    label: 'Bord intérieur',  bg: 'bg-blue-500' },
    { id: FINISH,   label: "Ligne d'arrivée", bg: 'bg-emerald-500', disabled: !bothClosed },
    { id: 'eraser', label: 'Effacer',          bg: 'bg-gray-600' },
  ];

  const borderDefs = [
    { type: OUTER, label: 'Bord ext.',  labelCls: 'text-orange-400', info: outerInfo },
    { type: INNER, label: 'Bord int.',  labelCls: 'text-blue-400',   info: innerInfo },
  ];

  const isAuto = manualCellSize === null;
  const zoomPct = Math.round((cellSize / baseCellSize) * 100);

  return (
    <div
      className="h-full flex flex-col p-3 gap-2 select-none"
      onMouseUp={stopPainting}
      onMouseLeave={stopPainting}
    >
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2">
        {toolDefs.map(t => (
          <button
            key={t.id}
            disabled={t.disabled}
            onClick={() => !t.disabled && setTool(t.id)}
            className={`px-3 py-1.5 rounded text-white text-sm font-medium transition-all
              ${t.bg}
              ${tool === t.id ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-950 scale-105' : 'opacity-50 hover:opacity-80'}
              disabled:cursor-not-allowed disabled:opacity-25`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-base leading-none"
            title="Dézoomer"
          >−</button>
          <button
            onClick={fitScreen}
            className={`px-2 h-7 rounded text-xs font-mono transition-colors
              ${isAuto ? 'bg-gray-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            title="Adapter à l'écran"
          >
            {isAuto ? 'auto' : `${zoomPct}%`}
          </button>
          <button
            onClick={zoomIn}
            className="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-white text-base leading-none"
            title="Zoomer"
          >+</button>
        </div>
        <button
          onClick={() => { setGrid(createGrid()); setTool(OUTER); setManualCellSize(null); }}
          className="px-3 py-1.5 rounded text-white text-sm font-medium bg-red-800 opacity-50 hover:opacity-80"
        >
          Réinitialiser
        </button>
      </div>

      {/* Border status */}
      <div className="shrink-0 flex flex-wrap gap-4 text-sm">
        {borderDefs.map(({ type, label, labelCls, info }) => {
          const s = STATUS[info.state];
          return (
            <div key={type} className="flex items-center gap-2">
              <span className={`font-medium ${labelCls}`}>{label} :</span>
              <span className={s.cls}>{s.label}</span>
              {info.state === 'open' && (
                <button
                  onClick={() => closeBorder(type)}
                  className="px-2 py-0.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-white"
                >Fermer</button>
              )}
              {info.state === 'branched' && (
                <span className="text-xs text-gray-500">(simplifiez)</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Width violation message */}
      <div className={`shrink-0 overflow-hidden transition-all duration-300 ${widthError ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-3 py-2 rounded bg-amber-900/50 border border-amber-500/40 text-amber-200 text-sm">
          🏎️ <strong>Trop serré !</strong> Il faut au moins <strong>3 cases</strong> entre les deux bords pour que les voitures puissent manœuvrer.
        </div>
      </div>

      {/* Scrollable grid container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto rounded bg-gray-950"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${ROWS}, ${cellSize}px)`,
            width: cellSize * COLS,
            height: cellSize * ROWS,
          }}
        >
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const r = Math.floor(i / COLS), c = i % COLS;
            const type = grid[r][c];
            return (
              <div
                key={i}
                className={`border border-gray-800/40 cursor-crosshair
                  ${CELL_BG[type] ?? 'hover:bg-gray-700/50'}`}
                onMouseDown={() => onMouseDown(r, c)}
                onMouseEnter={() => onMouseEnter(r, c)}
              />
            );
          })}
        </div>
      </div>

      <p className="shrink-0 text-xs text-gray-600">
        Cliquer-glisser pour tracer · "Fermer" referme un bord ouvert · La ligne d'arrivée se place en un clic une fois les deux bords fermés
      </p>
    </div>
  );
}
