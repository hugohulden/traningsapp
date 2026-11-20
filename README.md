# Träning – gym + löpning mot Göteborgsvarvet 2027

Personlig PWA för att logga gym-, löp- och simpass, räkna kalorier och följa en färdig plan med automatisk viktprogression.
Fungerar helt offline, all data ligger lokalt i telefonen (IndexedDB).

## Kom igång lokalt

```bash
npm install
npm run dev      # utvecklingsserver
npm test         # enhetstester (progressionsmotor, plangenerator, kroppsvikt, backup)
npm run build    # produktionsbygge i dist/
```

## Var finns vad

| Fil | Innehåll |
|---|---|
| `src/plan/config.ts` | **Allt träningsinnehåll**: övningar, alternativ, pass, set/reps/RIR, steg, startvikter, fartzoner, veckoplan v1–27, generatorregler, marathonmall, viktmål |
| `src/engine/progression.ts` | Progressionsmotorn (dubbel progression, deload, sänkning, Epley, volymförslag) |
| `src/engine/planGenerator.ts` | Kalendervecka → pass, km-fördelning, upprepning/omstart, flytt-varningar, marathonblock |
| `src/engine/running.ts` | Fartzoner, km-uppskattning, T från testlopp, halvmaraprognos |
| `src/engine/bodyweight.ts` | Målkurva, glidande medel, kcal-förslag |
| `src/db/` | Dexie-databas, backup (export/import), dataåtgärder |
| `src/food/` | Kaloriräknaren: mål, makron, rätter, sök (`engine.ts`), data och Open Food Facts (`store.ts`), vyer (`ui/`), Livsmedelsverkets data (`data/livsmedel.json`) |
| `proxy/mat-foto/` | Cloudflare Worker för AI-foto (källkod), byggd fil `proxy/mat-foto.js` |
| `src/screens/` | Idag, Mat, Gympass, Plan/Vecka, Statistik, Kropp, Mer |

## Publicera gratis (GitHub Pages)

1. Pusha koden till ett GitHub-repo (grenen `main`).
2. På GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Varje push till `main` kör testerna, bygger och publicerar via `.github/workflows/deploy.yml`.
   Adressen blir `https://<ditt-användarnamn>.github.io/<repo-namn>/`.

## Lägg på hemskärmen (iPhone)

1. Öppna adressen i **Safari** (måste vara Safari).
2. Tryck på dela-knappen → **Lägg till på hemskärmen**.
3. Starta alltid appen från ikonen. Den fungerar då utan nät, och iOS rensar inte datan.

Uppdateringar laddas automatiskt nästa gång appen öppnas med nät.

## Backup

Mer → Exportera. På iPhone öppnas delningsmenyn: välj **Spara i Filer** (t.ex. iCloud Drive).
Appen påminner var 14:e dag. Import ersätter all data med filens innehåll.

## Löppass från klockan (Garmin → Intervals.icu → appen)

1. Skapa ett gratis konto på [intervals.icu](https://intervals.icu) och koppla Garmin Connect (Settings → Connections).
2. Intervals.icu → Settings → Developer Settings → skapa en API-nyckel.
3. I appen: **Mer → Löppass från klockan** → klistra in nyckeln → **Spara och synka**.

Appen hämtar nya löp- och simpass när den öppnas (högst var 10:e minut, eller med **Synka** på Idag),
kopplar dem till rätt planerat pass (samma dag, annars närmaste ogjorda pass inom ±2 dagar)
och slår ihop dem med pass du redan loggat för hand. Testlopp importeras med hela passets
tid, så appen ber dig fylla i själva 5/10 km-tiden innan tröskelfarten uppdateras.

Om webbläsaren blockerar anropet (CORS) finns en liten gratis mellanserver i
`proxy/intervals-proxy.js` (Cloudflare Worker). Lägg dess adress i fältet *Mellanserver*.

Nyckeln sparas bara i telefonen och följer inte med i backupfilen.

## Mat (kaloriräknare)

Fliken **Mat** visar dagens kalorier mot målet, makron och måltiderna. Logga med **+** på en måltid eller med **Logga**-knappen (väljer måltid efter klockslaget).

- **Mål** = underhåll (3100) + överskott (+400). Ändras under **Mer → Mat**. Fyller du i dagens förbrukning från Garmin i Mat gäller den i stället för underhållet den dagen.
- **Sök** letar bland dina rätter och senast ätna, i Livsmedelsverkets livsmedelsdatabas (ingår i appen, fungerar offline) och i Open Food Facts (märkesvaror, kräver nät).
- **Skanna** läser streckkoder med kameran och slår upp dem i Open Food Facts. Finns varan inte lägger du in den själv – den hittas direkt nästa gång.
- **Snabbval**: ett tryck loggar samma mängd som förra gången. **Kcal**: bara ett kcal-tal.
- **Rätter** (knappen uppe till höger): lägg ihop ingredienser, ange portioner (och gärna färdig vikt), logga sedan en portion – även flera dagar på en gång för matlådor.

Livsmedelsdata: © Livsmedelsverket, livsmedelsdatabasen (CC BY 4.0). Uppdatera med `python3 scripts/build_livsmedel.py`. Märkesvaror: Open Food Facts (ODbL).

## AI-foto (Cloudflare Worker, gratis)

Fotot analyseras av Claude. För att API-nyckeln aldrig ska ligga i appen går anropet via en liten Cloudflare Worker som du äger. Allt görs i webbläsaren, ca 10 minuter.

1. **API-nyckel:** skapa ett konto på **console.anthropic.com**, lägg in betalkort/krediter under *Billing* och skapa en nyckel under *API keys*. Ett foto kostar ungefär 10–25 öre (Claude Opus 5.5).
2. **Cloudflare:** skapa ett gratis konto på **dash.cloudflare.com** → *Workers & Pages* → *Create* → *Create Worker*. Döp den till t.ex. `mat-foto` → *Deploy*.
3. **Koden:** *Edit code* → markera allt i `worker.js` och ersätt med **hela** innehållet i [`proxy/mat-foto.js`](proxy/mat-foto.js) (öppna filen på GitHub → *Raw* → kopiera allt) → *Deploy*.
4. **Hemligheter:** Workern → *Settings* → *Variables and Secrets* → *Add*:
   - `ANTHROPIC_API_KEY` – typ **Secret** – nyckeln från steg 1.
   - `APP_CODE` – typ **Secret** – hitta på en lång kod (t.ex. 20 slumpade tecken).
   - (valfritt) `ALLOWED_ORIGIN` – om appen inte ligger på `https://hugohulden.github.io`.
5. **I appen:** **Mer → Mat → AI-foto**: klistra in Workerns adress (`https://mat-foto.<ditt-namn>.workers.dev`) och samma appkod.

Workern svarar bara på anrop från appens adress som har rätt appkod, så ingen annan kan använda din nyckel. Vill du sätta en kostnadsgräns: console.anthropic.com → *Limits*. Källkoden finns i `proxy/mat-foto/src/worker.js` (bygg om med `cd proxy/mat-foto && npm install && npm run build`).
