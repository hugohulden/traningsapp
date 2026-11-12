/**
 * Plangeneratorn: kalendervecka → pass (gym + löpning) med datum.
 * Ren logik – täckt av planGenerator.test.ts.
 */
import {
  DEFAULT_DAYS,
  GENERATOR,
  MARATHON,
  PHASE_NAMES,
  PLAN_START,
  PLAN_WEEKS,
  RACE_DATE,
  RACE_KM,
  RACE_NAME,
  RACE_WEEK,
  RECOVERY,
} from '../plan/config';
import type { IntervalBlock, LongDef, PlanWeekDef, QualityDef, ZoneKey } from '../plan/types';
import type { AppSettings, MissedWeek } from '../plan/settings';
import { addDays, diffDays, mondayOf, parseDate } from '../lib/dates';
import { gymTitle, type GymSpec } from './gymPlan';
import { qualityKm, round05, round1 } from './running';

export type RunCategory = 'lugn' | 'kvalitet' | 'lang' | 'extra' | 'lopp' | 'test';

export interface RunSpec {
  category: RunCategory;
  km: number;
  text: string;
  zones: ZoneKey[];
  blocks?: IntervalBlock[];
  strides?: string;
  long?: LongDef;
  test?: '5k' | '10k';
  /** Km i hög fart (för andel lugn löpning). */
  workKm: number;
}

export interface PlannedSession {
  key: string;
  kind: 'gym' | 'run';
  day: number;
  defaultDay: number;
  date: string;
  title: string;
  optional?: boolean;
  hard?: boolean;
  heavyLegs?: boolean;
  gym?: GymSpec;
  run?: RunSpec;
}

export type WeekKind = 'fore' | 'plan' | 'aterhamtning' | 'marathon' | 'fri';

export interface WeekPlan {
  index: number;
  kind: WeekKind;
  label: string;
  start: string;
  planWeek: number | null;
  phase: number | null;
  phaseName: string;
  deload: boolean;
  /** Veckomål enligt tabellen (justerat vid omstart). */
  kmTarget: number | null;
  /** Summa av planerade pass (inkl. valfria). */
  kmPlanned: number;
  sessions: PlannedSession[];
  repeated?: boolean;
  restart?: boolean;
  def?: PlanWeekDef;
}

export type PlanContext = Pick<
  AppSettings,
  'thresholdSec' | 'hmGoalSec' | 'hmDreamSec' | 'easyEstimateSec' | 'tempoOffsetSec' | 'dayOverrides' | 'missedWeeks' | 'marathonDate'
>;

export const PLAN_LENGTH = PLAN_WEEKS.length; // 27

export function weekIndexForDate(date: string): number {
  return Math.floor(diffDays(date, PLAN_START) / 7);
}

export function weekStart(index: number): string {
  return addDays(PLAN_START, index * 7);
}

// ---------------------------------------------------------------------------
// Sekvens: vilken planvecka körs vilken kalendervecka (upprepning/strykning)
// ---------------------------------------------------------------------------

export interface SeqEntry {
  week: number;
  repeated?: boolean;
  restart?: boolean;
}

