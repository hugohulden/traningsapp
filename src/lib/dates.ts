// Datum som lokala strängar YYYY-MM-DD. Veckan börjar på måndag.

export type ISODate = string;

export function parseDate(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 12, 0, 0);
}

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Testdatum (Mer → Testläge) för att prova planen framåt i tiden. */
export function testDate(): ISODate | null {
  try {
    return localStorage.getItem('testdatum');
  } catch {
    return null;
  }
}

export function setTestDate(d: ISODate | null) {
  try {
    if (d) localStorage.setItem('testdatum', d);
    else localStorage.removeItem('testdatum');
  } catch {
    /* ignoreras */
  }
}

export function today(): ISODate {
  return testDate() ?? toISO(new Date());
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = parseDate(d);
  x.setDate(x.getDate() + n);
  return toISO(x);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86400000);
}

/** 0 = måndag … 6 = söndag */
export function weekday(d: ISODate): number {
  return (parseDate(d).getDay() + 6) % 7;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, -weekday(d));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
export const DAY_NAMES = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
export const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

export function formatShort(d: ISODate): string {
  const x = parseDate(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

export function formatLong(d: ISODate): string {
  return `${DAY_NAMES[weekday(d)].toLowerCase()} ${formatShort(d)}`;
}
