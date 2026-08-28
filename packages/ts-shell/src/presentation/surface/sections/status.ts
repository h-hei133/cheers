import type { ContextPlanningBlockStatus } from "../../../context/acquisition/summary.js";
import type { ProductSurfaceSeverity, ProductSurfaceStatus } from "./types.js";

export function contextPlanningSurfaceStatus(
  status?: ContextPlanningBlockStatus,
): ProductSurfaceStatus {
  switch (status) {
    case "product_surface_ready":
    case "review_only_ready":
      return "ready";
    case "blocked_stale_context":
    case "blocked_ambiguous_target":
    case "blocked_missing_required_context":
      return "blocked";
    case "partial_required_facts_missing":
      return "partial";
    case "unsupported":
      return "unsupported";
    case "not_proven":
    default:
      return "not_proven";
  }
}

export function contextPlanningSeverity(
  status?: ContextPlanningBlockStatus,
): ProductSurfaceSeverity {
  switch (status) {
    case "product_surface_ready":
    case "review_only_ready":
      return "success";
    case "blocked_stale_context":
    case "blocked_ambiguous_target":
    case "blocked_missing_required_context":
      return "blocked";
    case "partial_required_facts_missing":
      return "warning";
    case "unsupported":
      return "error";
    case "not_proven":
    default:
      return "info";
  }
}

export function verificationStatus(status?: string): ProductSurfaceStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "partial":
      return "partial";
    case "not_run":
    default:
      return "not_run";
  }
}

export function verificationSeverity(status?: string): ProductSurfaceSeverity {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "error";
    case "blocked":
      return "blocked";
    case "partial":
      return "warning";
    case "not_run":
    default:
      return "info";
  }
}

export function verdictStatus(
  terminalClassification: "success" | "stopped" | "error",
): ProductSurfaceStatus {
  switch (terminalClassification) {
    case "success":
      return "passed";
    case "stopped":
      return "blocked";
    case "error":
    default:
      return "failed";
  }
}

export function verdictSeverity(
  terminalClassification: "success" | "stopped" | "error",
): ProductSurfaceSeverity {
  switch (terminalClassification) {
    case "success":
      return "success";
    case "stopped":
      return "warning";
    case "error":
    default:
      return "error";
  }
}
