// Constat PDF d'un état des lieux de retour : nouveaux dégâts avec photos avant / après.
import { db, type Inspection } from '../../db/db';
import { fmtDate, todayISO } from '../dates';
import { cropWithBox, photoWithBoxes } from './imaging';
import { damageTitle, SOURCE_LABEL } from './labels';
import { VIEWS, WORK_H, WORK_W } from './views';

const clean = (s: string) => s.replace(/[  ]/g, ' ').replace(/[’]/g, "'");

export async function constatPdf(ret: Inspection): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const dep = ret.departureId ? await db.inspections.get(ret.departureId) : undefined;
  const [vehicle, retShots, depShots, damages] = await Promise.all([
    db.vehicle.toCollection().first(),
    db.inspectionShots.where('inspectionId').equals(ret.id!).toArray(),
    dep ? db.inspectionShots.where('inspectionId').equals(dep.id!).toArray() : Promise.resolve([]),
    db.damages.where('inspectionId').equals(ret.id!).toArray(),
  ]);
  const confirmed = damages.filter((d) => d.status === 'confirme').sort((a, b) => VIEWS.findIndex((v) => v.key === a.view) - VIEWS.findIndex((v) => v.key === b.view) || a.createdAt - b.createdAt);
  const pending = damages.filter((d) => d.status === 'a_verifier').length;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 14;
  const R = 196;
  let y = 18;
  const text = (s: string, x: number, yy: number, o?: Parameters<typeof doc.text>[3]) => doc.text(clean(s), x, yy, o);
  const ensure = (h: number) => {
    if (y + h > 282) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  text("Constat d'état des lieux", L, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  text(`Édité le ${fmtDate(todayISO())}`, R, y, { align: 'right' });
  doc.setTextColor(0);
  y += 9;
  doc.setFontSize(11);
  const lines = [
    vehicle ? `Véhicule : ${vehicle.model}${vehicle.plate ? ` — ${vehicle.plate}` : ''}` : '',
    dep ? `Départ : ${fmtDate(dep.date)} — ${dep.label}` : '',
    `Retour : ${fmtDate(ret.date)} — ${ret.label}`,
  ].filter(Boolean);
  for (const l of lines) {
    text(l, L, y);
    y += 6;
  }
  y += 2;

  // Synthèse
  doc.setFillColor(confirmed.length ? 254 : 236, confirmed.length ? 226 : 253, confirmed.length ? 226 : 245);
  doc.roundedRect(L, y, R - L, pending ? 16 : 10, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  text(confirmed.length ? `${confirmed.length} nouveau${confirmed.length > 1 ? 'x' : ''} dégât${confirmed.length > 1 ? 's' : ''} constaté${confirmed.length > 1 ? 's' : ''}` : 'Aucun nouveau dégât constaté', L + 4, y + 6.5);
  doc.setFont('helvetica', 'normal');
  if (pending) {
    doc.setFontSize(9);
    text(`${pending} zone${pending > 1 ? 's' : ''} encore « à vérifier » non retenue${pending > 1 ? 's' : ''} dans ce constat.`, L + 4, y + 12.5);
    doc.setFontSize(11);
  }
  y += pending ? 22 : 16;

  // Vues photographiées
  doc.setFontSize(9);
  text('Vues photographiées (départ / retour) :', L, y);
  y += 5;
  const per = VIEWS.map((v) => `${v.label} : ${depShots.some((s) => s.view === v.key) ? 'oui' : 'non'} / ${retShots.some((s) => s.view === v.key) ? 'oui' : 'non'}`);
  for (let i = 0; i < per.length; i += 2) {
    text(per[i], L, y);
    if (per[i + 1]) text(per[i + 1], 105, y);
    y += 4.5;
  }
  y += 4;
  doc.setFontSize(11);

  // Dégâts : avant / après
  const imgW = (R - L - 6) / 2;
  const imgH = imgW * 0.75;
  for (const [i, d] of confirmed.entries()) {
    const view = VIEWS.find((v) => v.key === d.view)!;
    const rs = retShots.find((s) => s.view === d.view);
    const ds = depShots.find((s) => s.view === d.view);
    ensure(imgH + 26);
    doc.setFont('helvetica', 'bold');
    text(`${damageTitle(d, i + 1)} — ${view.label}`, L, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(90);
    text(`Repéré par : ${SOURCE_LABEL[d.source]}`, R, y, { align: 'right' });
    doc.setTextColor(0);
    y += 5;
    if (d.description) {
      const ls = doc.splitTextToSize(clean(d.description), R - L) as string[];
      doc.text(ls.slice(0, 2), L, y);
      y += 4.5 * Math.min(2, ls.length);
    }
    doc.setFontSize(8);
    text('AVANT (départ)', L, y + 3);
    text('APRÈS (retour)', L + imgW + 6, y + 3);
    y += 5;
    const shift = rs?.analysis?.shift ?? { dx: 0, dy: 0 };
    if (ds) {
      const c = await cropWithBox(ds.blob, { ...d, x: d.x - shift.dx / WORK_W, y: d.y - shift.dy / WORK_H });
      doc.addImage(c.dataUrl, 'JPEG', L, y, imgW, imgH);
    } else {
      doc.rect(L, y, imgW, imgH);
      text('Pas de photo de départ', L + imgW / 2, y + imgH / 2, { align: 'center' });
    }
    if (rs) doc.addImage((await cropWithBox(rs.blob, d)).dataUrl, 'JPEG', L + imgW + 6, y, imgW, imgH);
    y += imgH + 8;
    doc.setFontSize(11);
  }

  // Vues concernées en entier
  const viewsWith = VIEWS.filter((v) => confirmed.some((d) => d.view === v.key));
  if (viewsWith.length) {
    doc.addPage();
    y = 18;
    doc.setFont('helvetica', 'bold');
    text('Vues concernées (photos du retour)', L, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
    const w = (R - L - 6) / 2;
    const h = w * 0.75;
    let col = 0;
    for (const v of viewsWith) {
      const rs = retShots.find((s) => s.view === v.key);
      if (!rs) continue;
      if (col === 0) ensure(h + 10);
      const x = L + col * (w + 6);
      const img = await photoWithBoxes(rs.blob, confirmed.filter((d) => d.view === v.key).map((d) => ({ ...d, color: '#ef4444' })));
      doc.setFontSize(9);
      text(v.label, x, y + 3);
      doc.addImage(img.dataUrl, 'JPEG', x, y + 5, w, h);
      col = (col + 1) % 2;
      if (col === 0) y += h + 10;
    }
  }

  // Pied de page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(120);
    text(`Mon Suivi — constat établi à partir des photos datées · page ${p}/${pages}`, L, 290);
  }
  return doc.output('blob');
}
