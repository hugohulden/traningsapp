/**
 * Valfri mellanserver (Cloudflare Worker, gratis) om Intervals.icu inte tillåter
 * anrop direkt från webbläsaren. Den skickar bara vidare GET-anrop till
 * intervals.icu/api/v1/... och lägger till CORS-huvuden för din app.
 *
 * Driftsätt: dash.cloudflare.com → Workers & Pages → Create → Worker →
 * klistra in den här filen → Deploy. Lägg sedan worker-adressen under
 * Mer → Löppass från klockan → Mellanserver.
 */
const ALLOWED_ORIGIN = 'https://hugohulden.github.io';

function cors(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  h.set('Access-Control-Allow-Headers', 'Authorization');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    if (req.method !== 'GET' || !url.pathname.startsWith('/api/v1/athlete/')) {
      return new Response('Not found', { status: 404 });
    }
    const upstream = await fetch('https://intervals.icu' + url.pathname + url.search, {
      headers: { Authorization: req.headers.get('Authorization') ?? '', Accept: 'application/json' },
    });
    return cors(upstream);
  },
};
