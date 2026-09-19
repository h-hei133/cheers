import type {
  ContextPlanningBlockStatus,
  ContextPlanningBlockSummary,
} from "../../context/acquisition/summary.js";
import type { CodingResultSummary, OrchestrationStatus, TerminalReason } from "../../result/types.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import type { ModelBoundaryPhaseProjection } from "../../runtime/loop/modelBoundary.js";
import type { RuntimeProjectionEvent } from "../../runtime/events/projection.js";
import type { ProductLoopAdapterProjection } from "../../runtime/loop/adapter.js";
import type { LoopTrajectoryProjection } from "../../runtime/loop/trajectory.js";
import type { ProviderStreamAdapterProjection } from "../../runtime/loop/providerStreamAdapter.js";
import type { PackageInventoryProjection } from "../../runtime/resources/inventory.js";
import type { StaticResourceProjection } from "../../runtime/resources/projection.js";
import {
  compactSessionPresentationText as compact,
  projectSessionPresentationFacts,
} from "../../session/presentation/facts.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";

export type ProductSurfaceSectionKind =
  | "task"
  | "context"
  | "context_discovery"
  | "context_acquisition"
  | "loop"
  | "turn"
  | "plan"
  | "planning"
  | "handoff"
  | "continuation_context"
  | "proposal"
  | "authority"
  | "apply"
  | "verification"
  | "repair"
  | "tools"
  | "execution"
  | "save_point"
  | "resources"
  | "provider"
  | "model_boundary"
  | "packages"
  | "session"
  | "events"
  | "verdict"
  | "not_proven"
  | "next_action";

export type ProductSurfaceSeverity =
  | "info"
  | "success"
  | "warning"
  | "blocked"
  | "error"
  | "partial"
  | "not_proven";

export type ProductSurfaceStatus =
  | "observed"
  | "ready"
  | "pending_authority"
  | "blocked"
  | "not_run"
  | "partial"
  | "failed"
  | "passed"
  | "unsupported"
  | "not_proven";

export interface ProductSurfaceFact {
  readonly label: string;
  readonly value: string;
  readonly sourceEvidenceId?: string;
  readonly machineEventCorrelationId?: string;
  readonly redacted?: boolean;
}

export interface ProductSurfaceSection {
  readonly kind: ProductSurfaceSectionKind;
  readonly title: string;
  readonly severity: ProductSurfaceSeverity;
  readonly status: ProductSurfaceStatus;
  readonly summary: string;
  readonly facts: readonly ProductSurfaceFact[];
  readonly redaction: "none" | "applied" | "excluded";
  readonly notProvenClaims: readonly string[];
  readonly sourceEvidenceIds: readonly string[];
  readonly machineEventCorrelationIds: readonly string[];
}

export interface ProductSurfaceViewModel {
  readonly sections: readonly ProductSurfaceSection[];
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
  readonly redaction: "none" | "applied" | "excluded";
  readonly terminalSuccessClaim: false;
}

export interface ProductSurfaceInput {
  readonly status: OrchestrationStatus;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly terminalReason: TerminalReason;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
  readonly resourceProjection?: StaticResourceProjection;
  readonly packageInventory?: PackageInventoryProjection;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly modelBoundaryPhase?: ModelBoundaryPhaseProjection;
  readonly providerStreamAdapter?: ProviderStreamAdapterProjection;
  readonly runtimeEvents?: readonly RuntimeProjectionEvent[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly loopTrajectory?: LoopTrajectoryProjection;
  readonly productLoopAdapter?: ProductLoopAdapterProjection;
  readonly contextPlanningSummary?: ContextPlanningBlockSummary;
}

