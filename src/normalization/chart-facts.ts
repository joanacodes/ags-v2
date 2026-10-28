/**
 * Chart normalization: UI chart model -> NormalizedGrammarInput.
 *
 * This is the only bridge between the UI data model and the engine
 * (ADR-0010). Output is deterministic: fact IDs derive from stable chart
 * content, ordering follows the chart arrays, values are JSON-compatible.
 */
import type { GrammarFact, NormalizedGrammarInput } from "../grammar/types";
import type { Chart } from "../types";

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Normalize a chart into engine facts. */
export function normalizeChart(chart: Chart): NormalizedGrammarInput {
  const facts: GrammarFact[] = [];

  for (const planet of chart.planets) {
    facts.push({
      id: `fact-planet-${slug(planet.planet)}`,
      structure: "planet_position",
      values: {
        point: planet.planet,
        sign: planet.sign,
        house: planet.house,
        degree: planet.degree,
        minute: planet.minute,
        retrograde: planet.retrograde === true,
        // Omitted rather than null when unknown, so older charts normalize unchanged.
        ...(typeof planet.speed === "number" ? { speed: planet.speed } : {}),
      },
    });
  }

  for (const point of chart.points ?? []) {
    facts.push({
      id: `fact-point-${slug(point.point)}`,
      structure: "point_position",
      values: {
        point: point.point,
        sign: point.sign,
        house: point.house,
        degree: point.degree,
        minute: point.minute,
        retrograde: point.retrograde === true,
        ...(typeof point.speed === "number" ? { speed: point.speed } : {}),
      },
    });
  }

  for (const angle of chart.angles) {
    facts.push({
      id: `fact-angle-${slug(angle.point)}`,
      structure: "angle_position",
      values: {
        point: angle.point,
        sign: angle.sign,
        degree: angle.degree,
        minute: angle.minute,
      },
    });
  }

  for (const house of chart.houses) {
    facts.push({
      id: `fact-house-${house.number}`,
      structure: "house_cusp",
      values: {
        number: house.number,
        sign: house.sign,
        degree: house.degree,
        minute: house.minute,
      },
    });
  }

  for (const aspect of chart.aspects) {
    facts.push({
      id: `fact-aspect-${slug(aspect.id)}`,
      structure: "aspect",
      values: {
        from: aspect.from,
        to: aspect.to,
        type: aspect.type,
        orb: aspect.orb,
        applying: aspect.applying,
      },
    });
  }

  return {
    id: `chart-input-${slug(chart.id)}`,
    facts,
    metadata: {
      chartId: chart.id,
      houseSystem: chart.configuration.houseSystem,
      timeKnown: chart.birth.timeKnown,
    },
  };
}
