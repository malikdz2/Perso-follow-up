import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { FileDown, Pencil, ScanSearch, Sparkles, Trash2 } from 'lucide-react';
import { db } from '../../../db/db';
import { useSettings } from '../../../db/settings';
import { fmtDate } from '../../../lib/dates';
import { createInspection, deleteInspection, saveShot, shotOf, summarize } from '../../../lib/damage/inspections';
import { aiErrorMessage, analyzeViewWithAI } from '../../../lib/damage/ai';
import { VIEWS, type ViewKey } from '../../../lib/damage/views';
import { downloadFile } from '../../../lib/backup';
import { cx } from '../../../lib/cx';
import { CarDiagram } from '../../../components/inspection/CarDiagram';
import { CameraCapture, type Shot } from '../../../components/inspection/CameraCapture';
import { ShotReview } from '../../../components/inspection/ShotReview';
import { Button, Card, Field, Input, PageHeader, Sheet } from '../../../components/ui';

export default function InspectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const [camera, setCamera] = useState<ViewKey | null>(null);
  const [review, setReview] = useState<ViewKey | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rename, setRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = useLiveQuery(async () => {
    const insp = await db.inspections.get(Number(id));
    if (!insp) return { insp: null };
    const [shots, summary, departure, returns] = await Promise.all([
      db.inspectionShots.where('inspectionId').equals(insp.id!).toArray(),
      summarize(insp),
      insp.departureId ? db.inspections.get(insp.departureId) : undefined,
      insp.kind === 'depart' ? db.inspections.where('departureId').equals(insp.id!).toArray() : [],
    ]);
    const refShot = camera && insp.departureId ? await shotOf(insp.departureId, camera) : undefined;
    return { insp, shots, summary, departure, returns, refShot };
  }, [id, camera]);

  if (!data || !settings) return null;
  if (!data.insp) {
    return (
      <div>
        <PageHeader title="État des lieux" />
        <p className="text-center text-slate-500">État des lieux introuvable.</p>
      </div>
    );
  }
  const { insp, shots, summary, departure, returns } = data;
  const isReturn = insp.kind === 'retour';
  const opts = { useMask: settings.damageUseMask, sensitivity: settings.damageSensitivity };

  const onCapture = async (shot: Shot) => {
    const view = camera!;
    await saveShot(insp, view, shot, opts);
    setCamera(null);
    setReview(view);
  };

  const startReturn = async () => {
    const rid = await createInspection('retour', insp.label, insp.id);
    navigate(`/voiture/etats-des-lieux/${rid}`);
  };

  const exportPdf = async () => {
    setBusy('pdf');
    try {
      const { constatPdf } = await import('../../../lib/damage/constatPdf');
      downloadFile(await constatPdf(insp), `constat-${insp.label.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}-${insp.date}.pdf`, 'application/pdf');
    } finally {
      setBusy('');
    }
  };

  const aiAll = async () => {
    if (!settings.aiApiKey) return;
    setBusy('ai');
    setMsg(null);
    let added = 0;
    try {
      for (const v of VIEWS.filter((v) => shots.some((s) => s.view === v.key))) {
        setMsg({ ok: true, text: `Analyse IA : ${v.label}…` });
        added += (await analyzeViewWithAI(settings.aiApiKey, insp, v.key)).added;
      }
      setMsg({ ok: true, text: `Analyse IA terminée : ${added} dégât${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}, avis donné sur chaque zone. Vérifiez vue par vue.` });
    } catch (e) {
      setMsg({ ok: false, text: aiErrorMessage(e) });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={isReturn ? 'Retour' : 'Départ'}
        action={
          <button type="button" aria-label="Renommer" onClick={() => setRename(true)} className="flex size-11 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800">
            <Pencil className="size-5" />
          </button>
        }
      />
      <Card>
        <p className="font-bold">{insp.label}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isReturn ? 'Retour' : 'Départ'} du {fmtDate(insp.date)}
          {departure && (
            <>
              {' '}· comparé au{' '}
              <Link to={`/voiture/etats-des-lieux/${departure.id}`} className="underline">
                départ du {fmtDate(departure.date)}
              </Link>
            </>
          )}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(summary.shots / 8) * 100}%` }} />
        </div>
        <p className="mt-1 text-sm">
          {summary.shots}/8 photos
          {isReturn ? (
            <>
              {' '}· <strong className={cx(summary.confirmed > 0 && 'text-red-600 dark:text-red-400')}>{summary.confirmed} nouveau{summary.confirmed > 1 ? 'x' : ''} dégât{summary.confirmed > 1 ? 's' : ''}</strong>
              {summary.toReview > 0 && <span className="text-amber-600"> · {summary.toReview} à vérifier</span>}
            </>
          ) : (
            ` · ${summary.confirmed} dégât${summary.confirmed > 1 ? 's' : ''} existant${summary.confirmed > 1 ? 's' : ''} relevé${summary.confirmed > 1 ? 's' : ''}`
          )}
        </p>
      </Card>

      <p className="text-center text-sm text-slate-600 dark:text-slate-300">Touchez une position autour de la voiture pour la photographier.</p>
      <CarDiagram shots={shots} summary={summary} onSelect={(v) => (shots.some((s) => s.view === v) ? setReview(v) : setCamera(v))} />

      {isReturn ? (
        <div className="space-y-2">
          {settings.aiApiKey && (
            <Button block variant="secondary" onClick={() => void aiAll()} disabled={!!busy || summary.shots === 0}>
              <Sparkles className="size-5" /> {busy === 'ai' ? 'Analyse IA en cours…' : 'Analyse IA de toutes les vues'}
            </Button>
          )}
          <Button block onClick={() => void exportPdf()} disabled={!!busy || summary.shots === 0}>
            <FileDown className="size-5" /> {busy === 'pdf' ? 'Création…' : 'Constat PDF (avant / après)'}
          </Button>
          {summary.toReview > 0 && <p className="text-center text-xs text-amber-600">Les zones « à vérifier » ne figurent pas dans le constat : confirmez-les ou écartez-les.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {settings.aiApiKey && summary.shots > 0 && (
            <Button block variant="secondary" onClick={() => void aiAll()} disabled={!!busy}>
              <Sparkles className="size-5" /> {busy === 'ai' ? 'Analyse IA en cours…' : 'Relever les dégâts existants avec l’IA'}
            </Button>
          )}
          {returns.map((r) => (
            <Link key={r.id} to={`/voiture/etats-des-lieux/${r.id}`} className="block text-center text-sm font-medium text-emerald-700 underline dark:text-emerald-400">
              Voir le retour du {fmtDate(r.date)}
            </Link>
          ))}
          <Button block onClick={() => void startReturn()} disabled={summary.shots === 0}>
            <ScanSearch className="size-5" /> Faire l'état des lieux de retour
          </Button>
          {summary.shots < 8 && summary.shots > 0 && <p className="text-center text-xs text-slate-500">Conseil : photographiez les 8 vues pour que tout soit comparable au retour.</p>}
        </div>
      )}
      {msg && (
        <p role="status" className={cx('text-center text-sm font-medium', msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {msg.text}
        </p>
      )}
      <Button block variant="ghost" className="text-red-600 dark:text-red-400" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="size-4" /> Supprimer cet état des lieux
      </Button>

      {camera && (
        <CameraCapture
          view={camera}
          reference={data.refShot?.blob}
          useMask={settings.damageUseMask}
          sensitivity={settings.damageSensitivity}
          onCapture={onCapture}
          onClose={() => setCamera(null)}
        />
      )}
      {review && !camera && (
        <ShotReview
          inspection={insp}
          view={review}
          onClose={() => setReview(null)}
          onRetake={() => {
            setCamera(review);
          }}
        />
      )}

      <Sheet open={rename} onClose={() => setRename(false)} title="Renommer">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = String(new FormData(e.currentTarget).get('label') ?? '').trim();
            if (v) void db.inspections.update(insp.id!, { label: v });
            setRename(false);
          }}
        >
          <Field label="Libellé">
            <Input name="label" defaultValue={insp.label} autoFocus />
          </Field>
          <Button type="submit" block>
            Enregistrer
          </Button>
        </form>
      </Sheet>
      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer cet état des lieux ?">
        <p className="mb-3 text-sm">Ses photos et dégâts seront effacés{isReturn ? '' : ', ainsi que ses retours'}.</p>
        <Button
          block
          variant="danger"
          onClick={async () => {
            await deleteInspection(insp.id!);
            navigate('/voiture/etats-des-lieux', { replace: true });
          }}
        >
          Supprimer
        </Button>
      </Sheet>
    </div>
  );
}
