/**
 * Concrete natal grammar rules. Rules detect structure and attach explicit
 * knowledge references; they contain no interpretive prose (ADR-0001).
 */
import type { GrammarRule } from "../rule";
import type { GrammarFact, GrammarMatch, JsonObject } from "../types";
import {
  aspectKnowledgeKey,
  conditionKnowledgeKey,
  houseKnowledgeKey,
  pointKnowledgeKey,
  signKnowledgeKey,
} from "./mapping";

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

/** planet_position -> planet_in_sign */
export const planetInSignRule: GrammarRule = {
  id: "natal.planet_in_sign",
  structure: "planet_in_sign",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "planet_position")) {
      const point = str(fact.values, "point");
      const sign = str(fact.values, "sign");
      if (point === undefined || sign === undefined) continue;
      matches.push({
        id: `pis-${input.id}-${fact.id}`,
        ruleId: planetInSignRule.id,
        structure: "planet_in_sign",
        values: { point, sign },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), signKnowledgeKey(sign)],
        },
      });
    }
    return matches;
  },
};

/** planet_position -> planet_in_house (skipped when house is absent/0) */
export const planetInHouseRule: GrammarRule = {
  id: "natal.planet_in_house",
  structure: "planet_in_house",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "planet_position")) {
      const point = str(fact.values, "point");
      const house = num(fact.values, "house");
      if (point === undefined || house === undefined || house < 1 || house > 12) continue;
      matches.push({
        id: `pih-${input.id}-${fact.id}`,
        ruleId: planetInHouseRule.id,
        structure: "planet_in_house",
        values: { point, house },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), houseKnowledgeKey(house)],
        },
      });
    }
    return matches;
  },
};

/** aspect -> planet_aspect_planet */
export const planetAspectPlanetRule: GrammarRule = {
  id: "natal.planet_aspect_planet",
  structure: "planet_aspect_planet",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "aspect")) {
      const from = str(fact.values, "from");
      const to = str(fact.values, "to");
      const type = str(fact.values, "type");
      if (from === undefined || to === undefined || type === undefined) continue;
      const orb = str(fact.values, "orb");
      const applying = fact.values.applying === true;
      matches.push({
        id: `pap-${input.id}-${fact.id}`,
        ruleId: planetAspectPlanetRule.id,
        structure: "planet_aspect_planet",
        values: { from, to, type, orb: orb ?? null, applying },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [
            aspectKnowledgeKey(type),
            pointKnowledgeKey(from),
            pointKnowledgeKey(to),
          ],
        },
      });
    }
    return matches;
  },
};

/** angle_position -> angle_in_sign */
export const angleInSignRule: GrammarRule = {
  id: "natal.angle_in_sign",
  structure: "angle_in_sign",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "angle_position")) {
      const point = str(fact.values, "point");
      const sign = str(fact.values, "sign");
      if (point === undefined || sign === undefined) continue;
      matches.push({
        id: `ais-${input.id}-${fact.id}`,
        ruleId: angleInSignRule.id,
        structure: "angle_in_sign",
        values: { point, sign },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), signKnowledgeKey(sign)],
        },
      });
    }
    return matches;
  },
};

/** house_cusp -> house_cusp_in_sign */
export const houseCuspInSignRule: GrammarRule = {
  id: "natal.house_cusp_in_sign",
  structure: "house_cusp_in_sign",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "house_cusp")) {
      const houseNumber = num(fact.values, "number");
      const sign = str(fact.values, "sign");
      if (houseNumber === undefined || sign === undefined) continue;
      matches.push({
        id: `hcs-${input.id}-${fact.id}`,
        ruleId: houseCuspInSignRule.id,
        structure: "house_cusp_in_sign",
        values: { house: houseNumber, sign },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [houseKnowledgeKey(houseNumber), signKnowledgeKey(sign)],
        },
      });
    }
    return matches;
  },
};

/** point_position -> point_in_sign (Chiron, Lilith, Nodes, Vertex) */
export const pointInSignRule: GrammarRule = {
  id: "natal.point_in_sign",
  structure: "point_in_sign",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "point_position")) {
      const point = str(fact.values, "point");
      const sign = str(fact.values, "sign");
      if (point === undefined || sign === undefined) continue;
      matches.push({
        id: `pts-${input.id}-${fact.id}`,
        ruleId: pointInSignRule.id,
        structure: "point_in_sign",
        values: { point, sign },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), signKnowledgeKey(sign)],
        },
      });
    }
    return matches;
  },
};

/** point_position -> point_in_house */
export const pointInHouseRule: GrammarRule = {
  id: "natal.point_in_house",
  structure: "point_in_house",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    for (const fact of factsOf(input.facts, "point_position")) {
      const point = str(fact.values, "point");
      const house = num(fact.values, "house");
      if (point === undefined || house === undefined || house < 1 || house > 12) continue;
      matches.push({
        id: `pth-${input.id}-${fact.id}`,
        ruleId: pointInHouseRule.id,
        structure: "point_in_house",
        values: { point, house },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), houseKnowledgeKey(house)],
        },
      });
    }
    return matches;
  },
};

/** any retrograde body -> planet_retrograde (grounded in condition semantics) */
export const retrogradeRule: GrammarRule = {
  id: "natal.planet_retrograde",
  structure: "planet_retrograde",
  evaluate(input) {
    const matches: GrammarMatch[] = [];
    const sources = [
      ...factsOf(input.facts, "planet_position"),
      ...factsOf(input.facts, "point_position"),
    ];
    for (const fact of sources) {
      if (fact.values.retrograde !== true) continue;
      const point = str(fact.values, "point");
      if (point === undefined) continue;
      matches.push({
        id: `rx-${input.id}-${fact.id}`,
        ruleId: retrogradeRule.id,
        structure: "planet_retrograde",
        values: { point },
        sourceFactIds: [fact.id],
        metadata: {
          knowledgeRefs: [pointKnowledgeKey(point), conditionKnowledgeKey("retrograde")],
        },
      });
    }
    return matches;
  },
};

/** All natal rules in one list (registered in deterministic ID order anyway). */
export const NATAL_RULES: readonly GrammarRule[] = [
  planetInSignRule,
  planetInHouseRule,
  planetAspectPlanetRule,
  angleInSignRule,
  houseCuspInSignRule,
  pointInSignRule,
  pointInHouseRule,
  retrogradeRule,
];
