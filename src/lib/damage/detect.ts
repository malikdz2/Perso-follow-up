// Détection LOCALE des changements de carrosserie entre la photo de départ et celle du retour.
// Fonctions PURES (aucune dépendance au navigateur), couvertes par les tests.
//
// Principe : les deux photos, prises sous le même angle, sont réduites en niveaux de gris, la luminosité
// du retour est ramenée à celle du départ, un petit décalage de cadrage est compensé, puis on cherche
// les zones où apparaissent de NOUVEAUX contours (rayures, éclats) ou un changement d'intensité (bosses,
// salissures). Les zones retenues restent « à vérifier » : l'utilisateur confirme.

export interface Gray {
  w: number;
  h: number;
  d: Float32Array; // 0..255
}

export interface Box {
  /** Coordonnées normalisées 0..1 (par rapport à l'image). */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedBox extends Box {
  /** Intensité moyenne du changement (≈ 0..255). */
  score: number;
  /** Surface en pixels de travail. */
  area: number;
}

export interface DetectResult {
  boxes: DetectedBox[];
  /** Part de la zone analysée qui a changé (0..1). */
  changedRatio: number;
  /** Décalage compensé (pixels de travail). */
  shift: { dx: number; dy: number };
  /** Qualité du cadrage 0..1 (1 = superposition parfaite). */
  alignment: number;
  /** Trop de changements : photo mal cadrée, autre éclairage ou autre fond. */
  misaligned: boolean;
  debug?: { score: Float32Array; threshold: number; zones: number };
}

export interface DetectOptions {
  /** Décalage maximal recherché, en pixels de travail (défaut 10). */
  maxShift?: number;
  /** Sensibilité : 1 = normal, 1,5 = plus de détections, 0,7 = moins (défaut 1). */
  sensitivity?: number;
  /** Surface minimale d'une zone, en part de l'image (défaut 0,00015). */
  minAreaRatio?: number;
  /** Renvoie aussi la carte des écarts (réglage, diagnostic). */
  debug?: boolean;
}

// ───────────── Opérations d'image ─────────────

export function gray(w: number, h: number, fill = 0): Gray {
  return { w, h, d: new Float32Array(w * h).fill(fill) };
}

/** RGBA (ImageData) → niveaux de gris (luma BT.601). */
export function rgbaToGray(rgba: ArrayLike<number>, w: number, h: number): Gray {
  const g = gray(w, h);
  for (let i = 0, p = 0; i < g.d.length; i++, p += 4) g.d[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/** Flou moyen séparable de rayon r. */
export function blur(g: Gray, r = 1): Gray {
  if (r <= 0) return g;
  const { w, h } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += g.d[y * w + Math.min(w - 1, Math.max(0, x + k))];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      out[y * w + x] = s / n;
    }
  }
  return { w, h, d: out };
}

/** Filtre maximum séparable (dilatation) de rayon r. */
export function dilate(g: Gray, r = 1): Gray {
  if (r <= 0) return g;
  const { w, h } = g;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let k = -r; k <= r; k++) m = Math.max(m, g.d[y * w + Math.min(w - 1, Math.max(0, x + k))]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = -Infinity;
      for (let k = -r; k <= r; k++) m = Math.max(m, tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x]);
      out[y * w + x] = m;
    }
  }
  return { w, h, d: out };
}

/** Norme du gradient (Sobel). */
export function sobel(g: Gray): Gray {
  const { w, h, d } = g;
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      out[y * w + x] = Math.hypot(gx, gy) / 4;
    }
  }
  return { w, h, d: out };
}

/** Réduction par moyenne d'un facteur entier f. */
export function downsample(g: Gray, f: number): Gray {
  const w = Math.max(1, Math.floor(g.w / f));
  const h = Math.max(1, Math.floor(g.h / f));
  const out = gray(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += g.d[(y * f + j) * g.w + x * f + i];
      out.d[y * w + x] = s / (f * f);
    }
  }
  return out;
}

