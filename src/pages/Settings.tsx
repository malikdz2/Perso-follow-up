import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ChevronRight, FileSpreadsheet, Smartphone, Download, HardDrive, Monitor, Moon, RotateCcw, ShieldCheck, Sun, Trash2, Upload } from 'lucide-react';
import { db } from '../db/db';
import { setSetting, useSettings } from '../db/settings';
import { syncCalendarMoves } from '../lib/engine';
import { CSV_MODULES, toCSV } from '../lib/csv';
import { downloadFile } from '../lib/backup';
import { enableNotifications, notificationsSupported, notifyDueReminders } from '../lib/notify';
import { isStandalone, useInstallPrompt } from '../lib/install';
import { todayISO } from '../lib/dates';
import { parseNum } from '../lib/format';
import { backupSummary, exportBackup, parseBackup, restoreBackup, type BackupFile } from '../lib/backup';
import { fmtDate } from '../lib/dates';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import { Button, Card, Field, Input, PageHeader, Segmented, Select, Sheet } from '../components/ui';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function StorageInfo() {
  const [info, setInfo] = useState<{ persisted: boolean; usedMo?: number } | null>(null);
  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setInfo({ persisted, usedMo: est?.usage !== undefined ? est.usage / 1_048_576 : undefined });
    })();
  }, []);
  if (!info) return null;
  return (
    <div className="flex items-start gap-3 text-sm">
      <HardDrive className="mt-0.5 size-5 shrink-0 text-slate-400" />
      <div>
        <p>
          Stockage {info.persisted ? <strong className="text-emerald-700 dark:text-emerald-400">protégé</strong> : 'non protégé'}
          {info.usedMo !== undefined && ` — ${info.usedMo.toFixed(1)} Mo utilisés`}
        </p>
        {!info.persisted && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Installez l'app sur l'écran d'accueil pour que le navigateur protège vos données.</p>
        )}
      </div>
    </div>
  );
}

