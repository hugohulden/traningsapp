/** 275 → "4:35" */
export function formatPace(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 5465 → "1:31:05", 1234 → "20:34" */
export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '–';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

/** "1:31:05" / "41:08" / "4:35" → sekunder */
export function parseDuration(text: string): number | null {
  const parts = text.trim().replace(',', '.').split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0] * 60;
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

/** Svensk decimal: 42.5 → "42,5" */
export function num(n: number | null | undefined, decimals = 1): string {
  if (n == null || !isFinite(n)) return '–';
  const r = Math.round(n * 10 ** decimals) / 10 ** decimals;
  return String(r).replace('.', ',');
}

export function parseNum(text: string): number | null {
  const v = Number(text.replace(',', '.').trim());
  return text.trim() === '' || isNaN(v) ? null : v;
}