/** Décale l'image de (dx, dy) : out(x, y) = g(x + dx, y + dy), bords prolongés. */
export function shiftGray(g: Gray, dx: number, dy: number): Gray {
  const { w, h } = g;
  const out = gray(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    for (let x = 0; x < w; x++) out.d[y * w + x] = g.d[sy * w + Math.min(w - 1, Math.max(0, x + dx))];
  }
  return out;
}

/** Décalage sous-pixel (interpolation bilinéaire) : out(x, y) = g(x + dx, y + dy). */
export function shiftGrayF(g: Gray, dx: number, dy: number): Gray {
  if (Number.isInteger(dx) && Number.isInteger(dy)) return shiftGray(g, dx, dy);
  const { w, h } = g;
  const out = gray(w, h);
  const at = (x: number, y: number) => g.d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    const sy = y + dy;
    const y0 = Math.floor(sy);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = x + dx;
      const x0 = Math.floor(sx);
      const fx = sx - x0;
      out.d[y * w + x] = (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0)) + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1));
    }
  }
  return out;
}

/** Masque binaire (1 = analysé) d'un polygone en coordonnées normalisées, élargi de `grow` (part de la largeur). */
export function polygonMask(w: number, h: number, poly: [number, number][], grow = 0.03): Uint8Array {
  const m = gray(w, h);
  const pts = poly.map(([x, y]) => [x * w, y * h]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) m.d[y * w + x] = 1;
    }
  }
  const grown = dilate(m, Math.round(grow * w));
  return Uint8Array.from(grown.d, (v) => (v > 0 ? 1 : 0));
}

function maskedStats(d: Float32Array, mask?: Uint8Array): { mean: number; std: number; n: number } {
  let s = 0;
  let s2 = 0;
  let n = 0;
  for (let i = 0; i < d.length; i++) {
    if (mask && !mask[i]) continue;
    s += d[i];
    s2 += d[i] * d[i];
    n++;
  }
  const mean = n ? s / n : 0;
  return { mean, std: n ? Math.sqrt(Math.max(0, s2 / n - mean * mean)) : 0, n };
}

/** Ramène moyenne et contraste de `img` à ceux de `ref` (corrige un éclairage différent). */
export function matchLighting(ref: Gray, img: Gray, mask?: Uint8Array): Gray {
  const a = maskedStats(ref.d, mask);
  const b = maskedStats(img.d, mask);
  const k = b.std > 1e-3 ? a.std / b.std : 1;
  return { w: img.w, h: img.h, d: Float32Array.from(img.d, (v) => (v - b.mean) * k + a.mean) };
}