/** Clé API Anthropic (analyse IA facultative des photos d'état des lieux). */
function AiKeyField({ current }: { current?: string }) {
  const [value, setValue] = useState(current ?? '');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      <p className="font-medium">Analyse IA (facultative)</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Avec une clé API Anthropic (console.anthropic.com, payante à l'usage : quelques centimes de dollar par vue), le bouton « Analyse IA » envoie les photos à Claude
        pour décrire les dégâts. Les photos ne quittent le téléphone qu'à ce moment-là. La clé reste sur ce téléphone et n'est jamais incluse dans les sauvegardes.
      </p>
      <Input type="password" autoComplete="off" placeholder="sk-ant-…" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Clé API Anthropic" />
      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={busy || !value.trim()}
          onClick={async () => {
            setBusy(true);
            setStatus(null);
            try {
              const { testApiKey } = await import('../lib/damage/ai');
              const name = await testApiKey(value.trim());
              await setSetting('aiApiKey', value.trim());
              setStatus({ ok: true, text: `Clé valide (${name}). Analyse IA activée.` });
            } catch (e) {
              const { aiErrorMessage } = await import('../lib/damage/ai');
              setStatus({ ok: false, text: aiErrorMessage(e) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Vérification…' : 'Vérifier et enregistrer'}
        </Button>
        {current && (
          <Button
            variant="secondary"
            onClick={async () => {
              await setSetting('aiApiKey', undefined);
              setValue('');
              setStatus({ ok: true, text: 'Clé supprimée de ce téléphone.' });
            }}
          >
            Retirer
          </Button>
        )}
      </div>
      {status && (
        <p role="status" className={status.ok ? 'text-sm text-emerald-700 dark:text-emerald-400' : 'text-sm text-red-600 dark:text-red-400'}>
          {status.text}
        </p>
      )}
    </div>
  );
}

/** Version installée et recherche manuelle d'une mise à jour. */
function UpdateCard() {
  const [state, setState] = useState<{ busy: boolean; text: string }>({ busy: false, text: '' });
  const [y, m, d] = __BUILD_DATE__.split('-');
  return (
    <Card className="space-y-2 text-center">
      <p className="text-sm">
        Mon Suivi — <strong>version {__APP_VERSION__}</strong> du {d}/{m}/{y}
      </p>
      <Button
        block
        variant="secondary"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true, text: '' });
          const { checkForUpdate } = await import('../lib/pwa');
          const r = await checkForUpdate();
          setState({
            busy: false,
            text: {
              'a-jour': 'Vous avez la dernière version.',
              'mise-a-jour': 'Nouvelle version trouvée : installation, l’application va se recharger…',
              'hors-ligne': 'Pas de connexion : réessayez avec Internet.',
              indisponible: 'Vérification impossible dans ce navigateur.',
            }[r],
          });
        }}
      >
        <RotateCcw className="size-4" /> {state.busy ? 'Recherche…' : 'Rechercher une mise à jour'}
      </Button>
      {state.text && <p role="status" className="text-sm">{state.text}</p>}
    </Card>
  );
}

export default function Settings() {
  const settings = useSettings();
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeText, setWipeText] = useState('');
  const [wiping, setWiping] = useState(false);
  const [csvKey, setCsvKey] = useState(CSV_MODULES[0].key);
  const [notifMsg, setNotifMsg] = useState('');
  const installer = useInstallPrompt();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!settings) return null;

  const onPick = async (file?: File) => {
    if (!file) return;
    try {
      setPending(parseBackup(await file.text()));
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Réglages" back={false} />

      <Section title="Apparence">
        <Segmented
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setThemePref(v);
          }}
          options={[
            { value: 'light', label: <><Sun className="size-4" /> Clair</> },
            { value: 'dark', label: <><Moon className="size-4" /> Sombre</> },
            { value: 'system', label: <><Monitor className="size-4" /> Auto</> },
          ]}
        />
      </Section>

      <Section title="Identité (notes de frais)">
        <Card className="space-y-3">
          {(
            [
              ['fullName', 'Nom et prénom'],
              ['jobTitle', 'Fonction'],
              ['employer', 'Organisme / entreprise'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input defaultValue={settings[key] ?? ''} onBlur={(e) => void setSetting(key, e.target.value.trim() || undefined)} />
            </Field>
          ))}
        </Card>
      </Section>

      <Section title="Règles des soldes">
        <Card className="space-y-4">
          <Field label="Décompte du congé" group hint="Ouvrables : vendredi, samedi et jours fériés ne sont pas décomptés.">
            <Segmented
              value={settings.leaveCountMode}
              onChange={async (v) => {
                await setSetting('leaveCountMode', v);
                await syncCalendarMoves();
              }}
              options={[
                { value: 'ouvrables', label: 'Jours ouvrables' },
                { value: 'calendaires', label: 'Calendaires' },
              ]}
            />
          </Field>
          <Field label="Récupération par jour de mission (vendredi, samedi, férié)" hint="1 par défaut. Ex. : 1,5 ou 2.">
            <Input
              inputMode="decimal"
              defaultValue={String(settings.recupRatio).replace('.', ',')}
              onBlur={async (e) => {
                const v = parseNum(e.target.value);
                if (v > 0 && v <= 5 && v !== settings.recupRatio) {
                  await setSetting('recupRatio', v);
                  await syncCalendarMoves();
                } else e.target.value = String(settings.recupRatio).replace('.', ',');
              }}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Saisie rapide « + »">
        <Link
          to="/reglages/mots-cles"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-4 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"
        >
          <span>
            <span className="block font-medium">Mots-clés</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">« plein » → Carburant, « courses » → Alimentation…</span>
          </span>
          <ChevronRight className="size-5 text-slate-400" />
        </Link>
        <Link
          to="/depenses/categories"
          className="flex min-h-14 items-center justify-between rounded-2xl bg-white px-4 shadow-sm ring-1 ring-slate-200/70 active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"
        >
          <span>
            <span className="block font-medium">Catégories et budgets</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">Alerte à 80 % et à 100 % du budget mensuel</span>
          </span>
          <ChevronRight className="size-5 text-slate-400" />
        </Link>
      </Section>

      <Section title="États des lieux — analyse des photos">
        <Card className="space-y-4">
          <Field label="Sensibilité de la comparaison" group hint="Plus sensible = repère des rayures plus fines, mais davantage de fausses alertes (reflets, poussière).">
            <Segmented
              value={String(settings.damageSensitivity)}
              onChange={(v) => void setSetting('damageSensitivity', Number(v))}
              options={[
                { value: '0.7', label: 'Faible' },
                { value: '1', label: 'Normale' },
                { value: '1.4', label: 'Élevée' },
              ]}
            />
          </Field>
          <Field label="Zone analysée" group hint="« Carrosserie » ignore le décor (sol, autres voitures, passants) en se limitant à la silhouette du guide.">
            <Segmented
              value={settings.damageUseMask ? 'mask' : 'all'}
              onChange={(v) => void setSetting('damageUseMask', v === 'mask')}
              options={[
                { value: 'mask', label: 'Carrosserie' },
                { value: 'all', label: 'Toute la photo' },
              ]}
            />
          </Field>
          <AiKeyField current={settings.aiApiKey} />
        </Card>
      </Section>

      <Section title="Voiture">
        <Card>
          <Field label="Intervalle entre deux vidanges (km)" hint="10 000 km par défaut.">
            <Input
              inputMode="numeric"
              defaultValue={String(settings.oilInterval)}
              onBlur={async (e) => {
                const v = Math.round(parseNum(e.target.value));
                if (v >= 1000 && v <= 50_000) await setSetting('oilInterval', v);
                else e.target.value = String(settings.oilInterval);
              }}
            />
          </Field>
        </Card>
      </Section>

      <Section title="Application">
        <Card className="space-y-3">
          {isStandalone() ? (
            <p className="flex items-center gap-2 text-sm">
              <Smartphone className="size-5 text-emerald-600" /> Application installée sur ce téléphone.
            </p>
          ) : installer.available ? (
            <Button block onClick={() => void installer.install()}>
              <Smartphone className="size-5" /> Installer l'application
            </Button>
          ) : (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Pour installer : menu ⋮ de Chrome → « Ajouter à l'écran d'accueil » (ou « Installer l'application »).
            </p>
          )}
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <p className="flex items-center gap-2 font-medium">
              <Bell className="size-4" /> Notifications de rappel
            </p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Crèche, crédit, assurance, contrôle technique, vignette, vidange, budget, récap, sauvegarde. Envoyées à l'ouverture de l'app (une fois par jour et par rappel), sans aucun serveur.
            </p>
            {!notificationsSupported() ? (
              <p className="text-sm text-slate-500">Non disponibles sur ce navigateur.</p>
            ) : (
              <Segmented
                value={settings.notificationsEnabled ? 'on' : 'off'}
                onChange={async (v) => {
                  if (v === 'on') {
                    const ok = await enableNotifications();
                    setNotifMsg(ok ? 'Notifications activées.' : 'Autorisation refusée : activez-la dans les réglages de Chrome pour ce site.');
                    if (ok) await notifyDueReminders();
                  } else {
                    await setSetting('notificationsEnabled', false);
                    setNotifMsg('Notifications désactivées.');
                  }
                }}
                options={[
                  { value: 'on', label: 'Activées' },
                  { value: 'off', label: 'Désactivées' },
                ]}
              />
            )}
            {notifMsg && <p role="status" className="mt-1 text-sm">{notifMsg}</p>}
          </div>
        </Card>
      </Section>

      <Section title="Sauvegarde">
        <Card className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {settings.lastBackup ? `Dernière sauvegarde : ${fmtDate(settings.lastBackup)}` : 'Aucune sauvegarde pour l’instant.'}
            <br />
            Le fichier JSON contient toutes vos données, photos comprises. Gardez-le en lieu sûr (Drive, e-mail, clé USB).
          </p>
          <Button block onClick={() => void exportBackup().then(() => setMessage({ ok: true, text: 'Sauvegarde téléchargée.' }))}>
            <Download className="size-5" /> Exporter (JSON)
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onPick(e.target.files?.[0])} />
          <Button block variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-5" /> Importer une sauvegarde
          </Button>
          {message && (
            <p role="status" className={message.ok ? 'text-sm font-medium text-emerald-700 dark:text-emerald-400' : 'text-sm font-medium text-red-600 dark:text-red-400'}>
              {message.text}
            </p>
          )}
        </Card>
      </Section>

      <Section title="Export CSV (Excel)">
        <Card className="space-y-3">
          <Select aria-label="Module à exporter" value={csvKey} onChange={(e) => setCsvKey(e.target.value)}>
            {CSV_MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
          <Button
            block
            variant="secondary"
            onClick={async () => {
              const m = CSV_MODULES.find((x) => x.key === csvKey)!;
              const { headers, rows } = await m.build();
              downloadFile(toCSV(headers, rows), `mon-suivi-${m.key}-${todayISO()}.csv`, 'text/csv;charset=utf-8');
              setMessage({ ok: true, text: `${m.label} : ${rows.length} ligne${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}.` });
            }}
          >
            <FileSpreadsheet className="size-5" /> Exporter en CSV
          </Button>
          <p className="text-xs text-slate-500 dark:text-slate-400">Séparateur « ; » et virgule décimale : s'ouvre directement dans Excel ou Google Sheets.</p>
        </Card>
      </Section>

      <Section title="Démarrage">
        <Card className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Revoir les soldes de départ, la voiture, le crédit et la crèche.</p>
          <Button block variant="secondary" onClick={() => void setSetting('onboarded', false)}>
            <RotateCcw className="size-5" /> Relancer l'assistant
          </Button>
        </Card>
      </Section>

      <Section title="Confidentialité">
        <Card className="space-y-3">
          <div className="flex items-start gap-3 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p>Toutes les données restent sur ce téléphone. Rien n'est envoyé sur Internet.</p>
          </div>
          <StorageInfo />
        </Card>
      </Section>

      <Section title="Zone sensible">
        <Button block variant="secondary" className="text-red-600 dark:text-red-400" onClick={() => setWipeOpen(true)}>
          <Trash2 className="size-5" /> Effacer toutes les données
        </Button>
      </Section>

      {wiping && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 text-lg font-semibold dark:bg-slate-950">Effacement…</div>}

      <UpdateCard />

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Importer la sauvegarde ?">
        {pending && (
          <div className="space-y-3">
            <p className="text-sm">
              Sauvegarde du <strong>{fmtDate(pending.exportedAt.slice(0, 10))}</strong> — {backupSummary(pending)} éléments.
            </p>
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              ⚠️ Les données actuelles de ce téléphone seront <strong>remplacées</strong>.
            </p>
            <Button
              block
              onClick={async () => {
                try {
                  await restoreBackup(pending);
                  setMessage({ ok: true, text: 'Sauvegarde restaurée.' });
                } catch (e) {
                  setMessage({ ok: false, text: `Restauration impossible : ${(e as Error).message}` });
                }
                setPending(null);
              }}
            >
              Remplacer mes données
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet
        open={wipeOpen}
        onClose={() => {
          setWipeOpen(false);
          setWipeText('');
        }}
        title="Effacer toutes les données ?"
      >
        <div className="space-y-3">
          <p className="text-sm">Action définitive. Pensez à exporter une sauvegarde avant.</p>
          <Field label="Tapez EFFACER pour confirmer">
            <Input value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoCapitalize="characters" />
          </Field>
          <Button
            block
            variant="danger"
            disabled={wipeText.trim().toUpperCase() !== 'EFFACER'}
            onClick={async () => {
              setWiping(true);
              await db.delete();
              location.hash = '#/';
              location.reload();
            }}
          >
            Tout effacer
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
