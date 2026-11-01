/** The forecast's results (TASK-0015). Dates travel as ISO strings, so the page and the API share one shape. */
import type { NatalPoint } from "./natal";

export type Technique = "transit" | "progression" | "solar-arc" | "eclipse";
export type AspectName = "conjunction" | "sextile" | "square" | "trine" | "opposition";

export const ASPECT_ANGLES: Readonly<Record<AspectName, number>> = { conjunction: 0, sextile: 60, square: 90, trine: 120, opposition: 180 };

// the tiers, set on four test charts over ten years: a key period comes one to three times a year, a notable one a
// few times a season
export const KEY = 10;
export const NOTABLE = 5;

/** One timing signal: something moving that meets a point of the birth chart, over a window of dates. */
export interface Indicator {
  /** Stable across recomputations, so a look-back mark stays on its period. */
  readonly key: string;
  readonly technique: Technique;
  /** What moves: "Saturn", "progressed Moon", "solar arc Midheaven", "solar eclipse". */
  readonly mover: string;
  /** The mover's library entry, when it has one ("planets/saturn"). */
  readonly moverId: string | null;
  readonly target: NatalPoint;
  readonly aspect: AspectName;
  readonly start: string;
  readonly end: string;
  /** The dates the contact is exact (up to three for a slow planet that turns back). */
  readonly exact: readonly string[];
  /** A planet's return to its own birth position (a Saturn return, a Jupiter return). */
  readonly returnOf: string | null;
  /** The planet stood still (stationed) on the contact: it lingers there. */
  readonly station: boolean;
  /** New and full moons and Mars contacts on the same point inside the window: the days it is likeliest felt. */
  triggers: { readonly date: string; readonly what: string }[];
  base: number;
  score: number;
  /** How many different techniques touch the same point in an overlapping window. */
  convergence: number;
  readonly reasons: string[];
}

export interface ProfectionYear {
  readonly age: number;
  readonly start: string;
  readonly end: string;
  readonly sign: string;
  /** The house counted in whole signs from the Ascendant, as profections count it. */
  readonly house: number;
  /** The lord of the year: the sign's traditional ruler; the modern tropical one beside it when it differs. */
  readonly lord: string;
  readonly coLord: string | null;
  readonly lordPosition: string | null;
}

export interface SolarReturn {
  readonly year: number;
  readonly date: string;
  readonly place: string;
  readonly ascendant: string;
  readonly midheaven: string;
  /** The natal house the return's Ascendant falls in. */
  readonly ascendantInNatalHouse: number | null;
  readonly sunHouse: number;
  readonly moonHouse: number;
  readonly moon: string;
  /** Planets within 5° of the return's angles. */
  readonly angular: readonly string[];
  readonly system: "Placidus" | "Equal";
}

export interface ReleasingPeriod {
  readonly lot: "spirit" | "fortune";
  readonly level: 1 | 2;
  readonly sign: string;
  readonly start: string;
  readonly end: string;
  readonly house: number;
  readonly ruler: string;
  /** Angular to the Lot of Fortune: a peak; the 10th from Fortune, the highest. */
  readonly peak: "highest" | "peak" | null;
  /** The sub-periods ran round the zodiac and jumped to the opposite sign: the "loosing of the bond". */
  readonly loosing: boolean;
}

export interface Milestone {
  readonly date: string;
  readonly technique: "progression" | "eclipse";
  readonly text: string;
}

export interface Meaning {
  readonly name: string;
  readonly definition: string;
  readonly domains: readonly string[];
  readonly notInherent: readonly string[];
  /** A library entry written for the forecast and waiting for the owner's validation. */
  readonly draft: boolean;
}

/**
 * Said when a chart has no birth time. The owner's rule (2026-11-01): there is always a birth time, or no reading.
 * Without it the angles and the houses are unknown, and with them the profections, zodiacal releasing, the solar
 * returns and every contact to an angle: what would be left is not a forecast of this person. Kept here, with the
 * types, so the page can say it before anything is computed without loading the library.
 */
export const NO_BIRTH_TIME = "A forecast needs the birth time: without it there is no reading. Add the time to the birth chart first.";

export interface Forecast {
  readonly chartId: string;
  readonly mode: "back" | "ahead";
  readonly from: string;
  readonly to: string;
  readonly generatedAt: string;
  /** What this forecast could not use, and why ("no birth time: no houses, no angles…"). */
  readonly limits: readonly string[];
  readonly years: readonly ProfectionYear[];
  readonly solarReturns: readonly SolarReturn[];
  readonly releasing: { readonly spirit: readonly ReleasingPeriod[]; readonly fortune: readonly ReleasingPeriod[] };
  readonly milestones: readonly Milestone[];
  readonly indicators: readonly Indicator[];
  /** Library entries by id, for every planet, point, aspect, house and technique the forecast names. */
  readonly meanings: Readonly<Record<string, Meaning>>;
  readonly settings: { readonly orbs: Readonly<Record<string, string>>; readonly solarReturnAt: string; readonly releasingYear: string };
}
