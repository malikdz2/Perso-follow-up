// Conversion enregistrement ⇄ formulaire (chaînes de saisie).
import { parseDA, parseNum } from '../lib/format';
import type { FieldDef, FormState, Row } from './RecordList';

export function toForm(fields: FieldDef[], r: Record<string, unknown>): FormState {
  const f: FormState = {};
  for (const d of fields) {
    const v = r[d.key];
    if (d.type === 'bool') f[d.key] = !!v;
    else if (d.type === 'photo') f[d.key] = v instanceof Blob ? v : undefined;
    else f[d.key] = v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v)) ? '' : d.type === 'decimal' ? String(v).replace('.', ',') : String(v);
  }
  return f;
}

export function fromForm(fields: FieldDef[], f: FormState): Row {
  const r: Row = {};
  for (const d of fields) {
    const v = f[d.key];
    if (d.type === 'bool') r[d.key] = !!v;
    else if (d.type === 'photo') r[d.key] = v instanceof Blob ? v : undefined;
    else {
      const s = String(v ?? '').trim();
      if (d.type === 'da') r[d.key] = parseDA(s);
      else if (d.type === 'decimal') r[d.key] = s ? parseNum(s) : undefined;
      else if (d.type === 'int') r[d.key] = s ? Math.round(parseNum(s)) : undefined;
      else if (d.type === 'mission' || (d.type === 'select' && d.numeric)) r[d.key] = s ? Number(s) : undefined;
      else r[d.key] = s || undefined;
    }
  }
  return r;
}

