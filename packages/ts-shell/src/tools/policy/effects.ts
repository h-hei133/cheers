import type { NormalizedToolCall } from "../toolCallBatch.js";
import type { ToolBeforePolicyDecision } from "./interception.js";

export type ToolEffectClassification =
  | "read_only"
  | "mutation"
  | "unknown"
  | "blocked"
  | "authority_required"
  | "unsupported";

export interface ToolEffectFacts {
  readonly effect: ToolEffectClassification;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

const READ_ONLY_TOOLS = new Set(["read", "glob", "git-status", "git-diff"]);
const MUTATION_TOOLS = new Set(["write", "edit", "browser.click", "browser.type"]);

export function classifyToolEffect(input: {
  readonly call: NormalizedToolCall;
  readonly decision?: ToolBeforePolicyDecision;
}): ToolEffectFacts {
  const decision = input.decision;
  if (decision?.status === "block" || decision?.status === "rejected") {
    return facts("blocked", "tool policy blocks execution", decision.notProvenClaims);
  }
  if (decision?.status === "request_authority") {
    return facts("authority_required", "tool requires explicit authority", decision.notProvenClaims);
  }
  if (
    input.call.status === "unsupported" ||
    input.call.kind === "unsupported" ||
    decision?.status === "unsupported"
  ) {
    return facts("unsupported", "tool is outside the sanctioned dispatch set", [
      ...(decision?.notProvenClaims ?? []),
      "tool-dispatch-unsupported",
    ]);
  }
  if (
    input.call.status === "unknown" ||
    input.call.kind === "unknown" ||
    input.call.status === "malformed"
  ) {
    return facts("unknown", "tool effect cannot be proven from a known call", [
      ...(decision?.notProvenClaims ?? []),
      "tool-effect-unknown",
    ]);
  }
  if (MUTATION_TOOLS.has(input.call.name)) {
    return facts("mutation", "tool may mutate workspace or browser state", [
      ...(decision?.notProvenClaims ?? []),
      "mutation-tool-not-parallel-safe",
    ]);
  }
  if (READ_ONLY_TOOLS.has(input.call.name)) {
    return facts("read_only", "tool is classified as read-only by the sanctioned tool policy", [
      ...(decision?.notProvenClaims ?? []),
      "read-only-tool-result-is-not-task-success",
    ]);
  }
  return facts("authority_required", "tool effect requires authority before dispatch", [
    ...(decision?.notProvenClaims ?? []),
    "tool-effect-authority-required",
  ]);
}

function facts(
  effect: ToolEffectClassification,
  reason: string,
  notProvenClaims: readonly string[] = [],
): ToolEffectFacts {
  return Object.freeze({
    effect,
    reason,
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze(Array.from(new Set([
      "terminal-success",
      "task-success",
      "verification-success",
      "tool-effect-classification-is-not-success",
      ...notProvenClaims,
    ]))),
  });
}
