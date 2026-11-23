import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Camera, FileText, Trash2, X } from 'lucide-react';
import { db, type CarDoc } from '../../db/db';
import { compressImage } from '../../lib/images';
import { fmtDate, toISO } from '../../lib/dates';
import { Button, PageHeader } from '../../components/ui';

const KINDS: { kind: CarDoc['kind']; label: string }[] = [
  { kind: 'carte_grise', label: 'Carte grise' },
  { kind: 'assurance', label: 'Assurance' },
  { kind: 'permis', label: 'Permis de conduire' },
  { kind: 'autre', label: 'Autres documents' },
];

/** URL d'objet pour un Blob, libérée automatiquement. */
function useBlobUrl(blob?: Blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

function Thumb({ doc, onOpen }: { doc: CarDoc; onOpen: () => void }) {
  const url = useBlobUrl(doc.blob);
  const isPdf = doc.blob.type === 'application/pdf';
  return (
    <button type="button" onClick={onOpen} aria-label={`Voir ${doc.label}`} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      {isPdf ? <FileText className="m-auto size-10 text-slate-500" /> : <img src={url} alt={doc.label} className="size-full object-cover" />}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-0.5 text-left text-xs text-white">{doc.label}</span>
    </button>
  );
}

function Viewer({ doc, onClose }: { doc: CarDoc; onClose: () => void }) {
  const url = useBlobUrl(doc.blob);
  const isPdf = doc.blob.type === 'application/pdf';
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={doc.label}>
      <div className="flex items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
        <p className="flex-1 truncate pl-2 font-semibold">{doc.label}</p>
        <button
          type="button"
          aria-label="Supprimer"
          className="flex size-11 items-center justify-center rounded-full active:bg-white/20"
          onClick={async () => {
            if (!window.confirm('Supprimer ce document ?')) return;
            await db.carDocs.delete(doc.id!);
            onClose();
          }}
        >
          <Trash2 className="size-5" />
        </button>
        <button type="button" aria-label="Fermer" className="flex size-11 items-center justify-center rounded-full active:bg-white/20" onClick={onClose}>
          <X className="size-6" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto">
        {isPdf ? (
          <a href={url} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-3 font-semibold text-slate-900">
            Ouvrir le PDF
          </a>
        ) : (
          <img src={url} alt={doc.label} className="max-h-full max-w-full object-contain" style={{ touchAction: 'pinch-zoom' }} />
        )}
      </div>
      <p className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60">Ajouté le {fmtDate(toISO(new Date(doc.addedAt)))}</p>
    </div>
  );
}

/** Photos des documents, stockées sur le téléphone (consultables hors ligne). */
export default function DocumentsPage() {
  const docs = useLiveQuery(() => db.carDocs.toArray());
  const [open, setOpen] = useState<CarDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<CarDoc['kind']>('carte_grise');

  const pick = (kind: CarDoc['kind']) => {
    pendingKind.current = kind;
    fileRef.current?.click();
  };
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const kind = pendingKind.current;
    const base = KINDS.find((k) => k.kind === kind)!.label;
    const existing = docs?.filter((d) => d.kind === kind).length ?? 0;
    let i = existing;
    for (const file of Array.from(files)) {
      i++;
      const blob = await compressImage(file);
      await db.carDocs.add({ kind, label: i > 1 ? `${base} (${i})` : base, blob, addedAt: Date.now() });
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!docs) return null;
  return (
    <div className="space-y-5">
      <PageHeader title="Documents" />
      <p className="text-sm text-slate-600 dark:text-slate-300">Les photos restent sur ce téléphone et s'ouvrent sans connexion. Elles sont incluses dans la sauvegarde JSON.</p>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
      {KINDS.map(({ kind, label }) => {
        const list = docs.filter((d) => d.kind === kind);
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{label}</h2>
              <Button variant="ghost" className="px-2 text-sm" onClick={() => pick(kind)} disabled={busy}>
                <Camera className="size-4" /> Ajouter
              </Button>
            </div>
            {list.length === 0 ? (
              <button type="button" onClick={() => pick(kind)} className="flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">
                <Camera className="size-5" /> Photographier ou choisir (recto, verso…)
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {list.map((d) => (
                  <Thumb key={d.id} doc={d} onOpen={() => setOpen(d)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      {open && <Viewer doc={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
