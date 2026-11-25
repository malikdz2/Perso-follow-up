import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CarFront, ChevronRight, Plus, ScanSearch } from 'lucide-react';
import { db } from '../../../db/db';
import { fmtDate } from '../../../lib/dates';
import { createInspection } from '../../../lib/damage/inspections';
import { cx } from '../../../lib/cx';
import { Button, Card, EmptyState, Field, Input, PageHeader, Sheet } from '../../../components/ui';

/** Liste des états des lieux : chaque départ, avec ses retours. */
export default function InspectionsPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const data = useLiveQuery(async () => {
    const [all, shots, damages] = await Promise.all([db.inspections.toArray(), db.inspectionShots.toArray(), db.damages.toArray()]);
    const list = all.sort((a, b) => b.createdAt - a.createdAt);
    const count = (id: number) => ({
      shots: shots.filter((s) => s.inspectionId === id).length,
      confirmed: damages.filter((d) => d.inspectionId === id && d.status === 'confirme').length,
      pending: damages.filter((d) => d.inspectionId === id && d.status === 'a_verifier').length,
    });
    return { departures: list.filter((i) => i.kind === 'depart'), returns: list.filter((i) => i.kind === 'retour'), count };
  });
  if (!data) return null;

  const create = async () => {
    const id = await createInspection('depart', label);
    setOpen(false);
    setLabel('');
    navigate(`/voiture/etats-des-lieux/${id}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="États des lieux"
        action={
          <Button className="mr-1 px-3" onClick={() => setOpen(true)}>
            <Plus className="size-5" /> Départ
          </Button>
        }
      />
      <Card className="space-y-1 text-sm">
        <p className="font-semibold">Comment ça marche</p>
        <p>1. <strong>Départ</strong> : photographiez la voiture sous 8 angles et marquez les rayures déjà présentes.</p>
        <p>2. <strong>Retour</strong> : reprenez les mêmes photos, en superposant celles du départ. L'app compare et entoure les changements.</p>
        <p>3. Confirmez les nouveaux dégâts, puis générez le <strong>constat PDF</strong> avec photos avant / après.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Comparaison faite sur le téléphone, hors ligne. Analyse IA facultative (Réglages).</p>
      </Card>

      {data.departures.length === 0 ? (
        <EmptyState icon={<CarFront className="size-10" />} title="Aucun état des lieux">
          Commencez par un état des lieux de départ.
        </EmptyState>
      ) : (
        data.departures.map((dep) => {
          const c = data.count(dep.id!);
          const rets = data.returns.filter((r) => r.departureId === dep.id);
          return (
            <div key={dep.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
              <Link to={`/voiture/etats-des-lieux/${dep.id}`} className="flex min-h-16 items-center gap-3 p-4 active:bg-slate-50 dark:active:bg-slate-800">
                <CarFront className="size-6 shrink-0 text-sky-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{dep.label}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Départ du {fmtDate(dep.date)} · {c.shots}/8 photos · {c.confirmed} dégât{c.confirmed > 1 ? 's' : ''} existant{c.confirmed > 1 ? 's' : ''}
                  </p>
                </div>
                <ChevronRight className="size-5 text-slate-400" />
              </Link>
              {rets.map((r) => {
                const rc = data.count(r.id!);
                return (
                  <Link key={r.id} to={`/voiture/etats-des-lieux/${r.id}`} className="flex min-h-14 items-center gap-3 border-t border-slate-100 px-4 py-2 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800">
                    <ScanSearch className="size-5 shrink-0 text-violet-600" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">Retour du {fmtDate(r.date)}</p>
                      <p className={cx(rc.confirmed ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                        {rc.shots}/8 photos · {rc.confirmed} nouveau{rc.confirmed > 1 ? 'x' : ''} dégât{rc.confirmed > 1 ? 's' : ''}
                        {rc.pending ? ` · ${rc.pending} à vérifier` : ''}
                      </p>
                    </div>
                    <ChevronRight className="size-5 text-slate-400" />
                  </Link>
                );
              })}
            </div>
          );
        })
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Nouvel état des lieux de départ">
        <div className="space-y-3">
          <Field label="Libellé" hint="Ex. : Location Karim, Prêt à Samir, Garage…">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Location…" autoFocus />
          </Field>
          <Button block onClick={() => void create()}>
            Commencer
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
