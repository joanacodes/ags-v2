/**
 * AGS — central data model.
 *
 * Every screen, service and mock file is typed against this single module.
 * The frontend never learns where the data comes from (JSON today, an API
 * tomorrow, an astrology provider after that) — it only knows these shapes.
 */

import type { AiModelId } from "@/interpretation/ai-models";

/* ------------------------------------------------------------------ */
/* Astronomy / astrology primitives                                    */
/* ------------------------------------------------------------------ */

export type ZodiacSign =
  | "Aries"
  | "Taurus"
  | "Gemini"
  | "Cancer"
  | "Leo"
  | "Virgo"
  | "Libra"
  | "Scorpio"
  | "Sagittarius"
  | "Capricorn"
  | "Aquarius"
  | "Pisces";

export type PlanetName =
  | "Sun"
  | "Moon"
  | "Mercury"
  | "Venus"
  | "Mars"
  | "Jupiter"
  | "Saturn"
  | "Uranus"
  | "Neptune"
  | "Pluto";

export type ChartPoint = PlanetName | "ASC" | "MC" | "DC" | "IC";

export type AspectType =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition";

export type HouseSystem = "Placidus" | "Whole Sign" | "Koch" | "Equal";

export type Element = "Fire" | "Earth" | "Air" | "Water";
export type Modality = "Cardinal" | "Fixed" | "Mutable";

export interface Placement {
  /** Degree within the sign, 0–29 */
  degree: number;
  /** Arc minute, 0–59 */
  minute: number;
  sign: ZodiacSign;
}

export interface PlanetPosition extends Placement {
  planet: PlanetName;
  house: number;
  retrograde?: boolean;
}

export interface House extends Placement {
  /** 1–12 */
  number: number;
}

export type ExtraPointName =
  | "Chiron"
  | "Lilith"
  | "North Node"
  | "South Node"
  | "Vertex";

export interface PointPosition extends Placement {
  point: ExtraPointName;
  /** 0 = no house placement (untimed charts). */
  house: number;
  retrograde?: boolean;
}

export interface AnglePosition extends Placement {
  point: "ASC" | "MC" | "DC" | "IC";
}

export interface Aspect {
  id: string;
  type: AspectType;
  from: ChartPoint;
  to: ChartPoint;
  /** Orb in the form "2°34'" */
  orb: string;
  applying: boolean;
}

/* ------------------------------------------------------------------ */
/* People & charts                                                     */
/* ------------------------------------------------------------------ */

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  gender?: string;
  notes?: string;
  avatarUrl?: string;
}

export interface BirthData {
  /** ISO date, e.g. "1994-10-12" */
  date: string;
  /** 24h local time, e.g. "14:35" — absent when time is unknown */
  time?: string;
  timeKnown: boolean;
  place: string;
  country: string;
  timezone: string;
  utcOffset: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number;
  julianDay?: number;
}

export interface ChartConfiguration {
  houseSystem: HouseSystem;
  zodiac: "Tropical" | "Sidereal";
  ephemeris: string;
  /** Output language for generated readings ("en", "fr", …). */
  language?: string;
  /** Claude model that writes this chart's readings (default: Sonnet 5.5). */
  aiModel?: AiModelId;
}

export type ChartStatus = "active" | "processing" | "failed" | "archived";

export interface ChartInsightScore {
  label: string;
  /** 0–5 stars */
  score: number;
}

export interface ChartSummary {
  sun: Placement & { house: number };
  moon: Placement & { house: number };
  ascendant: Placement;
  chartRuler: { planet: PlanetName; position: string };
  dominantElement: Element;
  dominantModality: Modality;
  dominantPlanets: PlanetName[];
  strongestHouses: number[];
  majorThemes: string[];
  insights: ChartInsightScore[];
}

export interface Chart {
  id: string;
  person: Person;
  birth: BirthData;
  configuration: ChartConfiguration;
  planets: PlanetPosition[];
  /** Extra bodies and derived points (Chiron, Lilith, Nodes, Vertex). */
  points?: PointPosition[];
  houses: House[];
  angles: AnglePosition[];
  aspects: Aspect[];
  summary: ChartSummary;
  status: ChartStatus;
  favourite: boolean;
  confidenceScore: number;
  createdAt: string;
  lastOpenedAt: string;
  lastOpenedLabel: string;
}

