/**
 * The full deterministic interpretation pipeline:
 * chart -> normalized facts -> grammar matches -> composed sentences.
 * (Spec §4 core processing flow, up to the AI layer exclusively.)
 */
import { GrammarExecutor } from "../grammar/executor";
import { GrammarRegistry } from "../grammar/registry";
import { createHouseRulerRule, createStationRule } from "../grammar/rules/convention-rules";
import { NATAL_RULES } from "../grammar/rules/natal-rules";
import type { GrammarDiagnostic, GrammarMatch } from "../grammar/types";
import { loadRulershipTable, loadStationThresholds } from "../knowledge/conventions";
import { createCoreKnowledgeRegistry } from "../knowledge/pack-loader";
import { normalizeChart } from "../normalization/chart-facts";
import type { Chart } from "../types";
import {
  composeSentences,
  type ComposedGroup,
  type CompositionDiagnostic,
} from "./composer";

export interface InterpretationPipelineResult {
  readonly chartId: string;
  readonly matches: readonly GrammarMatch[];
  readonly groups: readonly ComposedGroup[];
  readonly grammarDiagnostics: readonly GrammarDiagnostic[];
  readonly compositionDiagnostics: readonly CompositionDiagnostic[];
  readonly knowledgePacks: readonly string[];
}

/** Run the deterministic pipeline for one chart. */
export async function runInterpretationPipeline(
  chart: Chart,
): Promise<InterpretationPipelineResult> {
  const knowledge = createCoreKnowledgeRegistry();
  const grammarRegistry = new GrammarRegistry();
  for (const rule of NATAL_RULES) grammarRegistry.register(rule);
  // The two convention rules take their tables from the pack, so the pack is
  // loaded first; a pack without them yields diagnostics, not silence.
  grammarRegistry.register(createHouseRulerRule(loadRulershipTable(knowledge)));
  grammarRegistry.register(createStationRule(loadStationThresholds(knowledge)));

  const input = normalizeChart(chart);
  const execution = await new GrammarExecutor().execute(input, {}, grammarRegistry);

  const composition = composeSentences(execution.matches, knowledge);

  return {
    chartId: chart.id,
    matches: execution.matches,
    groups: composition.groups,
    grammarDiagnostics: execution.diagnostics,
    compositionDiagnostics: composition.diagnostics,
    knowledgePacks: knowledge.loadedPacks(),
  };
}
