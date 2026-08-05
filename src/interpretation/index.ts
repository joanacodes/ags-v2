/** Public interpretation API (ADR-0008). */
export { composeSentences } from "./composer";
export type {
  ComposedGroup,
  ComposedSentence,
  CompositionDiagnostic,
  CompositionResult,
} from "./composer";
export { runInterpretationPipeline } from "./pipeline";
export type { InterpretationPipelineResult } from "./pipeline";
export { generateAiInterpretation } from "./ai";
export type { AiInterpretationOutcome } from "./ai";
