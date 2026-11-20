import { TABLES, type AppDB } from './db';

export const BACKUP_FORMAT = 'traningsapp-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportAll(db: AppDB): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {};
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  // Hemlig nyckel följer inte med i backupfilen.
  data.kv = (data.kv as { key: string; value: Record<string, unknown> }[]).map((r) =>
    r.key === 'settings' && r.value && typeof r.value === 'object' ? { ...r, value: { ...r.value, intervalsApiKey: '' } } : r,
  );
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(x: unknown): asserts x is BackupFile {
  const b = x as BackupFile;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.data !== 'object') throw new Error('Filen är inte en backup från appen.');
  if (b.version > BACKUP_VERSION) throw new Error('Backupen är från en nyare version av appen.');
}

/** Ersätter ALL data med backupens innehåll. */
export async function importAll(db: AppDB, file: unknown): Promise<void> {
  validateBackup(file);
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    const cur = (await db.table('kv').get('settings'))?.value as Record<string, unknown> | undefined;
    const keepKey = cur?.intervalsApiKey;
    for (const t of TABLES) {
      await db.table(t).clear();
      const rows = file.data[t];
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkPut(rows);
    }
    // Behåll telefonens API-nyckel (den finns aldrig i backupen).
    const imp = (await db.table('kv').get('settings'))?.value as Record<string, unknown> | undefined;
    const patch: Record<string, unknown> = {};
    if (keepKey && imp && !imp.intervalsApiKey) patch.intervalsApiKey = keepKey;
    if (imp && Object.keys(patch).length) await db.table('kv').put({ key: 'settings', value: { ...imp, ...patch } });
  });
}

export const HISTORY_FORMAT = 'traningsapp-historik';

/** Lägger till historik (löppass, gympass, invägningar) utan att radera något. Samma fil kan läsas in flera gånger. */
export async function mergeHistory(db: AppDB, file: unknown): Promise<{ runs: number; gym: number; swims: number; recipes: number }> {
  const f = file as { format?: string; data?: Record<string, unknown[]> };
  if (!f || f.format !== HISTORY_FORMAT || typeof f.data !== 'object') throw new Error('Filen är inte en historikfil.');
  const runs = (f.data.runs ?? []) as { id: string; externalId?: string }[];
  const gym = (f.data.gymSessions ?? []) as { id: string }[];
  const weighs = (f.data.weighIns ?? []) as { date: string }[];
  const swims = (f.data.swims ?? []) as { id: string }[];
  const recipes = (f.data.recipes ?? []) as { id: string }[];
  let rc = 0;
  let r = 0;
  let g = 0;
  let sw = 0;
  await db.transaction('rw', [db.runs, db.gymSessions, db.weighIns, db.swims, db.recipes], async () => {
    // Rätter och matlådesatser (läggs bara till om de inte redan finns).
    for (const x of recipes) {
      if (await db.recipes.get(x.id)) continue;
      await db.recipes.put(x as never);
      rc++;
    }
    for (const x of swims) {
      if (await db.swims.get(x.id)) continue;
      await db.swims.put(x as never);
      sw++;
    }
    for (const run of runs) {
      if (await db.runs.get(run.id)) continue;
      await db.runs.put(run as never);
      r++;
    }
    for (const s of gym) {
      if (await db.gymSessions.get(s.id)) continue;
      await db.gymSessions.put(s as never);
      g++;
    }
    for (const w of weighs) if (!(await db.weighIns.get(w.date))) await db.weighIns.put(w as never);
  });
  return { runs: r, gym: g, swims: sw, recipes: rc };
}
