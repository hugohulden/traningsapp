# Träning – gym + löpning mot Göteborgsvarvet 2027

Personlig PWA för att logga gym- och löppass och följa en färdig plan med automatisk viktprogression.
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
| `src/screens/` | Idag, Gympass, Plan/Vecka, Statistik, Kropp, Mer |

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

## Garmin (senare)

Löppass har fälten `source`, `externalId`, `activityType`, `maxHr`, `elevationGainM`, `cadence`
för att kunna importera Garmin Connects CSV-export i en senare version.
