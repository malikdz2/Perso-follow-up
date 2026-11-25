import { Camera, Check } from 'lucide-react';
import type { InspectionShot } from '../../db/db';
import type { InspectionSummary, ViewState } from '../../lib/damage/inspections';
import { VIEWS, type ViewKey } from '../../lib/damage/views';
import { useBlobUrl } from '../../lib/useBlobUrl';
import { cx } from '../../lib/cx';

const STATE: Record<ViewState, { ring: string; text: string }> = {
  vide: { ring: 'border-2 border-dashed border-slate-300 dark:border-slate-600', text: 'à photographier' },
  photo: { ring: 'ring-3 ring-emerald-500', text: 'photo prise' },
  ok: { ring: 'ring-3 ring-emerald-500', text: 'rien de nouveau' },
  a_verifier: { ring: 'ring-3 ring-amber-400', text: 'à vérifier' },
  degat: { ring: 'ring-3 ring-red-500', text: 'dégât' },
};

function Spot({ view, shot, s, onClick }: { view: (typeof VIEWS)[number]; shot?: InspectionShot; s: InspectionSummary['views'][ViewKey]; onClick: () => void }) {
  const url = useBlobUrl(shot?.blob);
  const count = s.state === 'a_verifier' ? s.toReview : s.state === 'degat' ? s.confirmed : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${view.label} : ${STATE[s.state].text}${count ? ` (${count})` : ''}`}
      className="absolute flex w-[22%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
      style={{ left: `${view.pos.x}%`, top: `${view.pos.y}%` }}
    >
      <span className={cx('relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-white dark:bg-slate-900', STATE[s.state].ring)}>
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <Camera className="size-5 text-slate-400" />}
        {s.state === 'ok' && (
          <span className="absolute right-0.5 bottom-0.5 rounded-full bg-emerald-600 p-0.5 text-white">
            <Check className="size-3" />
          </span>
        )}
        {count > 0 && (
          <span className={cx('absolute top-0.5 right-0.5 min-w-5 rounded-full px-1 text-xs font-bold text-white', s.state === 'degat' ? 'bg-red-600' : 'bg-amber-500')}>{count}</span>
        )}
      </span>
      <span className="text-[11px] leading-tight font-semibold">{view.label}</span>
      <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">{STATE[s.state].text}</span>
    </button>
  );
}

/** Schéma de la voiture vue de dessus, avec les 8 prises de vue autour. */
export function CarDiagram({ shots, summary, onSelect }: { shots: InspectionShot[]; summary: InspectionSummary; onSelect: (v: ViewKey) => void }) {
  return (
    <div className="relative mx-auto aspect-[1/1.15] w-full max-w-sm">
      <svg viewBox="0 0 200 230" className="absolute inset-0 size-full" aria-hidden>
        <g className="fill-slate-200 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600" strokeWidth="1.5">
          {/* roues */}
          {[
            [70, 72],
            [130, 72],
            [70, 160],
            [130, 160],
          ].map(([x, y]) => (
            <rect key={`${x}${y}`} x={x - 7} y={y - 13} width="14" height="26" rx="4" className="fill-slate-500 stroke-none dark:fill-slate-500" />
          ))}
          {/* carrosserie */}
          <path d="M72 38 Q100 28 128 38 L134 60 L136 180 Q134 196 126 200 L74 200 Q66 196 64 180 L66 60 Z" />
          {/* pare-brise, toit, lunette */}
          <path d="M74 78 Q100 70 126 78 L122 98 Q100 94 78 98 Z" className="fill-sky-200 dark:fill-sky-900" />
          <rect x="78" y="100" width="44" height="52" rx="6" className="fill-slate-300 dark:fill-slate-700" />
          <path d="M78 154 Q100 158 122 154 L125 172 Q100 177 75 172 Z" className="fill-sky-200 dark:fill-sky-900" />
          {/* rétroviseurs */}
          <path d="M66 82 L57 86 L57 92 L66 92 Z" />
          <path d="M134 82 L143 86 L143 92 L134 92 Z" />
        </g>
        <text x="100" y="22" textAnchor="middle" className="fill-slate-500 text-[9px] font-semibold dark:fill-slate-400">
          ▲ AVANT
        </text>
      </svg>
      {VIEWS.map((v) => (
        <Spot key={v.key} view={v} shot={shots.find((s) => s.view === v.key)} s={summary.views[v.key]} onClick={() => onSelect(v.key)} />
      ))}
    </div>
  );
}
