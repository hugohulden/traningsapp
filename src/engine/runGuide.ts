/** Steg-för-steg-instruktioner för ett planerat löppass, byggda från planens data. */
import { GENERATOR, RUN_TERMS, ZONES } from '../plan/config';
import type { Amount, IntervalBlock, ZoneKey } from '../plan/types';
import type { AppSettings } from '../plan/settings';
import type { RunSpec } from './planGenerator';
import { amountKm, estimatePace, plannedDurationSec, zoneHr, zoneText } from './running';
import { formatPace, num } from '../lib/format';

export interface GuideStep {
  title: string;
  detail?: string;
  /** Färg i listan. */
  tone: 'lugn' | 'hard' | 'vila';
}

export interface RunGuide {
  steps: GuideStep[];
  totalMin: number;
  /** Zoner och begrepp att förklara. */
  zones: ZoneKey[];
  terms: (keyof typeof RUN_TERMS)[];
}

type S = Pick<AppSettings, 'thresholdSec' | 'hmGoalSec' | 'hmDreamSec' | 'easyEstimateSec' | 'tempoOffsetSec'>;

function amountText(a: Amount): string {
  if ('min' in a) return `${num(a.min)} min`;
  return a.km < 2 ? `${Math.round(a.km * 1000)} m` : `${num(a.km)} km`;
}

function zoneLabel(z: ZoneKey | 'test'): string {
  if (z === 'test') return 'testfart';
  return { lugn: 'lugn fart', steady: 'steady-fart', tempo: 'tempofart', troskel: 'tröskelfart', hm: 'halvmarafart', vo2: 'VO2-fart' }[z];
}

function paceLine(z: ZoneKey, s: S): string {
  const hr = zoneHr(z);
  return [zoneText(z, s), hr !== '—' ? `puls ${hr}` : ''].filter(Boolean).join(' · ');
}

function easyStep(km: number, s: S, title = `${num(km)} km lugnt`): GuideStep {
  return { title, detail: `${paceLine('lugn', s)} · ca ${Math.round((km * s.easyEstimateSec) / 60)} min`, tone: 'lugn' };
}

function blockSteps(b: IntervalBlock, s: S): GuideStep[] {
  const pace = estimatePace(b.zone, s);
  const each = amountKm(b.work, pace);
  const extra = 'min' in b.work ? `ca ${num(Math.round(each * 10) / 10)} km per intervall` : `ca ${formatPace(each * pace)} per intervall`;
  const zoneInfo = b.zone === 'test' ? 'så fort du orkar hålla jämnt hela vägen' : paceLine(b.zone, s);
  const work: GuideStep = {
    title: b.reps > 1 ? `${b.reps} × ${amountText(b.work)} i ${zoneLabel(b.zone)}` : `${amountText(b.work)} i ${zoneLabel(b.zone)}`,
    detail: [zoneInfo, b.zone === 'test' ? '' : extra].filter(Boolean).join(' · '),
    tone: 'hard',
  };
  const out = [work];
  if (b.rest && b.reps > 1) {
    out.push({
      title: `Mellan varje: ${amountText(b.rest)} ${b.restKind === 'vila' ? 'vila' : 'lugn jogg'}`,
      detail: b.restKind === 'vila' ? 'Gå eller stå still' : 'Jogga mycket lugnt, stå inte still',
      tone: 'vila',
    });
  }
  return out;
}

function stridesStep(text: string): GuideStep {
  const m = text.match(/(\d+)\s*×\s*(\d+)\s*s/);
  return {
    title: m ? `Direkt efter: ${m[1]} × ${m[2]} s stegringslopp` : 'Direkt efter: några stegringslopp',
    detail: 'Öka gradvis till nästan maxfart, avslappnat · gå eller jogga ca 1 min mellan',
    tone: 'hard',
  };
}

export function runGuide(r: RunSpec, s: S): RunGuide {
  const steps: GuideStep[] = [];
  const terms: RunGuide['terms'] = [];
  const zones = new Set<ZoneKey>(r.zones);

  if (r.blocks?.length) {
    const wu = GENERATOR.warmupKm;
    const cd = GENERATOR.cooldownKm;
    steps.push(easyStep(wu, s, `Uppvärmning ${num(wu)} km lugnt`));
    for (const b of r.blocks) steps.push(...blockSteps(b, s));
    steps.push(easyStep(cd, s, `Nedjogg ${num(cd)} km lugnt`));
    terms.push('uppvarmning');
    if (r.blocks.some((b) => b.rest && b.reps > 1 && b.restKind !== 'vila')) terms.push('jogg');
    if (r.blocks.some((b) => b.restKind === 'vila')) terms.push('vila');
    if (r.test) terms.push('test');
  } else if (r.long?.segments?.length) {
    const segKm = r.long.segments.reduce((a, g) => a + g.km * (g.reps ?? 1), 0);
    const g = r.long.segments[0];
    if (g.where === 'sist') {
      steps.push(easyStep(r.km - segKm, s, `Först ${num(r.km - segKm)} km lugnt`));
      steps.push({ title: `Sista ${num(g.km)} km i ${zoneLabel(g.zone)}`, detail: paceLine(g.zone, s), tone: 'hard' });
    } else {
      steps.push(easyStep(r.km, s, `${num(r.km)} km totalt, mest lugnt`));
      steps.push({
        title: `Varav ${g.reps ?? 1} × ${num(g.km)} km i ${zoneLabel(g.zone)}`,
        detail: `${paceLine(g.zone, s)} · lugn löpning före, mellan och efter`,
        tone: 'hard',
      });
    }
    terms.push('lang');
  } else if (r.category === 'lopp') {
    steps.push({ title: `${num(Math.round(r.km * 100) / 100)} km i halvmarafart`, detail: paceLine('hm', s), tone: 'hard' });
    terms.push('lopp');
  } else if (r.category === 'kvalitet' && r.workKm > 0) {
    // Tävlingsveckans genomkörare: "7 km med 3 × 1 km halvmarafart".
    steps.push(easyStep(GENERATOR.warmupKm, s, `Uppvärmning ${num(GENERATOR.warmupKm)} km lugnt`));
    steps.push({ title: r.text.replace(/^\d+(,\d+)? km med /, ''), detail: `${paceLine('hm', s)} · lugn jogg mellan`, tone: 'hard' });
    steps.push(easyStep(r.km - GENERATOR.warmupKm - r.workKm, s, 'Resten lugnt'));
  } else {
    steps.push(easyStep(r.km, s));
    if (r.category === 'lang') terms.push('lang');
  }

  if (r.strides) {
    steps.push(stridesStep(r.strides));
    terms.unshift('stegringslopp');
  }

  let sec = plannedDurationSec(r, s);
  if (r.strides) {
    const m = r.strides.match(/(\d+)\s*×\s*(\d+)\s*s/);
    sec += m ? Number(m[1]) * (Number(m[2]) + 60) : 6 * 80;
  }
  return {
    steps,
    totalMin: Math.round(sec / 60),
    zones: ZONES.map((z) => z.key).filter((k) => zones.has(k)),
    terms,
  };
}
