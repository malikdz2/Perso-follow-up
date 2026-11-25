// Photos d'état des lieux côté navigateur : capture caméra, recadrage 4:3, réduction pour l'analyse.
import { rgbaToGray, type Box, type Gray } from './detect';
import { SHOT_ASPECT, WORK_H, WORK_W } from './views';

export const SHOT_MAX_W = 1600;

type Source = CanvasImageSource & { width?: number; height?: number; videoWidth?: number; videoHeight?: number };

function srcSize(src: Source): { w: number; h: number } {
  const w = (src.videoWidth || src.width) as number;
  const h = (src.videoHeight || src.height) as number;
  return { w, h };
}

/** Rectangle source centré au format 4:3 (recadrage « cover »). */
export function coverRect(sw: number, sh: number, aspect = SHOT_ASPECT) {
  if (sw / sh > aspect) {
    const w = sh * aspect;
    return { sx: (sw - w) / 2, sy: 0, sw: w, sh };
  }
  const h = sw / aspect;
  return { sx: 0, sy: (sh - h) / 2, sw, sh: h };
}

/**
 * Recadre (4:3 centré) et redimensionne. Les fortes réductions se font de moitié en moitié : en une seule
 * étape, les traits fins (jointures, lignes de caisse) apparaissent ou disparaissent selon leur position
 * exacte, ce qui créerait de fausses différences entre deux photos.
 */
function draw(src: Source, outW: number, outH: number): HTMLCanvasElement {
  const { w, h } = srcSize(src);
  const r = coverRect(w, h, outW / outH);
  let cur: CanvasImageSource = src;
  let cx = r.sx;
  let cy = r.sy;
  let cw = r.sw;
  let ch = r.sh;
  while (cw > outW * 2) {
    const nw = Math.round(cw / 2);
    const nh = Math.round(ch / 2);
    const step = document.createElement('canvas');
    step.width = nw;
    step.height = nh;
    const sctx = step.getContext('2d')!;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
    cur = step;
    cx = 0;
    cy = 0;
    cw = nw;
    ch = nh;
  }
  const c = document.createElement('canvas');
  c.width = outW;
  c.height = outH;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, outW, outH);
  return c;
}

const toBlob = (c: HTMLCanvasElement, q = 0.88) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image illisible'))), 'image/jpeg', q));

/** Photo 4:3 (max 1600 px) à partir d'une image vidéo, d'une photo de la galerie… */
export async function makeShot(src: Source): Promise<{ blob: Blob; width: number; height: number }> {
  const { w, h } = srcSize(src);
  const r = coverRect(w, h);
  const width = Math.min(SHOT_MAX_W, Math.round(r.sw));
  const height = Math.round(width / SHOT_ASPECT);
  return { blob: await toBlob(draw(src, width, height)), width, height };
}

export async function shotFromFile(file: Blob) {
  const bmp = await createImageBitmap(file);
  try {
    return { ...(await makeShot(bmp)), portrait: bmp.height > bmp.width };
  } finally {
    bmp.close();
  }
}

/** Niveaux de gris à la taille de travail (320 × 240) pour la comparaison locale. */
export function grayFrom(src: Source, w = WORK_W, h = WORK_H): Gray {
  const c = draw(src, w, h);
  return rgbaToGray(c.getContext('2d')!.getImageData(0, 0, w, h).data, w, h);
}

export async function grayFromBlob(blob: Blob, w = WORK_W, h = WORK_H): Promise<Gray> {
  const bmp = await createImageBitmap(blob);
  try {
    return grayFrom(bmp, w, h);
  } finally {
    bmp.close();
  }
}

/** JPEG base64 (côté long ≤ 1568 px, taille conseillée pour l'analyse d'image par Claude). */
export async function blobToBase64Jpeg(blob: Blob, maxSide = 1568): Promise<string> {
  const bmp = await createImageBitmap(blob);
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = draw(bmp, Math.round(bmp.width * k), Math.round(bmp.height * k));
    const url = c.toDataURL('image/jpeg', 0.88);
    return url.slice(url.indexOf(',') + 1);
  } finally {
    bmp.close();
  }
}

/** Extrait d'une photo autour d'une zone (marge comprise), avec la zone encadrée en rouge. */
export async function cropWithBox(blob: Blob, box: Box, margin = 0.6, outW = 600): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const W = bmp.width;
    const H = bmp.height;
    // Zone élargie, au format 4:3, bornée à l'image.
    let cw = Math.max(box.w * (1 + 2 * margin), 0.18) * W;
    let ch = Math.max(box.h * (1 + 2 * margin), 0.18) * H;
    if (cw / ch > SHOT_ASPECT) ch = cw / SHOT_ASPECT;
    else cw = ch * SHOT_ASPECT;
    cw = Math.min(cw, W);
    ch = Math.min(ch, H);
    const cx = Math.min(W - cw, Math.max(0, (box.x + box.w / 2) * W - cw / 2));
    const cy = Math.min(H - ch, Math.max(0, (box.y + box.h / 2) * H - ch / 2));
    const outH = Math.round((outW * ch) / cw);
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, cx, cy, cw, ch, 0, 0, outW, outH);
    const k = outW / cw;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = Math.max(3, outW / 150);
    ctx.strokeRect((box.x * W - cx) * k, (box.y * H - cy) * k, box.w * W * k, box.h * H * k);
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), w: outW, h: outH };
  } finally {
    bmp.close();
  }
}

/** Photo entière réduite, zones encadrées (rouge = nouveau dégât, orange = à vérifier). */
export async function photoWithBoxes(blob: Blob, boxes: (Box & { color: string })[], outW = 800): Promise<{ dataUrl: string; w: number; h: number }> {
  const bmp = await createImageBitmap(blob);
  try {
    const outH = Math.round((outW * bmp.height) / bmp.width);
    const c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, outW, outH);
    ctx.lineWidth = Math.max(3, outW / 200);
    for (const b of boxes) {
      ctx.strokeStyle = b.color;
      ctx.strokeRect(b.x * outW, b.y * outH, b.w * outW, b.h * outH);
    }
    return { dataUrl: c.toDataURL('image/jpeg', 0.85), w: outW, h: outH };
  } finally {
    bmp.close();
  }
}
