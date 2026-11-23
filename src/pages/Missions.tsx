import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Briefcase, ChevronRight, Plus, Search } from 'lucide-react';
import { db, type Mission } from '../db/db';
import { WILAYA_BY_CODE, wilayaLabel } from '../data/wilayas';
import { MONTHS_FR, fmtDate, todayISO } from '../lib/dates';
import { fmtDA } from '../lib/format';
import { availableYears, missionDays, wilayaStats } from '../lib/missions';
import { cx } from '../lib/cx';
import { AlgeriaMap, type VisitLevel } from '../components/AlgeriaMap';
import { Button, Card, EmptyState, Input, PageHeader, Segmented, Select } from '../components/ui';

/** Frais par mission (frais saisis + dépenses rattachées). */
function useMissionsData() {
  return useLiveQuery(async () => {
    const [missions, fees, expenses, fuel, misc] = await Promise.all([
      db.missions.toArray(),
      db.missionFees.toArray(),
      db.expenses.where('missionId').above(0).toArray(),
      db.fuel.where('missionId').above(0).toArray(),
      db.carMisc.where('missionId').above(0).toArray(),
    ]);
    const cost = new Map<number, number>();
    const add = (id: number | undefined, n: number) => id !== undefined && cost.set(id, (cost.get(id) ?? 0) + n);
    fees.forEach((f) => add(f.missionId, f.amount));
    [...expenses, ...fuel, ...misc].forEach((e) => add(e.missionId, e.amount));
    return { missions: missions.sort((a, b) => b.start.localeCompare(a.start)), cost };
  });
}

