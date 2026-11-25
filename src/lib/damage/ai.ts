// Analyse IA facultative des photos d'état des lieux avec Claude (API Anthropic).
// Les photos ne quittent le téléphone QUE lorsque l'utilisateur touche « Analyse IA ».
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { db, type Damage, type Inspection } from '../../db/db';
import { coverage, type Box } from './detect';
import { blobToBase64Jpeg } from './imaging';
import { knownDamages, shotOf } from './inspections';
import { VIEW_BY_KEY, type ViewKey } from './views';

export const AI_MODEL = 'claude-opus-5-5';

const DamageZ = z.object({
  x: z.number().describe('Bord gauche de la zone, 0 à 1, par rapport à la largeur de la photo analysée'),
  y: z.number().describe('Bord haut, 0 à 1'),
  w: z.number().describe('Largeur, 0 à 1'),
  h: z.number().describe('Hauteur, 0 à 1'),
  type: z.enum(['rayure', 'bosse', 'eclat', 'fissure', 'choc', 'autre']),
  severity: z.enum(['leger', 'moyen', 'important']),
  description: z.string().describe('Description courte en français, avec la pièce concernée (ex. « rayure de 10 cm sur la portière arrière »)'),
  confidence: z.number().describe('Confiance 0 à 1'),
});
const CandidateZ = z.object({
  id: z.number(),
  verdict: z.enum(['nouveau_degat', 'deja_present', 'reflet_ou_salete', 'incertain']),
  explanation: z.string().describe('Une phrase en français'),
});
const ResultZ = z.object({
  photo_quality: z.enum(['bonne', 'moyenne', 'insuffisante']),
  remarks: z.string().describe('Remarque générale en français (cadrage, lumière, propreté), vide si rien à signaler'),
  damages: z.array(DamageZ),
  candidates: z.array(CandidateZ),
});
export type AiResult = z.infer<typeof ResultZ>;

const SYSTEM = `Tu es un expert en état des lieux de véhicules de location. Tu examines des photos de la carrosserie extérieure \
d'une voiture et tu repères les dégâts visibles : rayures, bosses, éclats de peinture, fissures, chocs sur pare-chocs, rétroviseurs, \
jantes ou optiques. Tu distingues un vrai dégât d'un reflet, d'une ombre, de saleté, de gouttes d'eau ou d'un élément du décor. \
Tu ne signales que ce que la photo permet réellement de voir ; en cas de doute, tu le dis (verdict « incertain », confiance basse). \
Coordonnées : nombres de 0 à 1, origine en haut à gauche de la photo indiquée. Réponds en français.`;

const fmtBox = (b: Box) => `x=${b.x.toFixed(3)}, y=${b.y.toFixed(3)}, w=${b.w.toFixed(3)}, h=${b.h.toFixed(3)}`;

