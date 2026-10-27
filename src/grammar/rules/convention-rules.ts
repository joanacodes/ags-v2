/**
 * Convention-backed natal rules (TASK-0012). They detect structure only;
 * the tables they need (which planet rules which sign, how slow counts as
 * stationary) arrive as parameters, loaded from the knowledge pack by the
 * caller. A rule built without its table reports a diagnostic instead of
 * guessing (ADR-0006), so a pack without conventions degrades loudly.
 */
import { GrammarRuleUnsupportedInputError } from "../errors";
import type { GrammarRule } from "../rule";
import type { GrammarFact, GrammarMatch, JsonObject } from "../types";
import { conditionKnowledgeKey, houseKnowledgeKey, pointKnowledgeKey } from "./mapping";

export interface RulershipConvention {
  readonly tradition: string;
  readonly rulers: Readonly<Record<string, string>>;
}

export interface StationConvention {
  readonly thresholds: Readonly<Record<string, number>>;
}

export const HOUSE_RULER_RULE_ID = "natal.house_ruler_in_house";
export const STATION_RULE_ID = "natal.planet_stationary";

function factsOf(facts: readonly GrammarFact[], structure: string): readonly GrammarFact[] {
  return facts.filter((f) => f.structure === structure);
}

function str(values: JsonObject, key: string): string | undefined {
  const v = values[key];
  return typeof v === "string" ? v : undefined;
}

function num(values: JsonObject, key: string): number | undefined {
  const v = values[key];
  return typeof v === "number" ? v : undefined;
}

function inHouseRange(house: number | undefined): house is number {
  return house !== undefined && house >= 1 && house <= 12;
}

/**
 * house_cusp + planet_position -> house_ruler_in_house
 * One match per cusp whose ruling planet is placed in a house. The ruler's
 * own placement is already a planet_in_house match; this one carries the
 * link between the two houses, which is what the sentence is about.
 */
export function createHouseRulerRule(convention: RulershipConvention | null): GrammarRule {
  return {
    id: HOUSE_RULER_RULE_ID,
    structure: "house_ruler_in_house",
    evaluate(input) {
      if (convention === null) {
        throw new GrammarRuleUnsupportedInputError(
          "no rulership table loaded (knowledge record conventions/rulerships)",
        );
      }
      const planets = factsOf(input.facts, "planet_position");
      const matches: GrammarMatch[] = [];
      for (const cusp of factsOf(input.facts, "house_cusp")) {
        const house = num(cusp.values, "number");
        const sign = str(cusp.values, "sign");
        if (!inHouseRange(house) || sign === undefined) continue;
        const ruler = convention.rulers[sign];
        if (ruler === undefined) continue;
        const placed = planets.find((f) => str(f.values, "point") === ruler);
        if (placed === undefined) continue;
        const rulerHouse = num(placed.values, "house");
        const rulerSign = str(placed.values, "sign");
        if (!inHouseRange(rulerHouse) || rulerSign === undefined) continue;
        const refs = new Set([
          houseKnowledgeKey(house),
          pointKnowledgeKey(ruler),
          houseKnowledgeKey(rulerHouse),
        ]);
        matches.push({
          // Zero-padded so the executor's string sort keeps houses in numeric order.
          id: `hr-${input.id}-${String(house).padStart(2, "0")}`,
          ruleId: HOUSE_RULER_RULE_ID,
          structure: "house_ruler_in_house",
          values: { house, sign, ruler, rulerHouse, rulerSign, tradition: convention.tradition },
          sourceFactIds: [cusp.id, placed.id],
          metadata: { knowledgeRefs: [...refs], convention: "conventions/rulerships" },
        });
      }
      return matches;
    },
  };
}

/**
 * planet_position / point_position with a numeric speed -> planet_stationary
 * when |speed| is within the body's threshold. Facts without a speed are
 * skipped silently: the chart simply predates the field.
 */
export function createStationRule(convention: StationConvention | null): GrammarRule {
  return {
    id: STATION_RULE_ID,
    structure: "planet_stationary",
    evaluate(input) {
      if (convention === null) {
        throw new GrammarRuleUnsupportedInputError(
          "no station thresholds loaded (knowledge record conventions/stations)",
        );
      }
      const sources = [
        ...factsOf(input.facts, "planet_position"),
        ...factsOf(input.facts, "point_position"),
      ];
      const matches: GrammarMatch[] = [];
      for (const fact of sources) {
        const point = str(fact.values, "point");
        const speed = num(fact.values, "speed");
        if (point === undefined || speed === undefined) continue;
        const threshold = convention.thresholds[point];
        if (threshold === undefined || Math.abs(speed) > threshold) continue;
        matches.push({
          id: `st-${input.id}-${fact.id}`,
          ruleId: STATION_RULE_ID,
          structure: "planet_stationary",
          values: {
            point,
            speed,
            threshold,
            direction: fact.values.retrograde === true ? "retrograde" : "direct",
          },
          sourceFactIds: [fact.id],
          metadata: {
            knowledgeRefs: [pointKnowledgeKey(point), conditionKnowledgeKey("station")],
            convention: "conventions/stations",
          },
        });
      }
      return matches;
    },
  };
}
