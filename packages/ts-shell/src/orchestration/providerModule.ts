import {
  projectProviderOutcome,
  type ProviderOutcomeProjection,
} from "./providerOutcomeProjection.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";

export type { ProviderOutcomeProjection };

export function projectProviderDiagnosticHandoff(
  continuity: ContinuityStateLike,
): ProviderOutcomeProjection {
  return projectProviderOutcome(continuity);
}