/** Meilleur décalage (dx, dy) qui superpose `img` sur `ref` (recherche grossière puis fine). */
export function bestShift(ref: Gray, img: Gray, maxShift: number, mask?: Uint8Array): { dx: number; dy: number; err: number } {
  const sad = (a: Gray, b: Gray, dx: number, dy: number, m?: Uint8Array, step = 1) => {
    let s = 0;
    let n = 0;
    for (let y = 0; y < a.h; y += step) {
      const sy = y + dy;
      if (sy < 0 || sy >= a.h) continue;
      for (let x = 0; x < a.w; x += step) {
        const sx = x + dx;
        if (sx < 0 || sx >= a.w) continue;
        if (m && !m[y * a.w + x]) continue;
        s += Math.abs(a.d[y * a.w + x] - b.d[sy * a.w + sx]);
        n++;
      }
    }
    return n ? s / n : Infinity;
  };
  // Recherche grossière sur des images réduites par 4, puis affinage ±4 px à pleine résolution.
  const f = 4;
  const ra = downsample(ref, f);
  const ia = downsample(img, f);
  const ma = mask ? Uint8Array.from(downsample({ w: ref.w, h: ref.h, d: Float32Array.from(mask) }, f).d, (v) => (v > 0.5 ? 1 : 0)) : undefined;
  const R = Math.ceil(maxShift / f);
  let best = { dx: 0, dy: 0, err: Infinity };
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const e = sad(ra, ia, dx, dy, ma);
    if (e < best.err) best = { dx, dy, err: e };
  }
  const cx = best.dx * f;
  const cy = best.dy * f;
  best = { dx: 0, dy: 0, err: Infinity };
  for (let dy = cy - f; dy <= cy + f; dy++) for (let dx = cx - f; dx <= cx + f; dx++) {
    if (Math.abs(dx) > maxShift || Math.abs(dy) > maxShift) continue;
    const e = sad(ref, img, dx, dy, mask, 2);
    if (e < best.err) best = { dx, dy, err: e };
  }
  // Affinage au quart de pixel (interpolation) : sinon les contours marqués ressortent tous.
  const sadF = (dx: number, dy: number) => {
    const s2 = shiftGrayF(img, dx, dy);
    let s = 0;
    let n = 0;
    for (let y = 2; y < ref.h - 2; y += 2) {
      for (let x = 2; x < ref.w - 2; x += 2) {
        const i = y * ref.w + x;
        if (mask && !mask[i]) continue;
        s += Math.abs(ref.d[i] - s2.d[i]);
        n++;
      }
    }
    return n ? s / n : Infinity;
  };
  const ix = best.dx;
  const iy = best.dy;
  for (let fy = -0.75; fy <= 0.75; fy += 0.25) for (let fx = -0.75; fx <= 0.75; fx += 0.25) {
    if (!fx && !fy) continue;
    const e = sadF(ix + fx, iy + fy);
    if (e < best.err) best = { dx: ix + fx, dy: iy + fy, err: e };
  }
  return best;
}

// ───────────── Zones ─────────────

interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  sum: number;
}

function components(bin: Uint8Array, score: Float32Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(w * h);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let i = 0; i < bin.length; i++) {
    if (!bin[i] || seen[i]) continue;
    const c: Component = { x0: w, y0: h, x1: 0, y1: 0, area: 0, sum: 0 };
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      c.area++;
      c.sum += score[p];
      c.x0 = Math.min(c.x0, x);
      c.x1 = Math.max(c.x1, x);
      c.y0 = Math.min(c.y0, y);
      c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (bin[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    out.push(c);
  }
  return out;
}

/** Fusionne les zones qui se touchent presque (écart ≤ gap pixels). */
function mergeClose(cs: Component[], gap: number): Component[] {
  const list = [...cs];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
          list[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), area: a.area + b.area, sum: a.sum + b.sum };
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return list;
}

// ───────────── Détection ─────────────

/**
 * Compare la photo du retour (`img`) à celle du départ (`ref`), de même taille.
 * `mask` (1 = analysé) limite l'analyse à la carrosserie (silhouette du guide de prise de vue).
 */
