// Génère les données embarquées de la carte (src/data/*.ts) à partir du jeu de données « geoalgeria ».
// Usage : node scripts/build-map.mjs <dossier geoalgeria/package/data>
// Limites des wilayas : © OpenStreetMap contributors (ODbL 1.0) — via geoalgeria.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('Usage : node scripts/build-map.mjs <geoalgeria/package/data>');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const geo = read('geojson/wilaya-boundaries.geojson');
const { wilayas } = read('wilayas.json');
const communes = ['communes_w1_w23.json', 'communes_w24_w48.json', 'communes_w49_w69.json'].flatMap(read);
const communeByCode = new Map(communes.map((c) => [c.code_commune, c]));

// Projection équirectangulaire corrigée à la latitude moyenne de l'Algérie.
const [lonMin, latMin, lonMax, latMax] = geo.bbox ?? [-8.67, 18.96, 12.0, 37.1];
const kx = Math.cos((28 * Math.PI) / 180);
const WIDTH = 1000;
const scale = WIDTH / ((lonMax - lonMin) * kx);
const HEIGHT = Math.ceil((latMax - latMin) * scale);
const proj = ([lon, lat]) => [(lon - lonMin) * kx * scale, (latMax - lat) * scale];
const r1 = (n) => Math.round(n * 10) / 10;

function ringPath(ring) {
  let out = '';
  let [px, py] = [0, 0];
  ring.forEach((pt, i) => {
    const [x, y] = proj(pt).map(r1);
    if (i === 0) out += `M${x} ${y}`;
    else {
      const dx = r1(x - px);
      const dy = r1(y - py);
      if (dx === 0 && dy === 0) return;
      out += `l${dx} ${dy}`;
    }
    [px, py] = [x, y];
  });
  return out.replace(/ -/g, '-') + 'z';
}

const paths = {};
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  paths[f.properties.code] = polys.flatMap((p) => p.map(ringPath)).join('');
}

const list = wilayas
  .sort((a, b) => a.code - b.code)
  .map((w) => {
    const cap = communeByCode.get(w.capital_commune_code);
    if (!cap) throw new Error(`Chef-lieu introuvable pour ${w.code}`);
    const [x, y] = proj([cap.longitude, cap.latitude]).map(r1);
    return { code: w.code, name: w.name_fr, nameAr: w.name_ar, capital: cap.name_fr, x, y, created: w.created, mother: w.mother_wilaya_code ?? undefined };
  });
if (list.length !== 69 || Object.keys(paths).length !== 69) throw new Error('69 wilayas attendues');

const header = '// Fichier généré par scripts/build-map.mjs — ne pas modifier à la main.\n';
fs.writeFileSync(
  'src/data/wilayas.ts',
  `${header}// Liste officielle des 69 wilayas (loi 26-06 du 4 avril 2026, JO n° 25 ; décret présidentiel 26-206, JO n° 40).\n` +
    `// x, y : position du chef-lieu sur la carte.\n\n` +
    `export interface Wilaya {\n  code: number;\n  name: string;\n  nameAr: string;\n  capital: string;\n  x: number;\n  y: number;\n  created: number;\n  /** Wilaya d'origine (wilayas créées en 2019 et 2026) */\n  mother?: number;\n}\n\n` +
    `export const WILAYAS: Wilaya[] = ${JSON.stringify(list, null, 1).replace(/\n\s*/g, ' ').replace(/\}, \{/g, '},\n  {')};\n\n` +
    `export const WILAYA_BY_CODE = new Map(WILAYAS.map((w) => [w.code, w]));\n\n` +
    `/** « 16 — Alger » */\nexport const wilayaLabel = (code: number) => \`\${String(code).padStart(2, '0')} — \${WILAYA_BY_CODE.get(code)?.name ?? '?'}\`;\n`,
);
fs.writeFileSync(
  'src/data/algeria-map.ts',
  `${header}// Limites des wilayas : © OpenStreetMap contributors, ODbL 1.0 (via le jeu de données geoalgeria, simplifié).\n\n` +
    `export const MAP_WIDTH = ${WIDTH};\nexport const MAP_HEIGHT = ${HEIGHT};\n` +
    `/** Projection lon/lat → coordonnées de la carte. */\nexport const MAP_PROJ = { lonMin: ${lonMin}, latMax: ${latMax}, kx: ${kx}, scale: ${scale} };\n\n` +
    `export const WILAYA_PATHS: Record<number, string> = ${JSON.stringify(paths)};\n`,
);
console.log(`OK : ${list.length} wilayas, carte ${WIDTH}×${HEIGHT}, ${fs.statSync('src/data/algeria-map.ts').size} octets`);
