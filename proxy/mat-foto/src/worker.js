/**
 * Cloudflare Worker för AI-foto i träningsappen.
 *
 * Tar emot ett foto av mat (base64-JPEG) från appen, frågar Claude vad det är och ungefär
 * hur mycket, och svarar med en lista: namn, gram, kcal, protein, kolhydrater, fett.
 * API-nyckeln finns bara här (Cloudflare-hemlighet), aldrig i appen.
 *
 * Hemligheter/variabler i Cloudflare (Settings → Variables and Secrets):
 *   ANTHROPIC_API_KEY  (Secret)  – din nyckel från console.anthropic.com
 *   APP_CODE           (Secret)  – valfri lång kod; samma skrivs in i appen under Mer → Mat
 *   ALLOWED_ORIGIN     (Text, valfri) – standard https://hugohulden.github.io
 *
 * Källkod: proxy/mat-foto/src/worker.js. Byggd fil att klistra in: proxy/mat-foto.js (npm run build).
 */
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const MAX_IMAGE_BYTES = 4_000_000; // base64-sträng; appen skalar ner till ~1024 px först

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Kort svenskt namn, t.ex. "Kokt ris" eller "Kycklingfilé, stekt"' },
          grams: { type: 'number', description: 'Uppskattad vikt i gram av det som syns' },
          kcal: { type: 'number' },
          protein: { type: 'number', description: 'gram' },
          carbs: { type: 'number', description: 'gram kolhydrater' },
          fat: { type: 'number', description: 'gram' },
        },
        required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: 'En kort mening om osäkerhet eller antaganden, på svenska. Tom sträng om inget.' },
  },
  required: ['items', 'note'],
  additionalProperties: false,
};

const SYSTEM =
  'Du uppskattar mat på foton åt en person som loggar kalorier för att gå upp i vikt. ' +
  'Lista varje separat livsmedel eller komponent du ser (t.ex. ris, kyckling, sås, sallad) med uppskattad vikt i gram ' +
  'och näringsvärden för just den mängden. Använd tallrik, bestick och förpackningar som storleksreferens. ' +
  'Räkna med tillagningsfett och såser som syns. Skriv namnen på svenska. ' +
  'Om bilden inte visar mat: returnera en tom lista och förklara kort i note. ' +
  'Det är en snabb uppskattning – välj det mest sannolika i stället för att gardera.';

function cors(origin, allowed) {
  const ok = origin === allowed || origin?.startsWith('http://localhost');
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Code',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

/** Jämförelse som inte läcker längd/innehåll via tid. */
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN || 'https://hugohulden.github.io';
    const origin = request.headers.get('Origin');
    const h = cors(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (request.method !== 'POST') return json({ error: 'Använd POST.' }, 405, h);

    // Bara din app (rätt adress + appkod) får använda nyckeln.
    if (origin && origin !== allowed && !origin.startsWith('http://localhost')) return json({ error: 'Fel ursprung.' }, 403, h);
    if (!env.APP_CODE || !same(request.headers.get('X-App-Code') || '', env.APP_CODE)) return json({ error: 'Fel appkod.' }, 401, h);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY saknas i Workern.' }, 500, h);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Ogiltig förfrågan.' }, 400, h);
    }
    const image = typeof body?.image === 'string' ? body.image : '';
    if (!image || image.length > MAX_IMAGE_BYTES) return json({ error: 'Bilden saknas eller är för stor.' }, 400, h);
    const mediaType = body.mediaType === 'image/png' || body.mediaType === 'image/webp' ? body.mediaType : 'image/jpeg';
    const hint = typeof body.note === 'string' ? body.note.slice(0, 300) : '';

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    let msg;
    try {
      msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Snabb uppskattning räcker – låg ansträngning ger kortare svarstid.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        // Om säkerhetsfiltren avböjer körs samma förfrågan på Anthropics rekommenderade reservmodell.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: hint ? `Uppskatta maten på bilden. Tillägg från mig: ${hint}` : 'Uppskatta maten på bilden.' },
            ],
          },
        ],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'API-nyckeln i Workern är ogiltig.' }, 502, h);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'För många förfrågningar just nu – försök igen om en stund.' }, 429, h);
      if (e instanceof Anthropic.BadRequestError) return json({ error: `Claude avvisade förfrågan: ${e.message}` }, 502, h);
      if (e instanceof Anthropic.APIError) return json({ error: `Claude svarade ${e.status ?? 'fel'}.` }, 502, h);
      return json({ error: 'Kunde inte nå Claude.' }, 502, h);
    }

    if (msg.stop_reason === 'refusal') return json({ error: 'Claude kunde inte bedöma bilden. Logga med sök eller snabbkalorier i stället.' }, 422, h);
    if (msg.stop_reason === 'max_tokens') return json({ error: 'Svaret blev för långt. Försök med en bild på färre saker.' }, 502, h);

    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      return json({ error: 'Kunde inte tolka svaret från Claude.' }, 502, h);
    }
    const r = (v) => Math.max(0, Math.round(Number(v) * 10) / 10 || 0);
    const items = (Array.isArray(out.items) ? out.items : [])
      .filter((i) => i && typeof i.name === 'string')
      .slice(0, 20)
      .map((i) => ({ name: i.name.slice(0, 80), grams: Math.round(r(i.grams)), kcal: Math.round(r(i.kcal)), protein: r(i.protein), carbs: r(i.carbs), fat: r(i.fat) }));
    return json({ items, note: typeof out.note === 'string' ? out.note.slice(0, 300) : '', model: msg.model }, 200, h);
  },
};
