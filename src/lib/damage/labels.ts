import type { Damage } from '../../db/db';

export const SOURCE_LABEL = { auto: 'Comparaison', ia: 'IA', manuel: 'Ajout manuel' } as const;
export const KIND_LABEL: Record<string, string> = { rayure: 'Rayure', bosse: 'Bosse', eclat: 'Éclat', fissure: 'Fissure', choc: 'Choc', autre: 'Autre' };
export const SEVERITY_LABEL: Record<string, string> = { leger: 'léger', moyen: 'moyen', important: 'important' };

export function damageTitle(d: Damage, n?: number) {
  const k = d.kind ? KIND_LABEL[d.kind] ?? d.kind : 'Dégât';
  return `${n !== undefined ? `#${n} · ` : ''}${k}${d.severity ? ` (${SEVERITY_LABEL[d.severity] ?? d.severity})` : ''}`;
}
