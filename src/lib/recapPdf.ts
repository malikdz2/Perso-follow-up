// Récapitulatif mensuel en PDF (jsPDF chargé à la demande).
import { delta, previousMonth, type Delta, type RecapData } from './recap';
import { fmtMonth, fmtDate, todayISO } from './dates';
import { fmtDA, fmtDays, fmtNum } from './format';

const clean = (s: string) => s.replace(/[  ]/g, ' ').replace('−', '-');

function deltaText(d: Delta | null, unit: 'DA' | 'j' | 'L' | 'L/100' = 'DA'): string {
  if (!d) return '';
  if (d.dir === 'same') return '= stable';
  const v = unit === 'DA' ? fmtDA(Math.abs(d.diff)) : `${fmtNum(Math.abs(d.diff))} ${unit}`;
  // Les polices standard du PDF n'ont pas les flèches ↑/↓ : sens écrit en toutes lettres.
  const sign = d.dir === 'up' ? '+' : '-';
  return `${d.dir === 'up' ? 'hausse' : 'baisse'} : ${sign}${v}${d.pct !== null ? ` (${sign}${fmtNum(Math.abs(d.pct))} %)` : ''}`;
}

export async function recapPdf(c: RecapData, p: RecapData, final: boolean): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 16;
  const R = 194;
  let y = 18;
  const text = (s: string, x: number, yy: number, o?: Parameters<typeof doc.text>[3]) => doc.text(clean(s), x, yy, o);
  const ensure = (h: number) => {
    if (y + h > 280) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  text(`Récapitulatif — ${fmtMonth(c.month)}`, L, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  text(`${final ? 'Figé' : 'Provisoire'} · comparé à ${fmtMonth(previousMonth(c.month))} · édité le ${fmtDate(todayISO())}`, L, y + 6);
  doc.setTextColor(0);
  y += 16;

  const section = (title: string, right?: string) => {
    ensure(14);
    doc.setFillColor(236, 253, 245);
    doc.rect(L, y - 5, R - L, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    text(title, L + 2, y);
    if (right) text(right, R - 2, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 8;
  };
  const row = (label: string, value: string, d = '') => {
    ensure(7);
    text(label, L + 2, y);
    text(value, 140, y, { align: 'right' });
    if (d) {
      doc.setTextColor(90);
      text(d, R - 2, y, { align: 'right' });
      doc.setTextColor(0);
    }
    y += 6;
  };

  section('Toutes les dépenses', fmtDA(c.grandTotal));
  row('Écart avec le mois précédent', '', deltaText(delta(c.grandTotal, p.grandTotal)));
  y += 2;

  section('Dépenses quotidiennes', fmtDA(c.expenses.total));
  row('Écart avec le mois précédent', '', deltaText(delta(c.expenses.total, p.expenses.total)));
  const max = Math.max(1, ...c.expenses.byCategory.map((x) => x.amount));
  const prevCat = new Map(p.expenses.byCategory.map((x) => [x.name, x.amount]));
  for (const x of c.expenses.byCategory) {
    ensure(8);
    text(x.name, L + 2, y);
    doc.setFillColor(5, 150, 105);
    doc.roundedRect(50, y - 3.5, Math.max(1, (60 * x.amount) / max), 4, 1, 1, 'F');
    text(fmtDA(x.amount), 140, y, { align: 'right' });
    const d = deltaText(delta(x.amount, prevCat.get(x.name) ?? 0));
    doc.setFontSize(8);
    text(d, R - 2, y, { align: 'right' });
    doc.setFontSize(10);
    y += 6.5;
  }
  y += 2;

  section('Voiture', fmtDA(c.car.total));
  row('Carburant', fmtDA(c.car.fuelAmount), deltaText(delta(c.car.fuelAmount, p.car.fuelAmount)));
  row('Litres', `${fmtNum(c.car.fuelLiters)} L`, deltaText(delta(c.car.fuelLiters, p.car.fuelLiters), 'L'));
  row('Consommation', c.car.consumption !== null ? `${fmtNum(c.car.consumption)} L/100 km` : '—', deltaText(delta(c.car.consumption, p.car.consumption), 'L/100'));
  row('Entretien', fmtDA(c.car.maintenance), deltaText(delta(c.car.maintenance, p.car.maintenance)));
  if (c.car.other) row('Assurance, contrôles, accessoires, divers', fmtDA(c.car.other));
  if (c.car.loanRemaining !== null) {
    row('Crédit payé ce mois', fmtDA(c.car.loanPaid));
    row('Crédit restant', fmtDA(c.car.loanRemaining), deltaText(delta(c.car.loanRemaining, p.car.loanRemaining)));
  }
  y += 2;

  section('Crèche');
  row('Payé pour ce mois', fmtDA(c.daycare.paid), deltaText(delta(c.daycare.paid, p.daycare.paid)));
  if (c.daycare.monthlyPaid !== null) row('Mensualité', c.daycare.monthlyPaid ? 'payée' : 'non payée');
  y += 2;

  section('Travail');
  row('Jours travaillés', fmtDays(c.work.worked), deltaText(delta(c.work.worked, p.work.worked), 'j'));
  row('Jours de mission', fmtDays(c.work.mission), deltaText(delta(c.work.mission, p.work.mission), 'j'));
  row('Congé / récupération / RC / absence', `${c.work.conge} / ${c.work.recup} / ${c.work.rc} / ${c.work.absence}`);
  row('Wilayas visitées', String(c.work.wilayas.length));
  if (c.work.wilayas.length) {
    const lines = doc.splitTextToSize(clean(c.work.wilayas.map((w) => `${String(w.code).padStart(2, '0')} ${w.name} (${w.days} j)`).join(' · ')), R - L - 4) as string[];
    for (const l of lines) {
      ensure(6);
      doc.text(l, L + 2, y);
      y += 5;
    }
  }
  y += 2;

  section('Soldes en fin de mois');
  row('Congé', fmtDays(c.balances.conge), deltaText(delta(c.balances.conge, p.balances.conge), 'j'));
  row('Récupération', fmtDays(c.balances.recup), deltaText(delta(c.balances.recup, p.balances.recup), 'j'));
  row('RC', fmtDays(c.balances.rc), deltaText(delta(c.balances.rc, p.balances.rc), 'j'));

  doc.setFontSize(8);
  doc.setTextColor(120);
  text('Écarts : par rapport au mois précédent. Généré par Mon Suivi, hors ligne.', L, 290);
  return doc.output('blob');
}