function MissionCard({ m, cost }: { m: Mission; cost: number }) {
  const today = todayISO();
  const ongoing = m.start <= today && m.end >= today;
  const n = missionDays(m);
  return (
    <Link
      to={`/missions/${m.id}`}
      className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:active:bg-slate-800"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-semibold">
          <span className="truncate">{wilayaLabel(m.wilaya)}</span>
          {ongoing && <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-950 dark:text-violet-300">En cours</span>}
        </p>
        <p className="truncate text-sm text-slate-600 dark:text-slate-300">{[m.place, m.reason].filter(Boolean).join(' · ') || '—'}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {m.start === m.end ? `le ${fmtDate(m.start)}` : `du ${fmtDate(m.start)} au ${fmtDate(m.end)}`} · {n} j
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-semibold tabular-nums">{fmtDA(cost)}</p>
        <p className="text-xs text-slate-500">frais</p>
      </div>
      <ChevronRight className="size-5 shrink-0 text-slate-400" />
    </Link>
  );
}

function ListView({ missions, cost }: { missions: Mission[]; cost: Map<number, number> }) {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const years = availableYears(missions).reverse();

  const q = query.trim().toLowerCase();
  const filtered = missions.filter((m) => {
    if (year !== 'all' && !(m.start.slice(0, 4) <= year && m.end.slice(0, 4) >= year)) return false;
    if (month !== 'all') {
      const key = `${year === 'all' ? m.start.slice(0, 4) : year}-${month}`;
      if (!(m.start.slice(0, 7) <= key && m.end.slice(0, 7) >= key)) return false;
    }
    if (!q) return true;
    const w = WILAYA_BY_CODE.get(m.wilaya);
    return [w?.name, w?.capital, String(m.wilaya).padStart(2, '0'), m.place, m.reason, m.note].some((s) => s?.toLowerCase().includes(q));
  });
  const total = filtered.reduce((s, m) => s + (cost.get(m.id!) ?? 0), 0);
  const days = filtered.reduce((s, m) => s + missionDays(m), 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-3 left-3 size-5 text-slate-400" />
        <Input className="pl-10" placeholder="Wilaya, lieu, motif…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher une mission" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select aria-label="Année" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="all">Toutes années</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select aria-label="Mois" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Tous les mois</option>
          {MONTHS_FR.map((n, i) => (
            <option key={n} value={String(i + 1).padStart(2, '0')}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      {missions.length === 0 ? (
        <EmptyState icon={<Briefcase className="size-10" />} title="Aucune mission">
          Créez votre première mission : ses jours seront marqués dans le calendrier.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filtered.length} mission{filtered.length > 1 ? 's' : ''} · {days} j · {fmtDA(total)} de frais
          </p>
          <div className="space-y-2">
            {filtered.map((m) => (
              <MissionCard key={m.id} m={m} cost={cost.get(m.id!) ?? 0} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MapView({ missions }: { missions: Mission[] }) {
  const navigate = useNavigate();
  const years = availableYears(missions);
  const [year, setYear] = useState(Number(todayISO().slice(0, 4)));
  const [selected, setSelected] = useState<number | null>(null);
  const stats = useMemo(() => wilayaStats(missions, year), [missions, year]);
  const levels = useMemo(() => new Map(stats.map((s) => [s.code, (s.missions >= 2 ? 2 : 1) as VisitLevel])), [stats]);
  const selectedMissions = selected === null ? [] : missions.filter((m) => m.wilaya === selected && m.start.slice(0, 4) <= String(year) && m.end.slice(0, 4) >= String(year));
  const legend: [VisitLevel, string][] = [
    [0, 'Non visitée'],
    [1, '1 mission'],
    [2, '2 missions ou plus'],
  ];
  const swatch = { 0: 'bg-slate-300 dark:bg-slate-700', 1: 'bg-green-300 dark:bg-green-800', 2: 'bg-green-700 dark:bg-green-500' };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800">
        <div className="min-w-0 flex-1">
          <p className="leading-tight">
            <span className="text-3xl font-bold tabular-nums">{stats.length}</span>
            <span className="text-lg text-slate-500 dark:text-slate-400"> / 69</span>
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">wilayas visitées en {year}</p>
        </div>
        <div className="w-28 shrink-0">
          <Select aria-label="Année de la carte" value={year} onChange={(e) => (setYear(Number(e.target.value)), setSelected(null))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <AlgeriaMap levels={levels} selected={selected} onSelect={setSelected} />

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {legend.map(([l, label]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className={cx('size-3 rounded', swatch[l])} /> {label}
          </span>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Pincez ou utilisez les boutons pour zoomer · touchez une wilaya</p>

      <Select aria-label="Choisir une wilaya" value={selected ?? ''} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Choisir une wilaya…</option>
        {[...WILAYA_BY_CODE.keys()].map((c) => (
          <option key={c} value={c}>
            {wilayaLabel(c)}
          </option>
        ))}
      </Select>

      {selected !== null && (
        <Card className="ring-2 ring-amber-400 dark:ring-amber-500">
          <p className="font-bold">{wilayaLabel(selected)}</p>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            Chef-lieu : {WILAYA_BY_CODE.get(selected)?.capital} · {WILAYA_BY_CODE.get(selected)?.nameAr}
          </p>
          {selectedMissions.length === 0 ? (
            <p className="text-sm">Aucune mission en {year}.</p>
          ) : (
            <ul className="space-y-1">
              {selectedMissions.map((m) => (
                <li key={m.id}>
                  <Link to={`/missions/${m.id}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm active:bg-slate-100 dark:active:bg-slate-800">
                    <span className="truncate">
                      {fmtDate(m.start)} → {fmtDate(m.end)} · {m.place || m.reason || 'Mission'}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" block className="mt-2" onClick={() => navigate(`/missions/nouvelle?wilaya=${selected}`)}>
            <Plus className="size-4" /> Nouvelle mission ici
          </Button>
        </Card>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Wilayas visitées en {year}</h2>
        {stats.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Aucune wilaya visitée cette année.</p>
        ) : (
          <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 dark:divide-slate-800 dark:bg-slate-900 dark:ring-slate-800">
            {stats.map((s, i) => (
              <li key={s.code}>
                <button type="button" onClick={() => setSelected(s.code)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-slate-50 dark:active:bg-slate-800">
                  <span className="w-5 text-sm text-slate-400 tabular-nums">{i + 1}</span>
                  <span className={cx('size-3 shrink-0 rounded', swatch[s.missions >= 2 ? 2 : 1])} />
                  <span className="min-w-0 flex-1 truncate font-medium">{wilayaLabel(s.code)}</span>
                  <span className="shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">
                    {s.missions} mission{s.missions > 1 ? 's' : ''} · <strong className="text-slate-900 dark:text-slate-100">{s.days} j</strong>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function Missions() {
  const data = useMissionsData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const view = params.get('vue') === 'carte' ? 'carte' : 'liste';
  if (!data) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Missions"
        action={
          <Button className="mr-1 px-3" onClick={() => navigate('/missions/nouvelle')} aria-label="Nouvelle mission">
            <Plus className="size-5" /> Nouvelle
          </Button>
        }
      />
      <Segmented
        value={view}
        onChange={(v) => setParams(v === 'carte' ? { vue: 'carte' } : {}, { replace: true })}
        options={[
          { value: 'liste', label: 'Liste' },
          { value: 'carte', label: 'Carte' },
        ]}
      />
      {view === 'liste' ? <ListView missions={data.missions} cost={data.cost} /> : <MapView missions={data.missions} />}
    </div>
  );
}
