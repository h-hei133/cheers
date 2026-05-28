import type { CodingWriteEffect } from "../../orchestration/types.js";
import {
  extractSeedInfluenceFromStrings,
  extractSummaryBoolean,
  extractSummaryString,
  normalizeOptionalBoolean,
  normalizeOptionalString,
  normalizeWriteEffect,
  parseSeedInfluence,
} from "../sessionContinuityModule.js";
import type { SeedInfluenceDiagnostic } from "../sessionContinuityTypes.js";

function getContinuityState(
  workingMemory: unknown,
): Record<string, unknown> | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const root = workingMemory as Record<string, unknown>;
  return root.continuity &&
    typeof root.continuity === "object" &&
    !Array.isArray(root.continuity)
    ? (root.continuity as Record<string, unknown>)
    : undefined;
}

function getSummaryEntries(workingMemory: unknown): readonly string[] {
  if (!workingMemory || typeof workingMemory !== "object") {
    return [];
  }
  const root = workingMemory as Record<string, unknown>;
  return Array.isArray(root.summary)
    ? root.summary.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function extractSummaryValue(
  workingMemory: unknown,
  key: string,
): string | undefined {
  const prefix = `${key}:`;
  for (const entry of getSummaryEntries(workingMemory)) {
    const normalized = entry.trim().startsWith("- ")
      ? entry.trim().slice(2).trim()
      : entry.trim();
    if (normalized.toLowerCase().startsWith(prefix)) {
      const value = normalized.slice(prefix.length).trim();
      if (value) {
        return value;
      }
    }
  }
  return undefined;
}

export function extractActionHandoffSummaryFromMemory(
  workingMemory: unknown,
): string | undefined {
  const continuity = getContinuityState(workingMemory);
  const candidate = normalizeOptionalString(
    continuity?.lastActionHandoffSummary,
  );
  return (
    candidate ??
    extractSummaryValue(workingMemory, "last-action-handoff-summary")
  );
}

export function extractWriteContinuityFromMemory(
  workingMemory: unknown,
):
  | {
      readonly writerStarted?: boolean;
      readonly writeEffect?: CodingWriteEffect;
      readonly requiresUserInspection?: boolean;
      readonly target?: string;
    }
  | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const continuity = getContinuityState(workingMemory);
  const summaryEntries = getSummaryEntries(workingMemory);
  const writerStarted =
    normalizeOptionalBoolean(continuity?.lastWriterStarted) ??
    extractSummaryBoolean(summaryEntries, "last-writer-started");
  const requiresUserInspection =
    normalizeOptionalBoolean(
      continuity?.lastWriteRequiresUserInspection,
    ) ??
    extractSummaryBoolean(
      summaryEntries,
      "last-write-requires-user-inspection",
    );
  const writeEffect =
    normalizeWriteEffect(continuity?.lastWriteEffect) ??
    normalizeWriteEffect(extractSummaryString(summaryEntries, "last-write-effect"));
  const target =
    normalizeOptionalString(continuity?.lastWriteEffectTarget) ??
    extractSummaryString(summaryEntries, "last-write-effect-target");
  if (
    writerStarted === undefined &&
    requiresUserInspection === undefined &&
    writeEffect === undefined &&
    !target
  ) {
    return undefined;
  }
  return {
    ...(writerStarted !== undefined ? { writerStarted } : {}),
    ...(requiresUserInspection !== undefined ? { requiresUserInspection } : {}),
    ...(writeEffect ? { writeEffect } : {}),
    ...(target ? { target } : {}),
  };
}

export function extractSeedInfluenceFromMemory(
  workingMemory: unknown,
): SeedInfluenceDiagnostic | undefined {
  if (!workingMemory || typeof workingMemory !== "object") {
    return undefined;
  }
  const continuity = getContinuityState(workingMemory);
  const fromContinuity = parseSeedInfluence(
    normalizeOptionalString(continuity?.lastSeedInfluence),
  );
  if (fromContinuity) {
    return fromContinuity;
  }
  return extractSeedInfluenceFromStrings(getSummaryEntries(workingMemory));
}

export function extractSeedInfluenceHandoffSummaryFromMemory(
  workingMemory: unknown,
): string | undefined {
  const continuity = getContinuityState(workingMemory);
  const candidate = normalizeOptionalString(
    continuity?.lastSeedInfluenceHandoffSummary,
  );
  return (
    candidate ??
    extractSummaryValue(
      workingMemory,
      "last-seed-influence-handoff-summary",
    )
  );
}

export function extractFailureHandoffDiagnosticFromMemory(
  workingMemory: unknown,
): string | undefined {
  const continuity = getContinuityState(workingMemory);
  const candidate = normalizeOptionalString(
    continuity?.lastFailureHandoffDiagnostic,
  );
  return (
    candidate ??
    extractSummaryValue(workingMemory, "last-failure-handoff-diagnostic")
  );
}

export function extractSuccessHandoffDiagnosticFromMemory(
  workingMemory: unknown,
): string | undefined {
  const continuity = getContinuityState(workingMemory);
  const candidate = normalizeOptionalString(
    continuity?.lastSuccessHandoffDiagnostic,
  );
  return (
    candidate ??
    extractSummaryValue(workingMemory, "last-success-handoff-diagnostic")
  );
}
