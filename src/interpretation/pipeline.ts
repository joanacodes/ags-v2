/**
 * The full deterministic interpretation pipeline:
 * chart -> normalized facts -> grammar matches -> composed sentences.
 * (Spec §4 core processing flow, up to the AI layer exclusively.)
 */
import { GrammarExecutor } from "../grammar/executor";
import { GrammarRegistry } from "../grammar/registry";
import { NATAL_RULES } from "../grammar/rules/natal-rules";
import type { GrammarDiagnostic, GrammarMatch } from "../grammar/types";
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
  const grammarRegistry = new GrammarRegistry();
  for (const rule of NATAL_RULES) grammarRegistry.register(rule);

  const input = normalizeChart(chart);
  const execution = await new GrammarExecutor().execute(input, {}, grammarRegistry);

  const knowledge = createCoreKnowledgeRegistry();
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
