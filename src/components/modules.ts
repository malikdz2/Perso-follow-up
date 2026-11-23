import { Baby, Briefcase, CalendarDays, Car, Scale, Wallet, type LucideIcon } from 'lucide-react';

export interface ModuleDef {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Classes de la pastille d'icône */
  tint: string;
  /** Étape du plan où le module est construit */
  step: number;
}

/** Les 6 modules de la grille d'accueil. */
export const MODULES: ModuleDef[] = [
  { path: '/voiture', label: 'Voiture', icon: Car, tint: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', step: 4 },
  { path: '/depenses', label: 'Dépenses', icon: Wallet, tint: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', step: 5 },
  { path: '/creche', label: 'Crèche', icon: Baby, tint: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300', step: 5 },
  { path: '/calendrier', label: 'Calendrier', icon: CalendarDays, tint: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', step: 2 },
  { path: '/missions', label: 'Missions', icon: Briefcase, tint: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', step: 3 },
  { path: '/soldes', label: 'Soldes', icon: Scale, tint: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', step: 2 },
];
