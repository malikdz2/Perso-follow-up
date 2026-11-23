import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RotateCcw, X } from 'lucide-react';
import { DEFAULT_KEYWORDS, db } from '../../db/db';
import { todayISO } from '../../lib/dates';
import { fmtDA } from '../../lib/format';
import { normalize, parseQuickEntry, targetLabel } from '../../lib/quickparse';
import { Button, Card, Field, Input, PageHeader, Select } from '../../components/ui';

/** Mots-clés de la saisie rapide « + » : quel mot range la saisie dans quel module. */
export default function KeywordsPage() {
  const data = useLiveQuery(async () => ({ keywords: await db.keywords.toArray(), categories: await db.categories.orderBy('order').toArray() }));
  const [word, setWord] = useState('');
  const [target, setTarget] = useState('');
  const [trial, setTrial] = useState('');
  const [error, setError] = useState('');
  if (!data) return null;

  const catName = (id: number) => data.categories.find((c) => c.id === id)?.name;
  const targets = [
    'fuel',
    'maintenance',
    'carMisc:lavage',
    'carMisc:parking',
    'carMisc:amende',
    'carMisc:peage',
    'daycare',
    ...data.categories.map((c) => `expense:${c.id}`),
  ];
  const groups = targets.map((t) => ({ t, words: data.keywords.filter((k) => k.target === t).sort((a, b) => a.word.localeCompare(b.word)) }));
  const parsed = trial.trim() ? parseQuickEntry(trial, data.keywords, todayISO()) : null;

  const add = async () => {
    const w = word.trim().toLowerCase();
    if (!w || !target) return setError('Indiquez le mot et sa destination.');
    if (data.keywords.some((k) => normalize(k.word) === normalize(w))) return setError(`« ${w} » existe déjà.`);
    await db.keywords.add({ word: w, target });
    setWord('');
    setError('');
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Mots-clés de saisie" />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Quand vous tapez « 3000 plein » dans le bouton « + », le mot « plein » range la saisie dans Carburant. Majuscules et accents sont ignorés.
      </p>

      <Card className="space-y-2">
        <Field label="Essayer une phrase">
          <Input value={trial} onChange={(e) => setTrial(e.target.value)} placeholder="Ex. : 2500 pharmacie" />
        </Field>
        {parsed && (
          <p className="text-sm">
            → {parsed.target ? <strong>{targetLabel(parsed.target, catName)}</strong> : <strong className="text-amber-600">non reconnu</strong>}
            {parsed.amount ? ` · ${fmtDA(parsed.amount)}` : ' · montant manquant'}
            {parsed.keyword && ` (mot-clé « ${parsed.keyword} »)`}
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <p className="font-semibold">Ajouter un mot-clé</p>
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label="Nouveau mot-clé" placeholder="Mot" value={word} onChange={(e) => setWord(e.target.value)} />
          <Select aria-label="Destination" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Ranger dans…</option>
            {targets.map((t) => (
              <option key={t} value={t}>
                {targetLabel(t, catName)}
              </option>
            ))}
          </Select>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <Button block variant="secondary" onClick={() => void add()}>
          <Plus className="size-4" /> Ajouter
        </Button>
      </Card>

      {groups.map(({ t, words }) => (
        <section key={t}>
          <h2 className="mb-1.5 text-sm font-semibold">{targetLabel(t, catName)}</h2>
          <div className="flex flex-wrap gap-1.5">
            {words.map((k) => (
              <span key={k.id} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 py-0.5 pr-0.5 pl-3 text-sm dark:bg-slate-800">
                {k.word}
                <button type="button" aria-label={`Supprimer ${k.word}`} onClick={() => void db.keywords.delete(k.id!)} className="flex size-8 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-700">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            {words.length === 0 && <span className="text-sm text-slate-400">aucun</span>}
          </div>
        </section>
      ))}

      <Button
        variant="ghost"
        block
        onClick={async () => {
          if (!window.confirm('Remettre la liste de mots-clés par défaut ? Vos ajouts seront perdus.')) return;
          await db.transaction('rw', db.keywords, async () => {
            await db.keywords.clear();
            // Les mots par défaut visent les catégories d'origine (ids 1 à 8) : on ignore celles supprimées.
            const ids = new Set(data.categories.map((c) => c.id));
            await db.keywords.bulkAdd(DEFAULT_KEYWORDS.filter((k) => !k.target.startsWith('expense:') || ids.has(Number(k.target.slice(8)))));
          });
        }}
      >
        <RotateCcw className="size-4" /> Rétablir les mots-clés par défaut
      </Button>
    </div>
  );
}
