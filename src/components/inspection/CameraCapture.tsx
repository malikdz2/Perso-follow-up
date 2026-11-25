import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, ImagePlus, Radar, RotateCw, X } from 'lucide-react';
import { detectChanges, polygonMask, type DetectedBox, type Gray } from '../../lib/damage/detect';
import { grayFrom, grayFromBlob, makeShot, shotFromFile } from '../../lib/damage/imaging';
import { VIEW_BY_KEY, WORK_H, WORK_W, type ViewKey } from '../../lib/damage/views';
import { useBlobUrl } from '../../lib/useBlobUrl';
import { cx } from '../../lib/cx';

export interface Shot {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Prise de vue plein écran au format 4:3 : ce qui est dans le cadre est exactement ce qui est enregistré.
 * Guide : silhouette de la voiture, et pour un retour la photo de départ en transparence.
 * « Détection en direct » : compare le flux de la caméra à la photo de départ et encadre les zones suspectes.
 */
export function CameraCapture({
  view,
  reference,
  useMask,
  sensitivity,
  onCapture,
  onClose,
}: {
  view: ViewKey;
  reference?: Blob;
  useMask: boolean;
  sensitivity: number;
  onCapture: (shot: Shot) => void | Promise<void>;
  onClose: () => void;
}) {
  const def = VIEW_BY_KEY[view];
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  // Affichée par défaut dès que la photo de départ est disponible (elle peut arriver après l'ouverture).
  const [ghost, setGhost] = useState(true);
  const [opacity, setOpacity] = useState(0.4);
  const [live, setLive] = useState(false);
  const [liveBoxes, setLiveBoxes] = useState<DetectedBox[]>([]);
  const [liveInfo, setLiveInfo] = useState('');
  const [portrait, setPortrait] = useState(() => window.matchMedia('(orientation: portrait)').matches);
  const refUrl = useBlobUrl(reference);
  const refGray = useRef<Gray | null>(null);

  // Caméra arrière
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e) {
        const name = (e as Error).name;
        setError(
          name === 'NotAllowedError'
            ? 'Accès à la caméra refusé. Autorisez la caméra pour ce site dans Chrome, ou choisissez une photo dans la galerie.'
            : 'Caméra indisponible. Choisissez une photo dans la galerie.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)');
    const on = () => setPortrait(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Détection en direct (retour) : ~1,5 image par seconde à 320 × 240.
  useEffect(() => {
    if (!live || !reference || !ready) return;
    let stop = false;
    const mask = useMask ? polygonMask(WORK_W, WORK_H, def.shape.body, 0.04) : undefined;
    const tick = async () => {
      if (stop) return;
      refGray.current ??= await grayFromBlob(reference);
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        const r = detectChanges(refGray.current, grayFrom(v), mask, { sensitivity });
        setLiveBoxes(r.misaligned ? [] : r.boxes.map((b) => ({ ...b, x: b.x + r.shift.dx / WORK_W, y: b.y + r.shift.dy / WORK_H })));
        setLiveInfo(r.misaligned ? 'Cadrage à ajuster : superposez la voiture à la photo de départ' : `${r.boxes.length} zone${r.boxes.length > 1 ? 's' : ''} suspecte${r.boxes.length > 1 ? 's' : ''} · cadrage ${r.alignment > 0.75 ? 'bon' : 'moyen'}`);
      }
      if (!stop) window.setTimeout(() => void tick(), 650);
    };
    void tick();
    return () => {
      stop = true;
      setLiveBoxes([]);
      setLiveInfo('');
    };
  }, [live, reference, ready, useMask, sensitivity, def]);

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !ready) return;
    setBusy(true);
    try {
      await onCapture(await makeShot(v));
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const s = await shotFromFile(file);
      if (s.portrait && !window.confirm('Photo prise en hauteur : seule la bande centrale (format 4:3 horizontal) sera gardée. Continuer ?')) return;
      await onCapture(s);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const pts = def.shape.body.map(([x, y]) => `${x * 100},${y * 75}`).join(' ');
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={`Photo : ${def.label}`}>
      <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
        <div className="min-w-0 flex-1 pl-2">
          <p className="font-semibold">{def.label}</p>
          <p className="truncate text-xs text-white/70">{def.hint}</p>
        </div>
        <button type="button" aria-label="Fermer la caméra" onClick={onClose} className="flex size-11 items-center justify-center rounded-full active:bg-white/20">
          <X className="size-6" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div className="relative aspect-[4/3] max-h-full w-full max-w-[calc((100dvh-11rem)*4/3)] overflow-hidden bg-slate-900">
          <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" />
          {ghost && refUrl && <img src={refUrl} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" style={{ opacity }} />}
          <svg viewBox="0 0 100 75" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full">
            <polygon points={pts} fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="0.5" strokeDasharray="1.6 1.2" />
            {def.shape.wheels.map((w, i) => (
              <circle key={i} cx={w.x * 100} cy={w.y * 75} r={w.r * 100} fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="0.4" strokeDasharray="1 1" />
            ))}
            {liveBoxes.map((b, i) => (
              <rect key={i} x={b.x * 100} y={b.y * 75} width={b.w * 100} height={b.h * 75} fill="none" stroke="#ef4444" strokeWidth="0.7" />
            ))}
          </svg>
          {!ready && !error && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Ouverture de la caméra…</p>}
          {error && <p className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-black/70 p-3 text-center text-sm">{error}</p>}
          {liveInfo && <p className="absolute inset-x-2 bottom-2 rounded-lg bg-black/60 px-2 py-1 text-center text-xs">{liveInfo}</p>}
        </div>
      </div>

      {portrait && (
        <p className="mx-3 mb-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 py-1 text-xs text-amber-200">
          <RotateCw className="size-3.5" /> Tournez le téléphone à l'horizontale pour cadrer toute la voiture.
        </p>
      )}

      {reference && (
        <div className="flex items-center gap-2 px-3 pb-1 text-xs">
          <button type="button" onClick={() => setGhost(!ghost)} className="flex min-h-10 items-center gap-1 rounded-lg bg-white/10 px-2" aria-pressed={ghost}>
            {ghost ? <Eye className="size-4" /> : <EyeOff className="size-4" />} Photo de départ
          </button>
          {ghost && (
            <input type="range" min="0.1" max="0.8" step="0.05" value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Transparence de la photo de départ" className="flex-1 accent-emerald-500" />
          )}
          <button
            type="button"
            onClick={() => setLive(!live)}
            aria-pressed={live}
            disabled={!ready}
            className={cx('ml-auto flex min-h-10 items-center gap-1 rounded-lg px-2', live ? 'bg-red-600' : 'bg-white/10')}
          >
            <Radar className="size-4" /> Détection en direct
          </button>
        </div>
      )}

      <div className="flex items-center justify-around px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void fromFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex size-14 flex-col items-center justify-center rounded-full bg-white/10 text-[10px] active:bg-white/20">
          <ImagePlus className="size-5" />
          Galerie
        </button>
        <button
          type="button"
          aria-label="Prendre la photo"
          onClick={() => void capture()}
          disabled={!ready || busy}
          className="size-18 rounded-full border-4 border-white bg-white/20 active:bg-white/50 disabled:opacity-40"
        />
        <span className="w-14" />
      </div>
    </div>
  );
}
