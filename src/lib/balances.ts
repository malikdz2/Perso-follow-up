import type { BalanceMove, BalanceType } from '../db/db';

export interface BalanceSummary {
  acquired: number;
  taken: number;
  remaining: number;
}

export const BALANCE_LABELS: Record<BalanceType, string> = {
  conge: 'Congé',
  recup: 'Récupération',
  rc: 'RC',
};

/**
 * Les soldes sont TOUJOURS recalculés à partir des mouvements (aucun total stocké).
 * (Étape 2 : ajout de l'acquisition mensuelle et des récupérations de mission.)
 */
export function computeBalances(moves: BalanceMove[]): Record<BalanceType, BalanceSummary> {
  const out: Record<BalanceType, BalanceSummary> = {
    conge: { acquired: 0, taken: 0, remaining: 0 },
    recup: { acquired: 0, taken: 0, remaining: 0 },
    rc: { acquired: 0, taken: 0, remaining: 0 },
  };
  for (const m of moves) {
    const s = out[m.type];
    if (!s) continue;
    if (m.days >= 0) s.acquired += m.days;
    else s.taken += -m.days;
  }
  for (const s of Object.values(out)) {
    s.acquired = round2(s.acquired);
    s.taken = round2(s.taken);
    s.remaining = round2(s.acquired - s.taken);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
