import { describe, expect, it } from 'vitest';
import { coverage, detectChanges, gray, markKnown, polygonMask, shiftGray, type Gray } from './detect';

const W = 320;
const H = 240;

/** « Carrosserie » synthétique : dégradé, panneaux, poignée, reflets. */
function car(): Gray {
  const g = gray(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 70 + 0.25 * y; // fond
      if (x > 30 && x < 290 && y > 60 && y < 190) {
        v = 150 + 30 * Math.sin(x / 40) + 0.2 * y; // tôle avec reflet doux
        if (Math.abs(x - 160) < 2) v -= 50; // jointure de portières
        if (y > 118 && y < 124 && x > 190 && x < 220) v -= 60; // poignée
        if (Math.abs(y - 100) < 1.5) v -= 25; // ligne de caisse
      }
      g.d[y * W + x] = v;
    }
  }
  return g;
}

function addScratch(g: Gray, x0: number, y0: number, x1: number, y1: number, delta = -55) {
  const out = { ...g, d: Float32Array.from(g.d) };
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    out.d[y * W + x] += delta;
  }
  return out;
}

const relight = (g: Gray, k: number, b: number): Gray => ({ ...g, d: Float32Array.from(g.d, (v) => v * k + b) });

describe('Détection locale des nouvelles rayures', () => {
  const ref = car();

  it('trouve une rayure de 40 px, malgré un autre éclairage et un léger décalage', () => {
    const ret = shiftGray(relight(addScratch(ref, 60, 140, 100, 150), 1.12, 9), -3, 2);
    const r = detectChanges(ref, ret);
    expect(r.misaligned).toBe(false);
    expect(r.boxes.length).toBe(1);
    const b = r.boxes[0];
    // La rayure est entre x 60..100 et y 140..150 (en coordonnées du départ)
    expect(coverage({ x: 60 / W, y: 140 / H, w: 40 / W, h: 10 / H }, b)).toBeGreaterThan(0.6);
    expect(b.w * W).toBeLessThan(60);
    expect(Math.abs(r.shift.dx)).toBe(3);
    expect(Math.abs(r.shift.dy)).toBe(2);
  });

  it('aucune fausse alerte pour un simple changement de lumière et de cadrage', () => {
    const r = detectChanges(ref, shiftGray(relight(ref, 0.85, -12), 4, -3));
    expect(r.boxes).toEqual([]);
    expect(r.alignment).toBeGreaterThan(0.8);
  });

  it('plusieurs dégâts distincts → plusieurs zones', () => {
    let ret = addScratch(ref, 50, 80, 80, 85);
    ret = addScratch(ret, 230, 160, 270, 170);
    // « bosse » : zone assombrie
    for (let y = 150; y < 165; y++) for (let x = 120; x < 140; x++) ret.d[y * W + x] -= 35;
    expect(detectChanges(ref, ret).boxes.length).toBe(3);
  });

  it('le masque de silhouette ignore ce qui change dans le décor', () => {
    const ret = { ...ref, d: Float32Array.from(ref.d) };
    for (let y = 5; y < 50; y++) for (let x = 5; x < 120; x++) ret.d[y * W + x] = 230; // une personne passe derrière
    const mask = polygonMask(W, H, [[0.1, 0.25], [0.9, 0.25], [0.9, 0.79], [0.1, 0.79]], 0);
    expect(detectChanges(ref, ret).boxes.length).toBeGreaterThan(0);
    expect(detectChanges(ref, ret, mask).boxes).toEqual([]);
  });

  it('photo sans rapport (autre voiture, mauvais angle) → signalée « mal cadrée »', () => {
    const other = gray(W, H);
    for (let i = 0; i < other.d.length; i++) other.d[i] = (i * 7919) % 255;
    expect(detectChanges(ref, other).misaligned).toBe(true);
  });

  it('photos réelles bruitées (grain, JPEG) : pas de fausse alerte, la rayure reste trouvée', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
    const noisy = (g: Gray, amp: number): Gray => ({ ...g, d: Float32Array.from(g.d, (v) => v + amp * (rnd() + rnd() + rnd()) / 3) });
    const a = noisy(ref, 8);
    expect(detectChanges(a, noisy(shiftGray(ref, 2, 1), 8)).boxes).toEqual([]);
    const r = detectChanges(a, noisy(addScratch(ref, 60, 140, 100, 150), 8));
    expect(r.boxes.length).toBe(1);
    expect(coverage({ x: 60 / W, y: 140 / H, w: 40 / W, h: 10 / H }, r.boxes[0])).toBeGreaterThan(0.6);
  });

  it('décalage d’une fraction de pixel et contours très contrastés : pas de fausse alerte', () => {
    // voiture blanche très contrastée, décalée de 2,4 × 1,6 px (comme une vraie seconde photo)
    const hi = { ...ref, d: Float32Array.from(ref.d, (v, i) => (i % W > 30 && i % W < 290 && Math.floor(i / W) > 60 && Math.floor(i / W) < 190 ? Math.min(255, v + 70) : v)) };
    const sub = (g: Gray, dx: number, dy: number): Gray => {
      const out = gray(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = Math.min(W - 2, Math.max(0, x + dx)), sy = Math.min(H - 2, Math.max(0, y + dy));
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
        out.d[y * W + x] = (1 - fy) * ((1 - fx) * g.d[y0 * W + x0] + fx * g.d[y0 * W + x0 + 1]) + fy * ((1 - fx) * g.d[(y0 + 1) * W + x0] + fx * g.d[(y0 + 1) * W + x0 + 1]);
      }
      return out;
    };
    expect(detectChanges(hi, sub(hi, -2.4, -1.6)).boxes).toEqual([]);
    const r = detectChanges(hi, sub(addScratch(hi, 60, 140, 100, 150), -2.4, -1.6));
    expect(r.boxes.length).toBe(1);
    expect(coverage({ x: 60 / W, y: 140 / H, w: 40 / W, h: 10 / H }, r.boxes[0])).toBeGreaterThan(0.5);
  });

  it('sensibilité réglable', () => {
    const faint = addScratch(ref, 60, 140, 100, 150, -22);
    expect(detectChanges(ref, faint, undefined, { sensitivity: 0.6 }).boxes.length).toBe(0);
    expect(detectChanges(ref, faint, undefined, { sensitivity: 1.6 }).boxes.length).toBeGreaterThan(0);
  });
});

describe('Dégâts déjà connus (relevés au départ)', () => {
  it('une zone qui recouvre un ancien dégât est marquée « connue »', () => {
    const known = [{ x: 0.2, y: 0.5, w: 0.15, h: 0.1 }];
    const r = markKnown(
      [
        { x: 0.22, y: 0.52, w: 0.1, h: 0.05, score: 40, area: 50 },
        { x: 0.7, y: 0.3, w: 0.05, h: 0.05, score: 40, area: 50 },
      ],
      known,
    );
    expect(r.map((b) => b.known)).toEqual([true, false]);
  });
});
