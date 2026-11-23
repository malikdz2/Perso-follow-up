import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { todayISO } from '../../lib/dates';
import { parseDA } from '../../lib/format';
import { Button, Field, Input, PageHeader } from '../../components/ui';

interface Form {
  model: string;
  plate: string;
  purchasePrice: string;
  purchaseDate: string;
  downPayment: string;
  initialKm: string;
}

/** Prix et informations du véhicule. */
export default function VehiclePage() {
  const navigate = useNavigate();
  const [f, setF] = useState<Form | null>(null);
  const [id, setId] = useState<number | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    void db.vehicle
      .toCollection()
      .first()
      .then((v) => {
        setId(v?.id);
        setF({
          model: v?.model ?? '',
          plate: v?.plate ?? '',
          purchasePrice: v?.purchasePrice ? String(v.purchasePrice) : '',
          purchaseDate: v?.purchaseDate ?? todayISO(),
          downPayment: v?.downPayment ? String(v.downPayment) : '',
          initialKm: v?.initialKm ? String(v.initialKm) : '',
        });
      });
  }, []);

  if (!f) return null;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.model.trim()) return setError('Indiquez le modèle.');
    const v = {
      model: f.model.trim(),
      plate: f.plate.trim() || undefined,
      purchasePrice: parseDA(f.purchasePrice),
      purchaseDate: f.purchaseDate || todayISO(),
      downPayment: parseDA(f.downPayment),
      initialKm: f.initialKm ? parseDA(f.initialKm) : undefined,
    };
    if (id !== undefined) await db.vehicle.update(id, v);
    else await db.vehicle.add(v);
    navigate(-1);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Mon véhicule" />
      <Field label="Modèle">
        <Input value={f.model} onChange={set('model')} placeholder="Ex. : Renault Symbol" />
      </Field>
      <Field label="Immatriculation">
        <Input value={f.plate} onChange={set('plate')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prix d'achat (DA)">
          <Input inputMode="numeric" value={f.purchasePrice} onChange={set('purchasePrice')} />
        </Field>
        <Field label="Date d'achat">
          <Input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} />
        </Field>
        <Field label="Apport (DA)">
          <Input inputMode="numeric" value={f.downPayment} onChange={set('downPayment')} />
        </Field>
        <Field label="Km à l'achat / départ">
          <Input inputMode="numeric" value={f.initialKm} onChange={set('initialKm')} />
        </Field>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      <Button block onClick={() => void save()}>
        Enregistrer
      </Button>
    </div>
  );
}