export function detectChanges(ref: Gray, img: Gray, mask?: Uint8Array, opts: DetectOptions = {}): DetectResult {
  if (ref.w !== img.w || ref.h !== img.h) throw new Error('Les deux images doivent avoir la même taille.');
  const { w, h } = ref;
  const maxShift = opts.maxShift ?? 10;
  const sensitivity = opts.sensitivity ?? 1;
  const minArea = Math.max(6, (opts.minAreaRatio ?? 0.00015) * w * h);

  // Alignement et éclairage estimés sur des images lissées (robustes au bruit)…
  const Ab = blur(ref, 1);
  const shift = bestShift(Ab, matchLighting(Ab, blur(img, 1), mask), maxShift, mask);
  // … puis appliqués aux images NON lissées, pour garder les rayures fines d'un pixel.
  const A = ref;
  const B = shiftGrayF(matchLighting(ref, img, mask), shift.dx, shift.dy);

  // Écart d'intensité tolérant : chaque pixel est comparé au plus proche de ses voisins dans l'autre
  // image, pour qu'un contour existant décalé d'un pixel ne déclenche rien.
  const nearest = (P: Gray, Q: Gray, i: number, x: number, y: number) => {
    let m = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = Math.min(h - 1, Math.max(0, y + dy));
      for (let dx = -1; dx <= 1; dx++) m = Math.min(m, Math.abs(P.d[i] - Q.d[yy * w + Math.min(w - 1, Math.max(0, x + dx))]));
    }
    return m;
  };
  // Contours : nouveaux (présents au retour, absents au départ) et disparus.
  const eA = sobel(A);
  const eB = sobel(B);
  const eAd = dilate(eA, 1);
  const eBd = dilate(eB, 1);
  const score = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Sur un contour déjà présent au départ, un petit écart vient du cadrage : on le minore.
      const intensity = Math.max(0, Math.max(nearest(B, A, i, x, y), nearest(A, B, i, x, y)) - 0.6 * eAd.d[i]);
      const newEdge = Math.max(0, eB.d[i] - eAd.d[i]);
      const lostEdge = Math.max(0, eA.d[i] - eBd.d[i]);
      score[i] = Math.max(intensity, 0.9 * newEdge, 0.6 * lostEdge);
    }
  }

  // Seuil adaptatif : au-dessus du bruit habituel de cette paire de photos (plancher fixe).
  const base = 22 / sensitivity;
  const st = maskedStats(score, mask);
  const thr = Math.max(base, st.mean + (3.5 / sensitivity) * st.std);
  const bin = new Uint8Array(w * h);
  let overBase = 0;
  for (let i = 0; i < bin.length; i++) {
    if (mask && !mask[i]) continue;
    if (score[i] > base) overBase++;
    if (score[i] > thr) bin[i] = 1;
  }
  const smooth = { d: score };
  const grown = dilate({ w, h, d: Float32Array.from(bin) }, 1);
  const binG = Uint8Array.from(grown.d, (v) => (v > 0 ? 1 : 0));
  const merged = mergeClose(components(binG, smooth.d, w, h), Math.round(w * 0.012)).filter((c) => c.area >= minArea);
  // Une « zone » qui couvre plus du quart de la surface analysée n'est pas un dégât mais un problème
  // de cadrage, de lumière ou de reflets : on ne la signale pas comme dégât.
  const analysed = st.n || w * h;
  const giant = merged.filter((c) => (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1) > 0.25 * analysed);
  const comps = merged.filter((c) => !giant.includes(c));

  // Part de la carrosserie au-dessus du plancher : trop élevée = photos qui ne se superposent pas.
  const changedRatio = st.n ? overBase / st.n : 0;
  const boxes = comps
    .map((c) => ({
      x: c.x0 / w,
      y: c.y0 / h,
      w: (c.x1 - c.x0 + 1) / w,
      h: (c.y1 - c.y0 + 1) / h,
      score: Math.round((c.sum / c.area) * 10) / 10,
      area: c.area,
    }))
    .sort((a, b) => b.score * b.area - a.score * a.area);

  return {
    boxes,
    changedRatio,
    shift: { dx: shift.dx, dy: shift.dy },
    alignment: Math.max(0, Math.min(1, 1 - shift.err / 40)),
    misaligned: changedRatio > 0.18 || giant.length > 0,
    debug: opts.debug ? { score, threshold: thr, zones: merged.length } : undefined,
  };
}

/** Part de la boîte `a` couverte par `b`. */
export function coverage(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const area = a.w * a.h;
  return area > 0 ? (ix * iy) / area : 0;
}

/** Repère les zones qui correspondent à un dégât déjà connu (relevé au départ). */
export function markKnown<T extends Box>(boxes: T[], known: Box[], threshold = 0.3): (T & { known: boolean })[] {
  return boxes.map((b) => ({ ...b, known: known.some((k) => coverage(b, k) >= threshold || coverage(k, b) >= threshold) }));
}
