// Les 8 prises de vue d'un état des lieux, avec la silhouette qui guide le cadrage
// (et limite l'analyse à la carrosserie). Coordonnées normalisées dans un cadre 4:3 horizontal.

export type ViewKey = 'avant' | 'avant_droit' | 'droite' | 'arriere_droit' | 'arriere' | 'arriere_gauche' | 'gauche' | 'avant_gauche';

type Pt = [number, number];
interface Shape {
  body: Pt[];
  wheels: { x: number; y: number; r: number }[];
}

// Profil, avant de la voiture à GAUCHE de l'image (vue côté gauche).
const SIDE: Shape = {
  body: [[0.05, 0.62], [0.05, 0.74], [0.12, 0.79], [0.88, 0.79], [0.95, 0.74], [0.95, 0.58], [0.88, 0.52], [0.72, 0.5], [0.62, 0.31], [0.38, 0.31], [0.27, 0.48], [0.1, 0.54]],
  wheels: [{ x: 0.22, y: 0.77, r: 0.085 }, { x: 0.78, y: 0.77, r: 0.085 }],
};
// Face avant ou arrière.
const FACE: Shape = {
  body: [[0.16, 0.8], [0.14, 0.6], [0.2, 0.5], [0.28, 0.3], [0.72, 0.3], [0.8, 0.5], [0.86, 0.6], [0.84, 0.8]],
  wheels: [{ x: 0.24, y: 0.81, r: 0.05 }, { x: 0.76, y: 0.81, r: 0.05 }],
};
// Trois-quarts, coin de la voiture à GAUCHE de l'image.
const THREE_QUARTER: Shape = {
  body: [[0.06, 0.7], [0.07, 0.56], [0.2, 0.48], [0.34, 0.44], [0.44, 0.3], [0.68, 0.3], [0.8, 0.44], [0.93, 0.5], [0.94, 0.7], [0.86, 0.8], [0.16, 0.8]],
  wheels: [{ x: 0.24, y: 0.8, r: 0.07 }, { x: 0.8, y: 0.79, r: 0.065 }],
};

const mirror = (s: Shape): Shape => ({
  body: s.body.map(([x, y]) => [1 - x, y] as Pt).reverse(),
  wheels: s.wheels.map((w) => ({ ...w, x: 1 - w.x })),
});

export interface ViewDef {
  key: ViewKey;
  label: string;
  hint: string;
  shape: Shape;
  /** Position sur le schéma vu de dessus (en % de la largeur / hauteur). */
  pos: { x: number; y: number };
}

export const VIEWS: ViewDef[] = [
  { key: 'avant', label: 'Avant', hint: 'Face à la calandre, à 2-3 m.', shape: FACE, pos: { x: 50, y: 6 } },
  { key: 'avant_droit', label: 'Avant droit', hint: 'Coin avant droit, en diagonale.', shape: mirror(THREE_QUARTER), pos: { x: 88, y: 16 } },
  { key: 'droite', label: 'Côté droit', hint: 'Bien de profil, toute la voiture dans le cadre.', shape: mirror(SIDE), pos: { x: 92, y: 50 } },
  { key: 'arriere_droit', label: 'Arrière droit', hint: 'Coin arrière droit, en diagonale.', shape: THREE_QUARTER, pos: { x: 88, y: 84 } },
  { key: 'arriere', label: 'Arrière', hint: 'Face au coffre, à 2-3 m.', shape: FACE, pos: { x: 50, y: 94 } },
  { key: 'arriere_gauche', label: 'Arrière gauche', hint: 'Coin arrière gauche, en diagonale.', shape: mirror(THREE_QUARTER), pos: { x: 12, y: 84 } },
  { key: 'gauche', label: 'Côté gauche', hint: 'Bien de profil, toute la voiture dans le cadre.', shape: SIDE, pos: { x: 8, y: 50 } },
  { key: 'avant_gauche', label: 'Avant gauche', hint: 'Coin avant gauche, en diagonale.', shape: THREE_QUARTER, pos: { x: 12, y: 16 } },
];

export const VIEW_BY_KEY = Object.fromEntries(VIEWS.map((v) => [v.key, v])) as Record<ViewKey, ViewDef>;

/** Format des photos d'état des lieux : 4:3 horizontal. */
export const SHOT_ASPECT = 4 / 3;
/** Taille de travail de l'analyse locale. */
export const WORK_W = 320;
export const WORK_H = 240;