/* ------------------------------------------------------------------ */
/* Readings                                                            */
/* ------------------------------------------------------------------ */

export type ReadingStatus = "not-started" | "in-progress" | "complete";
export type WritingStyle = "poetic" | "clinical" | "conversational";

export interface ReadingConfidence {
  /** 0–5 stars */
  stars: number;
  label: string;
  chartFactorsUsed: number;
  aspectsCorroborating: number;
  evidenceScore: number;
}

export interface ChartFactorUsed {
  id: string;
  glyph: string;
  name: string;
  position: string;
  explanation: string;
}

export interface RelevantAspect {
  id: string;
  glyphs: string;
  label: string;
  detail: string;
}

export interface ReadingSection {
  id: string;
  heading: string;
  paragraphs: string[];
  pullQuote?: string;
  keyInsight?: {
    eyebrow: string;
    body: string;
  };
}

export interface Reading {
  id: string;
  chartId: string;
  slug: string;
  title: string;
  shortTitle: string;
  icon: string;
  description: string;
  estimatedMinutes: number;
  status: ReadingStatus;
  /** 0–100 */
  progress: number;
  breadcrumb: string[];
  confidence: ReadingConfidence;
  chartFactors: ChartFactorUsed[];
  relevantAspects: RelevantAspect[];
  sections: ReadingSection[];
  suggestedNext: string[];
}

export interface ReadingProgressSummary {
  completed: number;
  total: number;
  /** 0–100 */
  overall: number;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export type ReportSectionStatus = "complete" | "in-progress" | "locked";

export interface ReportSection {
  id: string;
  index: number;
  title: string;
  icon: string;
  status: ReportSectionStatus;
  /** Present for complete / in-progress sections */
  paragraphs?: string[];
  pullQuote?: string;
  /** Present for in-progress sections */
  progress?: number;
  readingSlug?: string;
}

export interface TechnicalAppendix {
  planetaryPositions: { glyph: string; body: string; position: string }[];
  houseCusps: { label: string; position: string }[];
}

export interface Report {
  chartId: string;
  generator: string;
  sectionsReady: number;
  sectionsTotal: number;
  estimatedPages: string;
  format: string;
  sections: ReportSection[];
  appendix: TechnicalAppendix;
  /** Astrological terms used in this chart, grounded in the knowledge base. */
  glossary: { term: string; definition: string }[];
}

export type ExportFormat = "pdf" | "docx" | "print" | "link";

export interface ReportSettings {
  includeChartWheel: boolean;
  technicalAppendix: boolean;
  aspectTables: boolean;
  coverPageStyle: string;
}

/* ------------------------------------------------------------------ */
/* Workspace / dashboard                                               */
/* ------------------------------------------------------------------ */

export interface WorkspaceUser {
  name: string;
  email: string;
  workspace: string;
  plan: string;
  avatarUrl?: string;
}

export interface ChartLibraryStats {
  total: number;
  favourited: number;
  active: number;
  archived: number;
}

export interface DashboardStats {
  totalCharts: number;
  totalChartsDelta: string;
  recentReports: number;
  pendingExports: number;
  favourites: number;
  lastReadingLabel: string;
  engineVersion: string;
  syncLatency: string;
  lastCalculationLabel: string;
}

export interface TransitDensityPoint {
  hour: number;
  density: number;
}

/* ------------------------------------------------------------------ */
/* Wizard drafts                                                       */
/* ------------------------------------------------------------------ */

export interface ChartDraft {
  personal?: {
    firstName: string;
    lastName: string;
    gender?: string;
    notes?: string;
  };
  dateTime?: {
    birthDate: string;
    birthTime?: string;
    unknownTime: boolean;
  };
  location?: {
    birthPlace: string;
    country: string;
    timezone: string;
    latitude?: number;
    longitude?: number;
    utcOffset?: string;
  };
  configuration?: {
    houseSystem: HouseSystem;
    /** Output language for generated readings ("en", "fr", …). */
    language?: string;
    aiModel?: AiModelId;
  };
  step: number;
  savedAt: string;
}
