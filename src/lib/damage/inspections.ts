// États des lieux : création, prises de vue, comparaison locale départ ↔ retour, dégâts.
import { db, type Damage, type Inspection, type InspectionKind } from '../../db/db';
import { todayISO } from '../dates';
import { detectChanges, markKnown, polygonMask, type Box } from './detect';
import { grayFromBlob } from './imaging';
import { VIEW_BY_KEY, VIEWS, WORK_H, WORK_W, type ViewKey } from './views';

export async function createInspection(kind: InspectionKind, label: string, departureId?: number): Promise<number> {
  return (await db.inspections.add({ kind, label: label.trim() || (kind === 'depart' ? 'État des lieux' : 'Retour'), date: todayISO(), createdAt: Date.now(), departureId, closed: false })) as number;
}

export async function deleteInspection(id: number): Promise<void> {
  await db.transaction('rw', db.inspections, db.inspectionShots, db.damages, async () => {
    // Supprimer un départ supprime aussi ses retours.
    const children = await db.inspections.where('departureId').equals(id).primaryKeys();
    for (const iid of [id, ...(children as number[])]) {
      await db.inspectionShots.where('inspectionId').equals(iid).delete();
      await db.damages.where('inspectionId').equals(iid).delete();
      await db.inspections.delete(iid);
    }
  });
}

export const shotOf = (inspectionId: number, view: ViewKey) => db.inspectionShots.where('[inspectionId+view]').equals([inspectionId, view]).first();

/** Enregistre (ou remplace) la photo d'une vue ; pour un retour, lance la comparaison avec le départ. */
export async function saveShot(inspection: Inspection, view: ViewKey, shot: { blob: Blob; width: number; height: number }, opts: { useMask: boolean; sensitivity: number }) {
  const prev = await shotOf(inspection.id!, view);
  const row = { inspectionId: inspection.id!, view, ...shot, takenAt: Date.now() };
  if (prev) await db.inspectionShots.put({ ...row, id: prev.id });
  else await db.inspectionShots.add(row);
  if (inspection.kind === 'retour') return analyzeView(inspection, view, opts);
  return null;
}

/** Dégâts déjà connus d'une vue au départ (relevés à la main ou par l'IA, et confirmés). */
export async function knownDamages(departureId: number, view: ViewKey): Promise<Damage[]> {
  return (await db.damages.where('[inspectionId+view]').equals([departureId, view]).toArray()).filter((d) => d.status === 'confirme');
}

/**
 * Comparaison locale départ ↔ retour pour une vue. Remplace les zones automatiques non encore traitées ;
 * les zones correspondant à un dégât déjà relevé au départ sont écartées.
 */
export async function analyzeView(ret: Inspection, view: ViewKey, opts: { useMask: boolean; sensitivity: number }) {
  if (!ret.departureId) return null;
  const [dep, cur] = await Promise.all([shotOf(ret.departureId, view), shotOf(ret.id!, view)]);
  if (!dep || !cur) return null;
  const [A, B] = await Promise.all([grayFromBlob(dep.blob), grayFromBlob(cur.blob)]);
  const mask = opts.useMask ? polygonMask(WORK_W, WORK_H, VIEW_BY_KEY[view].shape.body, 0.04) : undefined;
  const res = detectChanges(A, B, mask, { sensitivity: opts.sensitivity });
  const known = await knownDamages(ret.departureId, view);
  // Coordonnées de la photo du retour = coordonnées du départ décalées de la compensation de cadrage.
  const toRet = (b: Box): Box => ({ ...b, x: b.x + res.shift.dx / WORK_W, y: b.y + res.shift.dy / WORK_H });
  const marked = markKnown(res.boxes, known);
  const fresh = marked.filter((b) => !b.known);
  await db.transaction('rw', db.damages, db.inspectionShots, async () => {
    await db.damages.where('[inspectionId+view]').equals([ret.id!, view]).filter((d) => d.source === 'auto' && d.status === 'a_verifier').delete();
    const now = Date.now();
    await db.damages.bulkAdd(
      fresh.map((b) => ({ inspectionId: ret.id!, view, ...pad(toRet(b)), source: 'auto' as const, status: 'a_verifier' as const, score: b.score, createdAt: now })),
    );
    await db.inspectionShots.update(cur.id!, {
      analysis: { changedRatio: res.changedRatio, alignment: res.alignment, misaligned: res.misaligned, shift: res.shift, candidates: fresh.length, known: marked.length - fresh.length, at: now },
    });
  });
  return { ...res, fresh: fresh.length, known: marked.length - fresh.length };
}

/** Marge autour d'une zone détectée (lisibilité), bornée à l'image. */
function pad(b: Box, m = 0.012): Box {
  const x = Math.max(0, b.x - m);
  const y = Math.max(0, b.y - m);
  return { x, y, w: Math.min(1 - x, b.w + 2 * m), h: Math.min(1 - y, b.h + 2 * m) };
}

export async function addManualDamage(inspectionId: number, view: ViewKey, box: Box, status: Damage['status'] = 'confirme') {
  return db.damages.add({ inspectionId, view, ...box, source: 'manuel', status, createdAt: Date.now() });
}

export type ViewState = 'vide' | 'photo' | 'a_verifier' | 'degat' | 'ok';

export interface InspectionSummary {
  views: Record<ViewKey, { state: ViewState; toReview: number; confirmed: number; misaligned: boolean }>;
  shots: number;
  toReview: number;
  confirmed: number;
}

/** État de chaque vue pour le schéma de la voiture. */
export async function summarize(inspection: Inspection): Promise<InspectionSummary> {
  const [shots, damages] = await Promise.all([db.inspectionShots.where('inspectionId').equals(inspection.id!).toArray(), db.damages.where('inspectionId').equals(inspection.id!).toArray()]);
  const views = {} as InspectionSummary['views'];
  for (const v of VIEWS) {
    const shot = shots.find((s) => s.view === v.key);
    const ds = damages.filter((d) => d.view === v.key);
    const toReview = ds.filter((d) => d.status === 'a_verifier').length;
    const confirmed = ds.filter((d) => d.status === 'confirme').length;
    let state: ViewState = 'vide';
    if (shot) {
      if (inspection.kind === 'depart') state = confirmed ? 'degat' : 'photo';
      else state = toReview ? 'a_verifier' : confirmed ? 'degat' : 'ok';
    }
    views[v.key] = { state, toReview, confirmed, misaligned: !!shot?.analysis?.misaligned };
  }
  return {
    views,
    shots: shots.length,
    toReview: damages.filter((d) => d.status === 'a_verifier').length,
    confirmed: damages.filter((d) => d.status === 'confirme').length,
  };
}
