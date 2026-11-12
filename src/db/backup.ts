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
    if (keepKey && imp && !imp.intervalsApiKey) await db.table('kv').put({ key: 'settings', value: { ...imp, intervalsApiKey: keepKey } });
  });
}
