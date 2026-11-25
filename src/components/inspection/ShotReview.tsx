import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, Check, Pencil, RefreshCw, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { db, type Damage, type Inspection } from '../../db/db';
import { useSettings } from '../../db/settings';
import { addManualDamage, analyzeView, shotOf } from '../../lib/damage/inspections';
import { aiErrorMessage, analyzeViewWithAI } from '../../lib/damage/ai';
import { VIEW_BY_KEY, type ViewKey } from '../../lib/damage/views';
import type { Box } from '../../lib/damage/detect';
import { useBlobUrl } from '../../lib/useBlobUrl';
import { SOURCE_LABEL, damageTitle } from '../../lib/damage/labels';
import { cx } from '../../lib/cx';
import { Button } from '../ui';

function boxColor(d: Damage) {
  return d.status === 'confirme' ? '#ef4444' : d.status === 'ignore' ? '#94a3b8' : '#f59e0b';
}

/** Revue d'une prise de vue : zones détectées, confirmation, ajout à la main, analyse IA. */
export function ShotReview({ inspection, view, onClose, onRetake }: { inspection: Inspection; view: ViewKey; onClose: () => void; onRetake: () => void }) {
  const settings = useSettings();
  const def = VIEW_BY_KEY[view];
  const isReturn = inspection.kind === 'retour';
  const data = useLiveQuery(async () => {
    const [shot, depShot, damages, known] = await Promise.all([
      shotOf(inspection.id!, view),
      inspection.departureId ? shotOf(inspection.departureId, view) : undefined,
      db.damages.where('[inspectionId+view]').equals([inspection.id!, view]).sortBy('createdAt'),
      inspection.departureId ? db.damages.where('[inspectionId+view]').equals([inspection.departureId, view]).filter((d) => d.status === 'confirme').toArray() : [],
    ]);
    return { shot, depShot, damages, known };
  }, [inspection.id, inspection.departureId, view]);
  const [showDeparture, setShowDeparture] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Box | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const url = useBlobUrl(showDeparture ? data?.depShot?.blob : data?.shot?.blob);
  if (!data || !settings) return null;
  const { shot, damages, known } = data;
  const visible = damages.filter((d) => showIgnored || d.status !== 'ignore');
  const numbered = new Map(damages.map((d, i) => [d.id!, i + 1]));

  const rel = (e: RPointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    frame.current!.setPointerCapture(e.pointerId);
    start.current = rel(e);
    setDraft({ ...start.current, w: 0, h: 0 });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drawing || !start.current) return;
    const p = rel(e);
    const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = async () => {
    if (!drawing || !start.current || !draft) return;
    start.current = null;
    // Un simple toucher crée une petite zone centrée.
    const b = draft.w < 0.02 || draft.h < 0.02 ? { x: Math.max(0, draft.x - 0.04), y: Math.max(0, draft.y - 0.05), w: 0.08, h: 0.1 } : draft;
    const id = await addManualDamage(inspection.id!, view, b, 'confirme');
    setDraft(null);
    setDrawing(false);
    setSelected(id as number);
  };

  const rerun = async () => {
    setBusy('compare');
    try {
      const r = await analyzeView(inspection, view, { useMask: settings.damageUseMask, sensitivity: settings.damageSensitivity });
      setMsg(r ? { ok: !r.misaligned, text: r.misaligned ? 'Photos trop différentes : reprenez la photo en superposant celle du départ.' : `${r.fresh} zone${r.fresh > 1 ? 's' : ''} à vérifier${r.known ? ` · ${r.known} déjà connue${r.known > 1 ? 's' : ''}` : ''}.` } : null);
    } finally {
      setBusy('');
    }
  };

  const runAI = async () => {
    if (!settings.aiApiKey) return;
    setBusy('ai');
    setMsg(null);
    try {
      const r = await analyzeViewWithAI(settings.aiApiKey, inspection, view);
      setMsg({ ok: true, text: `Analyse IA terminée : ${r.reviewed} zone${r.reviewed > 1 ? 's' : ''} examinée${r.reviewed > 1 ? 's' : ''}, ${r.added} dégât${r.added > 1 ? 's' : ''} ajouté${r.added > 1 ? 's' : ''}. Vérifiez puis confirmez.` });
    } catch (e) {
      setMsg({ ok: false, text: aiErrorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  const toReview = damages.filter((d) => d.status === 'a_verifier');

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-slate-50 dark:bg-slate-950" role="dialog" aria-modal="true" aria-label={`Vue ${def.label}`}>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur dark:bg-slate-950/95">
        <div className="min-w-0 flex-1 pl-2">
          <p className="text-lg font-bold">{def.label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{isReturn ? 'Retour — comparaison avec le départ' : 'Départ — relevez les dégâts déjà présents'}</p>
        </div>
        <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
          <X className="size-6" />
        </button>
      </div>

      <div className="mx-auto w-full max-w-md space-y-3 px-4 pb-8">
        {!shot ? (
          <Button block onClick={onRetake}>
            <Camera className="size-5" /> Prendre la photo
          </Button>
        ) : (
          <>
            <div
              ref={frame}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => void onUp()}
              className={cx('relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-200 select-none dark:bg-slate-800', drawing && 'touch-none ring-3 ring-emerald-500')}
            >
              {url && <img src={url} alt={showDeparture ? 'Photo de départ' : 'Photo'} className="pointer-events-none size-full object-cover" draggable={false} />}
              <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
                {(showDeparture || !isReturn) &&
                  known.map((k) => <rect key={`k${k.id}`} x={k.x * 100} y={k.y * 75} width={k.w * 100} height={k.h * 75} fill="none" stroke="#38bdf8" strokeWidth="0.6" strokeDasharray="1.5 1" />)}
                {!showDeparture &&
                  visible.map((d) => (
                    <g key={d.id}>
                      <rect
                        x={d.x * 100}
                        y={d.y * 75}
                        width={d.w * 100}
                        height={d.h * 75}
                        fill={selected === d.id ? 'rgb(255 255 255 / 0.15)' : 'none'}
                        stroke={boxColor(d)}
                        strokeWidth={selected === d.id ? 1.1 : 0.7}
                        strokeDasharray={d.status === 'ignore' ? '1.5 1' : undefined}
                      />
                      <text x={d.x * 100 + 0.6} y={Math.max(3, d.y * 75 - 0.8)} fontSize="3.2" fontWeight="700" fill={boxColor(d)} stroke="black" strokeWidth="0.25" paintOrder="stroke">
                        {numbered.get(d.id!)}
                      </text>
                    </g>
                  ))}
                {draft && <rect x={draft.x * 100} y={draft.y * 75} width={draft.w * 100} height={draft.h * 75} fill="rgb(16 185 129 / 0.2)" stroke="#10b981" strokeWidth="0.7" />}
              </svg>
              {showDeparture && <span className="absolute top-2 left-2 rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white">Photo de départ</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              {isReturn && data.depShot && (
                <Button variant="secondary" className="flex-1 text-sm" onPointerDown={() => setShowDeparture(true)} onPointerUp={() => setShowDeparture(false)} onPointerLeave={() => setShowDeparture(false)}>
                  Maintenir : départ
                </Button>
              )}
              <Button variant={drawing ? 'primary' : 'secondary'} className="flex-1 text-sm" onClick={() => setDrawing(!drawing)} aria-pressed={drawing}>
                <Pencil className="size-4" /> {drawing ? 'Tracez la zone…' : isReturn ? 'Ajouter un dégât' : 'Marquer un dégât existant'}
              </Button>
              <Button variant="secondary" className="flex-1 text-sm" onClick={onRetake}>
                <Camera className="size-4" /> Reprendre
              </Button>
            </div>

            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-amber-500 align-middle" />à vérifier</span>
              <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-red-500 align-middle" />{isReturn ? 'nouveau dégât' : 'dégât existant'}</span>
              {isReturn && <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-sky-400 align-middle" />déjà présent au départ</span>}
              <span><span className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-slate-400 align-middle" />écarté</span>
            </p>

            {isReturn && shot.analysis && (
              <p className={cx('rounded-xl p-3 text-sm', shot.analysis.misaligned ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800')}>
                {shot.analysis.misaligned
                  ? '⚠️ Photos trop différentes (angle, distance, lumière ou décor) : reprenez la photo en superposant celle du départ, sinon vérifiez à l’œil.'
                  : `Comparaison avec le départ : ${shot.analysis.candidates} zone${shot.analysis.candidates > 1 ? 's' : ''} trouvée${shot.analysis.candidates > 1 ? 's' : ''}${shot.analysis.known ? `, ${shot.analysis.known} déjà connue${shot.analysis.known > 1 ? 's' : ''}` : ''} · cadrage ${shot.analysis.alignment > 0.75 ? 'bon' : 'moyen'}.`}
              </p>
            )}
            {shot.ai && (
              <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">
                ✨ IA : photo {shot.ai.quality}
                {shot.ai.remarks ? ` — ${shot.ai.remarks}` : ''}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              {isReturn && (
                <Button variant="secondary" className="text-sm" onClick={() => void rerun()} disabled={!!busy}>
                  <RefreshCw className={cx('size-4', busy === 'compare' && 'animate-spin')} /> Recomparer
                </Button>
              )}
              {settings.aiApiKey ? (
                <Button className={cx('text-sm', !isReturn && 'col-span-2')} onClick={() => void runAI()} disabled={!!busy}>
                  <Sparkles className={cx('size-4', busy === 'ai' && 'animate-pulse')} /> {busy === 'ai' ? 'Analyse…' : 'Analyse IA'}
                </Button>
              ) : (
                <Link to="/reglages" className={cx('flex min-h-11 items-center justify-center rounded-xl text-center text-xs text-slate-500 ring-1 ring-slate-200 dark:ring-slate-800', !isReturn && 'col-span-2')}>
                  Analyse IA : ajoutez une clé dans Réglages
                </Link>
              )}
            </div>
            {msg && (
              <p role="status" className={cx('text-sm font-medium', msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {msg.text}
              </p>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {isReturn ? 'Zones et dégâts' : 'Dégâts existants'} {toReview.length > 0 && <span className="text-sm font-normal text-amber-600">({toReview.length} à vérifier)</span>}
                </h3>
                {damages.some((d) => d.status === 'ignore') && (
                  <button type="button" className="min-h-11 text-xs text-slate-500 underline" onClick={() => setShowIgnored(!showIgnored)}>
                    {showIgnored ? 'Masquer les écartés' : 'Voir les écartés'}
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                <p className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-sm text-slate-500 dark:border-slate-800">
                  {isReturn ? 'Aucune zone suspecte. Touchez « Ajouter un dégât » si vous en voyez un.' : 'Aucun dégât relevé. Marquez les rayures déjà présentes pour qu’elles ne soient pas signalées au retour.'}
                </p>
              ) : (
                visible.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => setSelected(d.id!)}
                    className={cx('rounded-xl bg-white p-3 ring-1 dark:bg-slate-900', selected === d.id ? 'ring-2 ring-emerald-500' : 'ring-slate-200 dark:ring-slate-800')}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1 size-3 shrink-0 rounded-sm" style={{ background: boxColor(d) }} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">
                          {damageTitle(d, numbered.get(d.id!)).replace('Dégât', 'Zone')}{' '}
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            · {SOURCE_LABEL[d.source]} · {d.status === 'confirme' ? (isReturn ? 'nouveau dégât' : 'existant') : d.status === 'ignore' ? 'écarté' : 'à vérifier'}
                          </span>
                        </p>
                        {d.description && <p>{d.description}</p>}
                        {d.aiVerdict && <p className="text-violet-700 dark:text-violet-300">✨ {d.aiVerdict}</p>}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      {d.status !== 'confirme' && (
                        <Button className="flex-1 px-2 text-sm" onClick={() => void db.damages.update(d.id!, { status: 'confirme' })}>
                          <Check className="size-4" /> {isReturn ? 'Nouveau dégât' : 'Confirmer'}
                        </Button>
                      )}
                      {d.status !== 'ignore' && d.source !== 'manuel' && (
                        <Button variant="secondary" className="flex-1 px-2 text-sm" onClick={() => void db.damages.update(d.id!, { status: 'ignore' })}>
                          <X className="size-4" /> Écarter
                        </Button>
                      )}
                      {d.status !== 'a_verifier' && d.source !== 'manuel' && (
                        <Button variant="ghost" className="px-2 text-sm" aria-label="Annuler la décision" onClick={() => void db.damages.update(d.id!, { status: 'a_verifier' })}>
                          <Undo2 className="size-4" />
                        </Button>
                      )}
                      {d.source === 'manuel' && (
                        <Button variant="ghost" className="px-2 text-sm text-red-600 dark:text-red-400" aria-label="Supprimer la zone" onClick={() => void db.damages.delete(d.id!)}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                    {selected === d.id && (
                      <input
                        className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                        placeholder="Description (ex. rayure portière arrière, 10 cm)"
                        defaultValue={d.description ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => void db.damages.update(d.id!, { description: e.target.value.trim() || undefined })}
                      />
                    )}
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
