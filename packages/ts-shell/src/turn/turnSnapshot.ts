import { freezeDeep } from "../core/values/freeze.js";
import { createHash } from "node:crypto";
import path from "node:path";

import type { RuntimePhase } from "../runtime/runtimePhase.js";

export type RuntimeProviderMode = "synthetic" | "real" | "default";
export type RuntimeAgentMode = "plan" | "build" | "default";

export interface RuntimeTurnSnapshotInput {
  readonly sessionId: string;
  readonly turn: number;
  readonly phase: RuntimePhase;
  readonly workspaceRoot: string;
  readonly providerMode?: RuntimeProviderMode;
  readonly providerOptIn: boolean;
  readonly modelLabel?: string;
  readonly agentMode?: RuntimeAgentMode;
  readonly capabilityFlags?: readonly string[];
  readonly planningMutationExecution?: "provided" | "not-provided";
  readonly executionBoundaryMode?: string;
  readonly continuationIdentity?: string;
  readonly evidenceCorrelationIds?: readonly string[];
}

export interface RuntimeTurnSnapshot {
  readonly id: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly phase: RuntimePhase;
  readonly provider: {
    readonly mode: RuntimeProviderMode;
    readonly optIn: boolean;
    readonly modelLabel?: string;
  };
  readonly agentMode: RuntimeAgentMode;
  readonly capabilityFlags: readonly string[];
  readonly workspace: {
    readonly basename: string;
    readonly identity: string;
  };
  readonly planningMutationExecution: "provided" | "not-provided";
  readonly executionBoundaryMode: string;
  readonly continuationIdentity?: string;
  readonly evidenceCorrelationIds: readonly string[];
  readonly redaction: {
    readonly status: "report-safe";
    readonly excluded: readonly string[];
  };
}

export function createRuntimeTurnSnapshot(
  input: RuntimeTurnSnapshotInput,
): RuntimeTurnSnapshot {
  const workspaceIdentity = stableDigest(input.workspaceRoot);
  const snapshot: RuntimeTurnSnapshot = {
    id: `turn-${stableDigest(`${input.sessionId}:${input.turn}:${input.phase}`)}`,
    sessionId: input.sessionId,
    turn: input.turn,
    phase: input.phase,
    provider: freezeObject({
      mode: input.providerMode ?? "default",
      optIn: input.providerOptIn,
      ...(input.modelLabel
        ? { modelLabel: sanitizeSafeLabel(input.modelLabel, "model") }
        : {}),
    }),
    agentMode: input.agentMode ?? "default",
    capabilityFlags: freezeArray(
      uniqueSorted(input.capabilityFlags ?? []).map((flag) =>
        sanitizeSafeLabel(flag, "capability"),
      ),
    ),
    workspace: freezeObject({
      basename: sanitizeSafeLabel(path.basename(input.workspaceRoot), "workspace"),
      identity: `workspace-${workspaceIdentity}`,
    }),
    planningMutationExecution: input.planningMutationExecution ?? "not-provided",
    executionBoundaryMode: sanitizeSafeLabel(
      input.executionBoundaryMode ?? "ExecutionService",
      "execution-boundary",
    ),
    ...(input.continuationIdentity
      ? {
          continuationIdentity: sanitizeSafeLabel(
            input.continuationIdentity,
            "continuation",
          ),
        }
      : {}),
    evidenceCorrelationIds: freezeArray(
      uniqueSorted(input.evidenceCorrelationIds ?? []).map((id) =>
        sanitizeSafeLabel(id, "evidence"),
      ),
    ),
    redaction: freezeObject({
      status: "report-safe",
      excluded: freezeArray([
        "api-keys",
        "provider.env",
        "raw-provider-output",
        "oldText",
        "newText",
        "unredacted-command-output",
        "hidden-reasoning",
        "full-transcript",
        "arbitrary-file-contents",
      ]),
    }),
  };
  return freezeDeep(snapshot);
}

function sanitizeSafeLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  return trimmed
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\b(oldText|newText)\b\s*[:=]\s*[\s\S]*/gi, "$1=[raw-edit-content-excluded]")
    .replace(/\b(hidden[-_ ]?reasoning|raw[-_ ]?provider[-_ ]?output|stdout|stderr)\b[\s\S]*/gi, "[raw-content-excluded]")
    .slice(0, 160);
}

function stableDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeObject<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}