export function buildSequence(missed: MissedWeek[]): SeqEntry[] {
  const seq: SeqEntry[] = PLAN_WEEKS.map((w) => ({ week: w.week }));
  const sorted = [...missed].sort((a, b) => a.index - b.index);
  for (const m of sorted) {
    const c = m.index;
    if (c < 0 || c >= PLAN_LENGTH - 1) continue;
    const dupe: SeqEntry = { week: seq[c].week, repeated: true, restart: m.restart };
    seq.splice(c + 1, 0, dupe);
    // Stryk en vecka längre fram (fas 2 först) så att loppet ligger kvar.
    let removed = false;
    for (const w of GENERATOR.dropOrder) {
      const i = seq.findIndex((e, idx) => idx > c + 1 && e.week === w && !e.repeated);
      if (i >= 0) {
        seq.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (!removed) seq.splice(c + 1, 1); // inget kvar att stryka – ingen upprepning
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Veckor
// ---------------------------------------------------------------------------

function run(category: RunCategory, km: number, text: string, zones: ZoneKey[], extra: Partial<RunSpec> = {}): RunSpec {
  return { category, km: round1(km), text, zones, workKm: 0, ...extra };
}

function gym(key: string, day: number, spec: GymSpec, optional = false): PlannedSession {
  return {
    key,
    kind: 'gym',
    day,
    defaultDay: day,
    date: '',
    title: gymTitle(spec),
    gym: spec,
    heavyLegs: spec.template === 'A',
    optional,
  };
}

function runSession(key: string, day: number, title: string, r: RunSpec, hard = false, optional = false): PlannedSession {
  return { key, kind: 'run', day, defaultDay: day, date: '', title, run: r, hard, optional };
}

function longText(l: LongDef): string {
  return l.text === String(l.km) ? `${l.km} km lugnt` : `${l.text.replace(/^(\d+)/, '$1 km')}`;
}

function longZones(l: LongDef): ZoneKey[] {
  return ['lugn', ...(l.segments?.map((s) => s.zone) ?? [])];
}

function longWorkKm(l: LongDef) {
  return (l.segments ?? []).reduce((a, s) => a + s.km * (s.reps ?? 1), 0);
}

function qualityZones(q: QualityDef): ZoneKey[] {
  const z = new Set<ZoneKey>(['lugn']);
  q.blocks.forEach((b) => b.zone !== 'test' && z.add(b.zone));
  return [...z];
}

export interface EasyKm {
  easy: number;
  extra: number;
  quality: number;
  qualityWork: number;
}

/**
 * Tisdagens lugna pass = veckomål − långpass − kvalitetspass, högst 12 km.
 * Överskott ≥ 4 km blir ett valfritt lördagspass (högst 8 km); mindre stryks.
 */
export function splitWeekKm(km: number, longKm: number, q: QualityDef, ctx: PlanContext): EasyKm {
  const qk = qualityKm(q, ctx, GENERATOR.warmupKm, GENERATOR.cooldownKm);
  const raw = km - longKm - qk.total;
  const easy = Math.max(0, round05(Math.min(raw, GENERATOR.easyMaxKm)));
  const overflow = raw - GENERATOR.easyMaxKm;
  const extra = overflow >= GENERATOR.extraMinKm ? Math.min(GENERATOR.extraMaxKm, round05(overflow)) : 0;
  return { easy, extra, quality: qk.total, qualityWork: qk.work };
}

function planWeekSessions(def: PlanWeekDef, ctx: PlanContext, factor: number): { sessions: PlannedSession[]; kmTarget: number | null } {
  const sessions: PlannedSession[] = [];
  const phase = def.phase;

  if (def.raceWeek) {
    sessions.push(gym('gymB', 0, { template: 'B', deload: true, variant: 'latt' }));
    sessions.push(runSession('tune', 1, 'Löpning: genomkörare', run('kvalitet', RACE_WEEK.tuesday.km, RACE_WEEK.tuesday.text, ['lugn', 'hm'], { workKm: 3 })));
    sessions.push(runSession('shake', 3, 'Lugn löpning', run('lugn', RACE_WEEK.thursday.km, RACE_WEEK.thursday.text, ['lugn'], { strides: 'stegringslopp' })));
    sessions.push(runSession('race', 5, RACE_NAME, run('lopp', RACE_KM, RACE_WEEK.race.text, ['hm'], { workKm: RACE_KM }), true));
    return { sessions, kmTarget: null };
  }

  const variantA = def.week === 26 ? 'v26' : phase >= 3 ? 'fas3' : 'normal';
  const variantC = phase >= 3 ? 'fas3' : 'normal';
  sessions.push(gym('gymA', DEFAULT_DAYS.gymA, { template: 'A', deload: def.deload, variant: variantA }));
  sessions.push(gym('gymB', DEFAULT_DAYS.gymB, { template: 'B', deload: def.deload, variant: 'normal' }));
  sessions.push(gym('gymC', DEFAULT_DAYS.gymC, { template: 'C', deload: def.deload, variant: variantC }));

  const km = def.km! * factor;
  const long = factor === 1 ? def.long! : { ...def.long!, km: round05(def.long!.km * factor), text: String(round05(def.long!.km * factor)) };
  const q = def.quality!;
  const split = splitWeekKm(km, long.km, q, ctx);

  if (split.easy > 0) {
    sessions.push(
      runSession('easy', DEFAULT_DAYS.easy, 'Lugn löpning + stegringslopp', run('lugn', split.easy, `${split.easy} km lugnt + ${GENERATOR.stridesText}`, ['lugn'], { strides: GENERATOR.stridesText })),
    );
  }
  const qText = q.test ? q.text : `${q.text} (plus 2 km uppvärmning och 2 km nedjogg)`;
  sessions.push(
    runSession(
      'quality',
      DEFAULT_DAYS.quality,
      q.test ? `Testlopp ${q.test === '5k' ? '5 km' : '10 km'}` : 'Kvalitetspass',
      run(q.test ? 'test' : 'kvalitet', split.quality, qText, qualityZones(q), { blocks: q.blocks, test: q.test, workKm: split.qualityWork }),
      true,
    ),
  );
  if (split.extra > 0) {
    sessions.push(runSession('extra', DEFAULT_DAYS.extra, 'Valfri lugn löpning', run('extra', split.extra, `${split.extra} km lugnt (valfritt)`, ['lugn']), false, true));
  }
  sessions.push(runSession('long', DEFAULT_DAYS.long, 'Långpass', run('lang', long.km, longText(long), longZones(long), { long, workKm: longWorkKm(long) }), true));
  return { sessions, kmTarget: round05(km) };
}

function applyDays(index: number, start: string, sessions: PlannedSession[], ctx: PlanContext) {
  for (const s of sessions) {
    const o = ctx.dayOverrides[`${index}:${s.key}`];
    if (o != null && o >= 0 && o <= 6) s.day = o;
    s.date = addDays(start, s.day);
  }
  sessions.sort((a, b) => a.day - b.day || (a.kind === 'gym' ? -1 : 1));
}

function sumKm(sessions: PlannedSession[]) {
  return round1(sessions.reduce((a, s) => a + (s.run?.km ?? 0), 0));
}

export function getWeekPlan(index: number, ctx: PlanContext, seq = buildSequence(ctx.missedWeeks)): WeekPlan {
  const start = weekStart(index);

  if (index < 0) {
    return { index, kind: 'fore', label: 'Före planen', start, planWeek: null, phase: null, phaseName: 'Före planstart', deload: false, kmTarget: null, kmPlanned: 0, sessions: [] };
  }

  if (index < PLAN_LENGTH) {
    const e = seq[index];
    const def = PLAN_WEEKS[e.week - 1];
    const factor = e.restart ? GENERATOR.restartFactor : 1;
    const { sessions, kmTarget } = planWeekSessions(def, ctx, factor);
    applyDays(index, start, sessions, ctx);
    return {
      index,
      kind: 'plan',
      label: `Vecka ${index + 1}`,
      start,
      planWeek: def.week,
      phase: def.phase,
      phaseName: PHASE_NAMES[def.phase],
      deload: def.deload,
      kmTarget,
      kmPlanned: sumKm(sessions),
      sessions,
      repeated: e.repeated,
      restart: e.restart,
      def,
    };
  }

  const after = index - PLAN_LENGTH;
  if (after < RECOVERY.weeks) {
    const sessions: PlannedSession[] = [
      ...RECOVERY.gym.map((g) => gym(`gym${g.template}`, g.day, { template: g.template, deload: true, variant: 'latt' })),
      ...RECOVERY.runs.map((r, i) => runSession(`run${i + 1}`, r.day, 'Lugn återhämtning', run('lugn', r.km, `${r.km} km ${r.text.toLowerCase()}`, ['lugn']))),
    ];
    applyDays(index, start, sessions, ctx);
    return { index, kind: 'aterhamtning', label: `Återhämtning ${after + 1}/${RECOVERY.weeks}`, start, planWeek: null, phase: null, phaseName: 'Återhämtning', deload: true, kmTarget: sumKm(sessions), kmPlanned: sumKm(sessions), sessions };
  }

  const mw = marathonWeek(index, ctx);
  if (mw) {
    applyDays(index, start, mw.sessions, ctx);
    return { ...mw, kmPlanned: sumKm(mw.sessions) };
  }

  const sessions = [
    gym('gymA', 0, { template: 'A', deload: false, variant: 'normal' }),
    gym('gymB', 2, { template: 'B', deload: false, variant: 'normal' }),
    gym('gymC', 4, { template: 'C', deload: false, variant: 'normal' }),
  ];
  applyDays(index, start, sessions, ctx);
  return { index, kind: 'fri', label: 'Fri träning', start, planWeek: null, phase: null, phaseName: 'Fri träning', deload: false, kmTarget: null, kmPlanned: 0, sessions };
}

// ---------------------------------------------------------------------------
// Marathonblock (samma motor, annan konfiguration)
// ---------------------------------------------------------------------------

export function marathonBlockStart(): string {
  return weekStart(PLAN_LENGTH + RECOVERY.weeks);
}

export interface MarathonLayout {
  /** Index för första veckan i själva blocket. */
  blockStartIndex: number;
  blockWeeks: number;
  raceIndex: number;
  tooShort: boolean;
}

export function marathonLayout(date: string | null): MarathonLayout | null {
  if (!date) return null;
  const first = PLAN_LENGTH + RECOVERY.weeks;
  const raceIndex = weekIndexForDate(mondayOf(date));
  if (raceIndex < first) return null;
  const available = raceIndex - first + 1;
  const blockWeeks = Math.min(MARATHON.maxWeeks, available);
  return { blockStartIndex: raceIndex - blockWeeks + 1, blockWeeks, raceIndex, tooShort: available < MARATHON.minWeeks };
}

function marathonWeek(index: number, ctx: PlanContext): Omit<WeekPlan, 'kmPlanned'> | null {
  const L = marathonLayout(ctx.marathonDate);
  if (!L || index > L.raceIndex) return null;
  const start = weekStart(index);
  const gymSessions = MARATHON.gymPerWeek.map((g) =>
    gym(`gym${g.template}`, g.day, { template: g.template, deload: false, variant: g.maintenance ? 'underhall' : 'normal' }),
  );

  if (index < L.blockStartIndex) {
    // Bas mellan återhämtning och block.
    const km = MARATHON.startKm;
    const long = MARATHON.startLongKm - 4;
    const easy = round05((km - long) / 3);
    const sessions = [
      ...gymSessions,
      runSession('easy', 1, 'Lugn löpning + stegringslopp', run('lugn', easy, `${easy} km lugnt + ${GENERATOR.stridesText}`, ['lugn'], { strides: GENERATOR.stridesText })),
      runSession('run2', 3, 'Lugn löpning', run('lugn', easy, `${easy} km lugnt`, ['lugn'])),
      runSession('run3', 5, 'Lugn löpning', run('lugn', easy, `${easy} km lugnt`, ['lugn'])),
      runSession('long', 6, 'Långpass', run('lang', long, `${long} km lugnt`, ['lugn']), true),
    ];
    return { index, kind: 'marathon', label: 'Bas inför marathon', start, planWeek: null, phase: null, phaseName: 'Marathon – bas', deload: false, kmTarget: km, sessions };
  }

  const w = index - L.blockStartIndex; // 0-baserad i blocket
  const raceWeek = index === L.raceIndex;
  const taperIdx = L.raceIndex - index - 1; // 0 = veckan före loppet
  const buildWeeks = Math.max(1, L.blockWeeks - 1 - MARATHON.taperWeeks.length);
  const progress = Math.min(1, w / Math.max(1, buildWeeks - 1));
  let km = MARATHON.startKm + (MARATHON.peakKm - MARATHON.startKm) * progress;
  let long = MARATHON.startLongKm + (MARATHON.peakLongKm - MARATHON.startLongKm) * progress;
  const deload = !raceWeek && taperIdx >= MARATHON.taperWeeks.length && (w + 1) % MARATHON.deloadEvery === 0;
  if (deload) {
    km *= MARATHON.deloadFactor;
    long *= MARATHON.deloadFactor;
  }
  if (!raceWeek && taperIdx < MARATHON.taperWeeks.length) {
    const f = MARATHON.taperWeeks[MARATHON.taperWeeks.length - 1 - taperIdx];
    km = MARATHON.peakKm * f;
    long = MARATHON.peakLongKm * f;
  }
  km = round05(km);
  long = round05(long);

  if (raceWeek) {
    const raceDay = (parseDate(ctx.marathonDate!).getDay() + 6) % 7;
    const sessions = [
      gym('gymB', 0, { template: 'B', deload: true, variant: 'latt' }),
      runSession('easy', 1, 'Lugn löpning + stegringslopp', run('lugn', 8, `8 km lugnt + ${GENERATOR.stridesText}`, ['lugn'], { strides: GENERATOR.stridesText })),
      runSession('shake', Math.max(0, raceDay - 2), 'Lugn löpning', run('lugn', 5, '5 km lugnt', ['lugn'])),
      runSession('race', raceDay, 'Marathon', run('lopp', 42.195, 'LOPP', ['steady'], { workKm: 42.195 }), true),
    ];
    return { index, kind: 'marathon', label: `Marathon v${w + 1}`, start, planWeek: null, phase: null, phaseName: 'Marathon – tävling', deload: false, kmTarget: null, sessions };
  }

  const q = MARATHON.qualityRotation[w % MARATHON.qualityRotation.length] as QualityDef;
  const qk = qualityKm(q, ctx);
  const rest = Math.max(0, km - long - qk.total);
  const easy = round05(rest / 2);
  const sessions = [
    ...gymSessions.map((g) => ({ ...g, gym: { ...g.gym!, deload } })),
    runSession('easy', 1, 'Lugn löpning + stegringslopp', run('lugn', easy, `${easy} km lugnt + ${GENERATOR.stridesText}`, ['lugn'], { strides: GENERATOR.stridesText })),
    runSession('quality', 3, 'Kvalitetspass', run('kvalitet', qk.total, `${q.text} (plus 2 km uppvärmning och 2 km nedjogg)`, qualityZones(q), { blocks: q.blocks, workKm: qk.work }), true),
    runSession('run3', 5, 'Lugn löpning', run('lugn', easy, `${easy} km lugnt`, ['lugn'])),
    runSession('long', 6, 'Långpass', run('lang', long, `${long} km lugnt`, ['lugn']), true),
  ];
  const phaseName = taperIdx < MARATHON.taperWeeks.length ? 'Marathon – nedtrappning' : 'Marathon – block';
  return { index, kind: 'marathon', label: `Marathon v${w + 1}`, start, planWeek: null, phase: null, phaseName, deload, kmTarget: km, sessions };
}

// ---------------------------------------------------------------------------
// Varningar vid flytt av pass
// ---------------------------------------------------------------------------

export interface PlanWarning {
  sessionKeys: string[];
  text: string;
}

/** Skickar in passen för den aktuella veckan (och gärna nästa). */
export function scheduleWarnings(sessions: PlannedSession[]): PlanWarning[] {
  const out: PlanWarning[] = [];
  const legs = sessions.filter((s) => s.heavyLegs && !s.gym?.deload);
  const hard = sessions.filter((s) => s.hard);
  for (const l of legs) {
    for (const h of hard) {
      const d = diffDays(h.date, l.date);
      if (d >= 0 && d <= 2) {
        out.push({ sessionKeys: [l.key, h.key], text: `Tungt benpass inom 48 h före ${h.title.toLowerCase()} (${h.date === l.date ? 'samma dag' : `${d} dag${d > 1 ? 'ar' : ''} före`})` });
      }
    }
  }
  const hs = [...hard].sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < hs.length; i++) {
    const d = diffDays(hs[i].date, hs[i - 1].date);
    if (d <= 1) out.push({ sessionKeys: [hs[i - 1].key, hs[i].key], text: `Två hårda löppass ${d === 0 ? 'samma dag' : 'två dagar i rad'}: ${hs[i - 1].title.toLowerCase()} och ${hs[i].title.toLowerCase()}` });
  }
  return out;
}

export function weeksToRace(date: string): number {
  return Math.max(0, Math.ceil(diffDays(RACE_DATE, date) / 7));
}