export function makeClient(apiKey: string) {
  // Clé de l'utilisateur, stockée sur son téléphone : l'appel part directement du navigateur.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

/** Vérifie la clé sans consommer de jetons. */
export async function testApiKey(apiKey: string): Promise<string> {
  const m = await makeClient(apiKey).models.retrieve(AI_MODEL);
  return m.display_name;
}

/**
 * Analyse une vue. Départ : relève les dégâts existants. Retour : compare avec la photo de départ,
 * donne un avis sur chaque zone détectée localement et ajoute les nouveaux dégâts manqués.
 */
export async function analyzeViewWithAI(apiKey: string, inspection: Inspection, view: ViewKey): Promise<{ result: AiResult; added: number; reviewed: number }> {
  const cur = await shotOf(inspection.id!, view);
  if (!cur) throw new Error('Prenez d’abord la photo de cette vue.');
  const viewLabel = VIEW_BY_KEY[view].label.toLowerCase();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let candidates: Damage[] = [];

  if (inspection.kind === 'retour' && inspection.departureId) {
    const dep = await shotOf(inspection.departureId, view);
    if (!dep) throw new Error('La photo de départ de cette vue manque.');
    const known = await knownDamages(inspection.departureId, view);
    candidates = (await db.damages.where('[inspectionId+view]').equals([inspection.id!, view]).toArray()).filter((d) => d.source === 'auto');
    content.push(
      { type: 'text', text: `PHOTO 1 — DÉPART (vue ${viewLabel}) :` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64Jpeg(dep.blob) } },
      { type: 'text', text: `PHOTO 2 — RETOUR (même vue, prise plus tard) :` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64Jpeg(cur.blob) } },
      {
        type: 'text',
        text: [
          `Compare la PHOTO 2 à la PHOTO 1 et liste dans « damages » uniquement les dégâts NOUVEAUX : visibles sur la photo 2 et absents de la photo 1. Coordonnées par rapport à la PHOTO 2.`,
          known.length
            ? `Dégâts déjà relevés au départ (sur la photo 1, à ne pas signaler comme nouveaux) :\n${known.map((k) => `- ${k.description ?? k.kind ?? 'dégât'} : ${fmtBox(k)}`).join('\n')}`
            : 'Aucun dégât n’avait été relevé au départ.',
          candidates.length
            ? `Une comparaison automatique a repéré ces zones sur la PHOTO 2. Pour CHACUNE, donne un verdict dans « candidates » :\n${candidates.map((c) => `- id ${c.id} : ${fmtBox(c)}`).join('\n')}`
            : 'La comparaison automatique n’a repéré aucune zone : « candidates » doit être une liste vide.',
          'N’ajoute pas dans « damages » un dégât qui correspond à une zone candidate : son verdict suffit.',
        ].join('\n\n'),
      },
    );
  } else {
    content.push(
      { type: 'text', text: `Photo d’état des lieux de DÉPART (vue ${viewLabel}) :` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64Jpeg(cur.blob) } },
      { type: 'text', text: 'Liste dans « damages » tous les dégâts déjà présents sur la carrosserie (ils seront notés comme existants avant la location). « candidates » doit être une liste vide.' },
    );
  }

  const client = makeClient(apiKey);
  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    // Si le modèle refuse la requête, l'API la relance sur un modèle de repli adapté.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(ResultZ) },
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  });
  if (response.stop_reason === 'refusal') throw new Error('L’analyse a été refusée par le service. Réessayez avec une autre photo.');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('Réponse incomplète de l’IA. Réessayez.');
  const result = response.parsed_output;

  // Application : avis sur les zones locales + nouveaux dégâts (toujours « à vérifier » : l'utilisateur tranche).
  const clamp = (b: Box): Box => {
    const x = Math.min(1, Math.max(0, b.x));
    const y = Math.min(1, Math.max(0, b.y));
    return { x, y, w: Math.max(0.01, Math.min(1 - x, b.w)), h: Math.max(0.01, Math.min(1 - y, b.h)) };
  };
  const VERDICT: Record<AiResult['candidates'][number]['verdict'], string> = {
    nouveau_degat: 'Nouveau dégât probable',
    deja_present: 'Déjà présent au départ',
    reflet_ou_salete: 'Reflet, ombre ou saleté',
    incertain: 'Incertain',
  };
  let added = 0;
  await db.transaction('rw', db.damages, db.inspectionShots, async () => {
    for (const c of result.candidates) {
      if (candidates.some((d) => d.id === c.id)) await db.damages.update(c.id, { aiVerdict: `${VERDICT[c.verdict]} — ${c.explanation}` });
    }
    const now = Date.now();
    for (const d of result.damages) {
      const box = clamp(d);
      const match = candidates.find((c) => coverage(box, c) >= 0.3 || coverage(c, box) >= 0.3);
      const info = { kind: d.type, severity: d.severity, description: d.description };
      if (match) await db.damages.update(match.id!, info);
      else {
        await db.damages.add({ inspectionId: inspection.id!, view, ...box, source: 'ia', status: 'a_verifier', ...info, score: Math.round(d.confidence * 100), createdAt: now });
        added++;
      }
    }
    await db.inspectionShots.update(cur.id!, { ai: { at: now, quality: result.photo_quality, remarks: result.remarks, model: response.model } });
  });
  return { result, added, reviewed: result.candidates.length };
}

/** Message d'erreur lisible (clé invalide, pas de connexion, quota…). */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API invalide : vérifiez-la dans Réglages → Analyse IA.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Cette clé API n’a pas accès au modèle.';
  if (e instanceof Anthropic.RateLimitError) return 'Trop de demandes : patientez une minute puis réessayez.';
  if (e instanceof Anthropic.APIConnectionError) return 'Pas de connexion Internet : l’analyse IA a besoin du réseau (la comparaison locale, elle, fonctionne hors ligne).';
  if (e instanceof Anthropic.APIError) return `Erreur du service IA (${e.status ?? '?'}) : ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
