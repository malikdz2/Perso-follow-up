// Note de frais de mission en PDF (jsPDF chargé à la demande, fonctionne hors ligne).
import type { Mission, MissionFee } from '../db/db';
import type { AppSettings } from '../db/settings';
import { wilayaLabel } from '../data/wilayas';
import { fmtDate, todayISO } from './dates';
import { fmtDA } from './format';
import { FEE_LABELS, missionDays } from './missions';

/** Les polices standard du PDF ne connaissent pas les espaces fines insécables. */
const pdfText = (s: string) => s.replace(/[  ]/g, ' ');

export interface LinkedExpense {
  date: string;
  label: string;
  amount: number;
}

export async function missionExpensePdf(mission: Mission, fees: MissionFee[], linked: LinkedExpense[], settings: AppSettings): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 18;
  const R = 192;
  let y = 20;

  const text = (s: string, x: number, yy: number, opts?: Parameters<typeof doc.text>[3]) => doc.text(pdfText(s), x, yy, opts);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  text('Note de frais de mission', L, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  text(`Établie le ${fmtDate(todayISO())}`, R, y, { align: 'right' });
  doc.setTextColor(0);
  y += 10;

  // Identité
  doc.setFontSize(11);
  const who = [settings.fullName, settings.jobTitle, settings.employer].filter(Boolean).join(' — ');
  if (who) {
    text(who, L, y);
    y += 8;
  }

  // Mission
  doc.setDrawColor(200);
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(L, y, R - L, 30, 2, 2, 'FD');
  const rows: [string, string][] = [
    ['Wilaya', wilayaLabel(mission.wilaya)],
    ['Lieu', mission.place || '—'],
    ['Motif', mission.reason || '—'],
    ['Période', `du ${fmtDate(mission.start)} au ${fmtDate(mission.end)} (${missionDays(mission)} jour${missionDays(mission) > 1 ? 's' : ''})`],
  ];
  rows.forEach(([k, v], i) => {
    doc.setFont('helvetica', 'bold');
    text(k, L + 4, y + 7 + i * 6.5);
    doc.setFont('helvetica', 'normal');
    text(v, L + 30, y + 7 + i * 6.5);
  });
  y += 40;

  // Tableau des frais
  const all = [
    ...fees.map((f) => ({ date: f.date, label: FEE_LABELS[f.kind] + (f.note ? ` — ${f.note}` : ''), amount: f.amount })),
    ...linked,
  ].sort((a, b) => a.date.localeCompare(b.date));

  const head = () => {
    doc.setFillColor(5, 150, 105);
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.rect(L, y, R - L, 8, 'F');
    text('Date', L + 3, y + 5.5);
    text('Nature', L + 30, y + 5.5);
    text('Montant', R - 3, y + 5.5, { align: 'right' });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    y += 8;
  };
  head();
  if (all.length === 0) {
    text('Aucun frais enregistré.', L + 3, y + 6);
    y += 9;
  }
  all.forEach((r, i) => {
    if (y > 265) {
      doc.addPage();
      y = 20;
      head();
    }
    if (i % 2) {
      doc.setFillColor(248, 250, 252);
      doc.rect(L, y, R - L, 8, 'F');
    }
    text(fmtDate(r.date), L + 3, y + 5.5);
    const label = doc.splitTextToSize(pdfText(r.label), 115)[0] as string;
    text(label, L + 30, y + 5.5);
    text(fmtDA(r.amount), R - 3, y + 5.5, { align: 'right' });
    y += 8;
  });

  // Totaux
  const total = all.reduce((s, r) => s + r.amount, 0);
  const rest = total - mission.reimbursed;
  y += 4;
  doc.setDrawColor(150);
  doc.line(R - 80, y, R, y);
  y += 7;
  const tot: [string, string, boolean][] = [
    ['Total des frais', fmtDA(total), true],
    ['Montant remboursé', fmtDA(mission.reimbursed), false],
    [rest >= 0 ? 'Reste à rembourser' : 'Trop-perçu', fmtDA(Math.abs(rest)), true],
  ];
  for (const [k, v, bold] of tot) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    text(k, R - 80, y);
    text(v, R, y, { align: 'right' });
    y += 7;
  }

  // Signature
  y = Math.max(y + 15, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  text("Signature de l'intéressé(e)", L, y);
  text('Visa du responsable', R - 60, y);

  return doc.output('blob');
}
