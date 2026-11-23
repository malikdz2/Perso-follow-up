import { useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { Maximize2, Minus, Plus, ZoomIn } from 'lucide-react';
import { MAP_HEIGHT, MAP_PROJ, MAP_WIDTH, WILAYA_PATHS } from '../data/algeria-map';
import { WILAYAS } from '../data/wilayas';

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL: ViewBox = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };
const MIN_W = MAP_WIDTH / 14;

/** Cadre « Nord » : bande côtière et Hauts-Plateaux, où les wilayas sont petites. */
function northBox(): ViewBox {
  const px = (lon: number) => (lon - MAP_PROJ.lonMin) * MAP_PROJ.kx * MAP_PROJ.scale;
  const py = (lat: number) => (MAP_PROJ.latMax - lat) * MAP_PROJ.scale;
  const x = px(-2.4);
  const w = px(8.8) - x;
  return { x, y: py(37.15), w, h: w * (MAP_HEIGHT / MAP_WIDTH) };
}

function clamp(v: ViewBox): ViewBox {
  const w = Math.min(MAP_WIDTH, Math.max(MIN_W, v.w));
  const h = w * (MAP_HEIGHT / MAP_WIDTH);
  return { w, h, x: Math.min(MAP_WIDTH - w, Math.max(0, v.x)), y: Math.min(MAP_HEIGHT - h, Math.max(0, v.y)) };
}

/** Niveau de couleur : 0 = non visitée, 1 = 1 mission, 2 = 2 missions ou plus. */
export type VisitLevel = 0 | 1 | 2;

const FILL: Record<VisitLevel, string> = {
  0: 'fill-slate-300 dark:fill-slate-700',
  1: 'fill-green-300 dark:fill-green-800',
  2: 'fill-green-700 dark:fill-green-500',
};

export function AlgeriaMap({
  levels,
  selected,
  onSelect,
}: {
  levels: Map<number, VisitLevel>;
  selected: number | null;
  onSelect: (code: number | null) => void;
}) {
  const [vb, setVb] = useState<ViewBox>(FULL);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, pinchDist: 0 });

  /** Zoom de facteur `f` autour d'un point écran (cx, cy). */
  const zoomAt = (f: number, cx?: number, cy?: number) =>
    setVb((v) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const rx = rect && cx !== undefined ? (cx - rect.left) / rect.width : 0.5;
      const ry = rect && cy !== undefined ? (cy - rect.top) / rect.height : 0.5;
      const w = Math.min(MAP_WIDTH, Math.max(MIN_W, v.w / f));
      const h = w * (MAP_HEIGHT / MAP_WIDTH);
      return clamp({ w, h, x: v.x + (v.w - w) * rx, y: v.y + (v.h - h) * ry });
    });

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinchDist: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const rect = svgRef.current!.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      gesture.current.moved += Math.abs(dx) + Math.abs(dy);
      setVb((v) => clamp({ ...v, x: v.x - (dx * v.w) / rect.width, y: v.y - (dy * v.h) / rect.height }));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinchDist > 0) zoomAt(dist / gesture.current.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current.pinchDist = dist;
      gesture.current.moved += 100; // un pincement n'est jamais un « toucher »
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!wasSingle || gesture.current.moved > 8) return;
    // Toucher : quelle wilaya est sous le doigt ?
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-code]');
    onSelect(el ? Number(el.getAttribute('data-code')) : null);
  };

  const onWheel = (e: RWheelEvent<SVGSVGElement>) => zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX, e.clientY);

  const zoomed = vb.w < MAP_WIDTH * 0.55;
  const fontSize = vb.w / 45;
  const btn = 'flex h-11 min-w-11 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200 active:bg-slate-100 dark:bg-slate-900 dark:ring-slate-700';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-sky-50 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="block aspect-[1000/994] w-full touch-none select-none"
        role="img"
        aria-label="Carte des 69 wilayas d'Algérie"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={onWheel}
      >
        <g strokeLinejoin="round">
          {WILAYAS.map((w) => (
            <path
              key={w.code}
              data-code={w.code}
              d={WILAYA_PATHS[w.code]}
              className={`${FILL[levels.get(w.code) ?? 0]} stroke-white dark:stroke-slate-950`}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            >
              <title>{`${String(w.code).padStart(2, '0')} — ${w.name}`}</title>
            </path>
          ))}
        </g>
        {selected !== null && WILAYA_PATHS[selected] && (
          <path d={WILAYA_PATHS[selected]} className="pointer-events-none fill-none stroke-amber-500" strokeWidth={3} vectorEffect="non-scaling-stroke" />
        )}
        {zoomed && (
          <g className="pointer-events-none fill-slate-800 dark:fill-slate-100" style={{ fontSize, fontWeight: 700 }} textAnchor="middle" dominantBaseline="central">
            {WILAYAS.map((w) => (
              <text key={w.code} x={w.x} y={w.y} paintOrder="stroke" className="stroke-white/80 dark:stroke-slate-950/80" strokeWidth={fontSize / 5}>
                {w.code}
              </text>
            ))}
          </g>
        )}
      </svg>
      <p className="pointer-events-none absolute bottom-12 left-2 text-[10px] text-slate-500 dark:text-slate-400">© OpenStreetMap</p>
      <div className="flex gap-1.5 border-t border-slate-200 bg-white/80 p-1.5 dark:border-slate-800 dark:bg-slate-950/60">
        <button type="button" aria-label="Dézoomer" className={btn} onClick={() => zoomAt(1 / 1.6)}>
          <Minus className="size-5" />
        </button>
        <button type="button" aria-label="Zoomer" className={btn} onClick={() => zoomAt(1.6)}>
          <Plus className="size-5" />
        </button>
        <button type="button" className={`${btn} flex-1 gap-1.5 px-3 text-sm font-semibold`} onClick={() => setVb(clamp(northBox()))}>
          <ZoomIn className="size-4" /> Nord
        </button>
        <button type="button" className={`${btn} flex-1 gap-1.5 px-3 text-sm font-semibold`} onClick={() => setVb(FULL)}>
          <Maximize2 className="size-4" /> Tout
        </button>
      </div>
    </div>
  );
}
