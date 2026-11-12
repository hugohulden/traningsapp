// Typer för träningsinnehållet. Själva innehållet ligger i config.ts.

export type MuscleGroup =
  | 'Framsida lår'
  | 'Baksida lår/säte'
  | 'Vader'
  | 'Mage'
  | 'Bröst'
  | 'Rygg'
  | 'Axlar'
  | 'Biceps'
  | 'Triceps';

export type EquipmentKind = 'skivstång' | 'hantlar' | 'maskin' | 'kabel' | 'kroppsvikt';

/** Hur stort ett ökningssteg är. "hantel"/"maskin" slås upp i inställningarna. */
export type StepDef =
  | { type: 'fast'; kg: number }
  | { type: 'hantel' }
  | { type: 'maskin' }
  | { type: 'reps' }; // ingen viktökning, bara reps

export interface ExerciseDef {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  kind: EquipmentKind;
  step: StepDef;
  /** Basövning: längre vila (2–3 min). Annars isolationsvila (60–90 s). */
  compound: boolean;
  /** Kroppsviktsövning: vikten är extravikt (0 = bara kroppen). */
  bodyweight?: boolean;
  /** 1–2 alternativ (övnings-id) när maskinen är upptagen. */
  alternatives: string[];
  custom?: boolean;
}

export interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  /** RIR-mål [lägst, högst] */
  rir: [number, number];
}

export interface ExerciseSlot extends Prescription {
  slotId: string;
  exerciseId: string;
  optional?: boolean;
}

export type GymTemplateId = 'A' | 'B' | 'C';

export interface GymTemplate {
  id: GymTemplateId;
  name: string;
  slots: ExerciseSlot[];
}

export type ZoneKey = 'lugn' | 'steady' | 'troskel' | 'tempo' | 'hm' | 'vo2';

export type Amount = { min: number } | { km: number };

export interface IntervalBlock {
  reps: number;
  work: Amount;
  zone: ZoneKey | 'test';
  rest?: Amount;
  restKind?: 'jogg' | 'vila';
}

export interface QualityDef {
  /** Exakt text från planen. */
  text: string;
  blocks: IntervalBlock[];
  test?: '5k' | '10k';
  /** Uppvärmning och nedjogg i km (standard 2 + 2). */
  warmupKm?: number;
  cooldownKm?: number;
}

export interface LongDef {
  km: number;
  /** Exakt text från planen. */
  text: string;
  /** Delar av långpasset i annan fart, t.ex. sista 4 km steady. */
  segments?: { km: number; reps?: number; zone: ZoneKey; where: 'sist' | 'varav' }[];
}

export type PhaseId = 1 | 2 | 3 | 4 | 5;

export interface PlanWeekDef {
  week: number;
  /** Måndagens datum, YYYY-MM-DD */
  start: string;
  phase: PhaseId;
  deload: boolean;
  /** Veckomål km. null för tävlingsveckan. */
  km: number | null;
  long: LongDef | null;
  quality: QualityDef | null;
  /** Tävlingsveckan har egna pass. */
  raceWeek?: boolean;
}

export type GymMode = 'normal' | 'deload' | 'underhall';

export interface MaintenanceOverride {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rir: [number, number];
}
