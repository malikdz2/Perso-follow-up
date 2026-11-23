import { db } from '../db/db';
import { setSetting } from '../db/settings';
import { todayISO } from './dates';

export const BACKUP_APP_ID = 'mon-suivi';
export const BACKUP_FORMAT = 1;

interface EncodedBlob {
  __blob: true;
  type: string;
  data: string; // base64
}

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  format: number;
  dbVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function isEncodedBlob(v: unknown): v is EncodedBlob {
  return typeof v === 'object' && v !== null && (v as EncodedBlob).__blob === true;
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    return { __blob: true, type: value.type, data: await blobToBase64(value) } satisfies EncodedBlob;
  }
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (isEncodedBlob(value)) return base64ToBlob(value.data, value.type);
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = decode(v);
    return out;
  }
  return value;
}

/** Construit la sauvegarde complète (toutes les tables, photos incluses). */
export async function buildBackup(): Promise<BackupFile> {
  const tables: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    tables[table.name] = (await encode(await table.toArray())) as unknown[];
  }
  return {
    app: BACKUP_APP_ID,
    format: BACKUP_FORMAT,
    dbVersion: db.verno,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function downloadFile(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Télécharge la sauvegarde JSON et mémorise la date (pour le rappel tous les 30 jours). */
export async function exportBackup(): Promise<void> {
  const today = todayISO();
  // Date enregistrée avant l'export pour qu'elle figure aussi dans le fichier.
  await setSetting('lastBackup', today);
  const backup = await buildBackup();
  downloadFile(JSON.stringify(backup), `mon-suivi-sauvegarde-${today}.json`, 'application/json');
}

/** Vérifie le fichier et renvoie un résumé (nombre d'éléments par table). */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.");
  }
  const b = data as Partial<BackupFile>;
  if (b.app !== BACKUP_APP_ID || typeof b.tables !== 'object' || b.tables === null) {
    throw new Error("Ce fichier n'est pas une sauvegarde Mon Suivi.");
  }
  if ((b.format ?? 0) > BACKUP_FORMAT) {
    throw new Error('Sauvegarde créée par une version plus récente de l’app. Mettez l’app à jour.');
  }
  return b as BackupFile;
}

/** Remplace TOUTES les données par celles de la sauvegarde (transaction unique : tout ou rien). */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const known = new Set(db.tables.map((t) => t.name));
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
    for (const [name, rows] of Object.entries(backup.tables)) {
      if (!known.has(name) || !Array.isArray(rows) || rows.length === 0) continue;
      await db.table(name).bulkPut(decode(rows) as unknown[]);
    }
  });
}

export function backupSummary(backup: BackupFile): number {
  return Object.values(backup.tables).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
}
