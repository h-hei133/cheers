import type { QueryEvent } from "../core/query/runtime/events.js";
import type { CodingResultSummary, CodingWriteEffect } from "../orchestration/types.js";
import type { SessionMessage } from "./schema/sessionMessage.js";
import type {
  SeedInfluenceDiagnostic,
} from "./sessionContinuityTypes.js";
import type { TranscriptEvent } from "./sessionEventCodec.js";

export function extractGroundedDeliverableMode(
  evidence: readonly string[] | undefined,
): "read" | "summary" | "explain" | undefined {
  if (!evidence?.length) {
    return undefined;
  }
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim().toLowerCase();
    if (!item) {
      continue;
    }
    const match = item.match(/^deliverable-mode:(read|summary|explain)$/);
    if (match?.[1]) {
      return match[1] as "read" | "summary" | "explain";
    }
  }
  return undefined;
}

export function extractLastReadDeliveredLines(
  evidence: readonly string[] | undefined,
): number | undefined {
  if (!evidence?.length) {
    return undefined;
  }
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim().toLowerCase();
    if (!item) {
      continue;
    }
    const match = item.match(/^read-delivered-lines:(\d+)$/);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

export function extractLastReadWindow(
  evidence: readonly string[] | undefined,
): { start?: number; end?: number; size?: number } {
  if (!evidence?.length) {
    return {};
  }
  let start: number | undefined;
  let end: number | undefined;
  let size: number | undefined;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim().toLowerCase();
    if (!item) {
      continue;
    }
    if (start === undefined) {
      const match = item.match(/^read-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = item.match(/^read-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (size === undefined) {
      const match = item.match(/^read-window-size:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          size = parsed;
        }
      }
    }
    if (start !== undefined && end !== undefined && size !== undefined) {
      break;
    }
  }
  return { start, end, size };
}

export function extractLastReadFragment(
  evidence: readonly string[] | undefined,
): {
  start?: number;
  end?: number;
  lineIndexes?: number[];
  ranges?: string[];
  sourceWindowStart?: number;
  sourceWindowEnd?: number;
  fingerprint?: string;
  filter?: "none" | "function-definitions";
} {
  if (!evidence?.length) {
    return {};
  }
  let start: number | undefined;
  let end: number | undefined;
  let lineIndexes: number[] | undefined;
  let ranges: string[] | undefined;
  let sourceWindowStart: number | undefined;
  let sourceWindowEnd: number | undefined;
  let fingerprint: string | undefined;
  let filter: "none" | "function-definitions" | undefined;
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim().toLowerCase();
    if (!item) {
      continue;
    }
    if (start === undefined) {
      const match = item.match(/^read-fragment-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = item.match(/^read-fragment-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (lineIndexes === undefined) {
      const match = item.match(/^read-fragment-line-indexes:([0-9,\s]+)$/);
      if (match?.[1]) {
        const parsed = match[1]
          .split(",")
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter((value) => Number.isFinite(value) && value >= 0)
          .map((value) => Math.floor(value));
        if (parsed.length > 0) {
          lineIndexes = Array.from(new Set(parsed)).sort((a, b) => a - b);
        }
      }
    }
    if (ranges === undefined) {
      const match = item.match(/^read-fragment-ranges:([0-9;,\s-]+)$/);
      if (match?.[1]) {
        const parsed = match[1]
          .split(";")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        if (parsed.length > 0) {
          ranges = parsed;
        }
      }
    }
    if (sourceWindowStart === undefined) {
      const match = item.match(/^read-fragment-source-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowStart = parsed;
        }
      }
    }
    if (sourceWindowEnd === undefined) {
      const match = item.match(/^read-fragment-source-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowEnd = parsed;
        }
      }
    }
    if (filter === undefined) {
      const match = item.match(/^repair-read-filter:(none|function-definitions)$/);
      if (match?.[1] === "none" || match?.[1] === "function-definitions") {
        filter = match[1];
      }
    }
    if (fingerprint === undefined) {
      const match = item.match(/^read-fragment-fingerprint:([0-9a-f]{64})$/);
      if (match?.[1]) {
        fingerprint = match[1];
      }
    }
    if (
      start !== undefined &&
      end !== undefined &&
      lineIndexes !== undefined &&
      filter !== undefined
    ) {
      break;
    }
  }
  return {
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
    ...(lineIndexes?.length ? { lineIndexes } : {}),
    ...(ranges?.length ? { ranges } : {}),
    ...(sourceWindowStart !== undefined ? { sourceWindowStart } : {}),
    ...(sourceWindowEnd !== undefined ? { sourceWindowEnd } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    ...(filter ? { filter } : {}),
  };
}

export function extractStagedRepairProgress(
  evidence: readonly string[] | undefined,
): {
  stepCount?: number;
  completedStep?: number;
  blockedStep?: number;
  nextStep?: number;
} {
  if (!evidence?.length) {
    return {};
  }
  let stepCount: number | undefined;
  let completedStep: number | undefined;
  let blockedStep: number | undefined;
  let nextStep: number | undefined;

  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const item = evidence[index]?.trim().toLowerCase();
    if (!item) {
      continue;
    }
    if (stepCount === undefined) {
      const match = item.match(/^staged-repair-(?:step-total|steps):(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          stepCount = parsed;
        }
      }
    }
    if (completedStep === undefined) {
      const match = item.match(
        /^staged-repair-(?:completed-step|step-cursor):(\d+)$/,
      );
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          completedStep = parsed;
        }
      }
    }
    if (blockedStep === undefined) {
      const match = item.match(/^staged-repair-blocked-step:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          blockedStep = parsed;
        }
      }
    }
    if (nextStep === undefined) {
      const match = item.match(/^staged-repair-next-step:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          nextStep = parsed;
        }
      }
    }
    if (
      stepCount !== undefined &&
      completedStep !== undefined &&
      blockedStep !== undefined &&
      nextStep !== undefined
    ) {
      break;
    }
  }

  return { stepCount, completedStep, blockedStep, nextStep };
}

export function extractLastAnswerDefect(
  codingResult:
    | {
        readonly taskSatisfaction?: {
          readonly verdict?: string;
          readonly reasons?: readonly string[];
        };
      }
    | undefined,
): string | undefined {
  const reasons = codingResult?.taskSatisfaction?.reasons ?? [];
  if (reasons.length === 0) {
    return undefined;
  }
  const first = reasons[0]?.trim();
  if (!first) {
    return undefined;
  }
  if (codingResult?.taskSatisfaction?.verdict === "satisfied") {
    return undefined;
  }
  return first;
}

export function findLastQueryCompletionEvent(
  transcriptEvents: readonly TranscriptEvent[],
):
  | Extract<TranscriptEvent, { type: "query-event" }> & {
      event: Extract<QueryEvent, { type: "query.completed" }>;
    }
  | undefined {
  for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
    const event = transcriptEvents[index];
    if (event?.type !== "query-event") {
      continue;
    }
    if (event.event.type === "query.completed") {
      return event as Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      };
    }
  }
  return undefined;
}

export function findLastLifecycleEvent(
  transcriptEvents: readonly TranscriptEvent[],
  lifecycleEvent: Extract<TranscriptEvent, { type: "lifecycle" }>["event"],
): Extract<TranscriptEvent, { type: "lifecycle" }> | undefined {
  for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
    const event = transcriptEvents[index];
    if (event?.type !== "lifecycle") {
      continue;
    }
    if (event.event === lifecycleEvent) {
      return event;
    }
  }
  return undefined;
}

export function findLastCodingCompletionEvent(
  transcriptEvents: readonly TranscriptEvent[],
):
  | (Extract<TranscriptEvent, { type: "query-event" }> & {
      event: Extract<QueryEvent, { type: "query.completed" }>;
    })
  | undefined {
  let fallback:
    | (Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      })
    | undefined;
  for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
    const event = transcriptEvents[index];
    if (event?.type !== "query-event") {
      continue;
    }
    if (event.event.type !== "query.completed") {
      continue;
    }
    if (event.event.result.codingResult) {
      const typedEvent = event as Extract<TranscriptEvent, { type: "query-event" }> & {
        event: Extract<QueryEvent, { type: "query.completed" }>;
      };
      if (typedEvent.event.result.codingResult.taskKind !== "chat") {
        return typedEvent;
      }
      if (!fallback) {
        fallback = typedEvent;
      }
    }
  }
  return fallback;
}

export function collectRecentCodingResults(
  transcriptEvents: readonly TranscriptEvent[],
  limit: number,
): CodingResultSummary[] {
  const collected: CodingResultSummary[] = [];
  for (let index = transcriptEvents.length - 1; index >= 0; index -= 1) {
    if (collected.length >= limit) {
      break;
    }
    const event = transcriptEvents[index];
    if (event?.type !== "query-event" || event.event.type !== "query.completed") {
      continue;
    }
    const codingResult = event.event.result.codingResult;
    if (!codingResult || codingResult.taskKind === "chat") {
      continue;
    }
    collected.push(codingResult);
  }
  return collected;
}

export function findLastTurnContent(
  turns: readonly SessionMessage[],
  role: SessionMessage["role"],
): string | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.role === role && turn.content.trim().length > 0) {
      return turn.content;
    }
  }
  return undefined;
}

export function compactContinuityText(
  input: string,
  max: number = 220,
): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "yes" || normalized === "true") {
    return true;
  }
  if (normalized === "no" || normalized === "false") {
    return false;
  }
  return undefined;
}

export function normalizeWriteEffect(value: unknown): CodingWriteEffect | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "none" ||
    normalized === "unknown" ||
    normalized === "unverified" ||
    normalized === "verified"
  ) {
    return normalized;
  }
  return undefined;
}

export function extractSummaryString(
  summaryEntries: readonly string[],
  key: string,
): string | undefined {
  const prefix = `${key.toLowerCase()}:`;
  for (const entry of summaryEntries) {
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

export function extractSummaryBoolean(
  summaryEntries: readonly string[],
  key: string,
): boolean | undefined {
  return normalizeOptionalBoolean(extractSummaryString(summaryEntries, key));
}

export function extractSeedInfluenceFromStrings(
  entries: readonly string[],
): SeedInfluenceDiagnostic | undefined {
  for (const entry of entries) {
    const influence = parseSeedInfluence(entry);
    if (influence) {
      return influence;
    }
  }
  return undefined;
}

export function parseSeedInfluence(
  raw: string | undefined,
): SeedInfluenceDiagnostic | undefined {
  if (!raw) {
    return undefined;
  }
  const direct = raw.trim().toLowerCase();
  if (
    direct === "target-carryover" ||
    direct === "verify-signal" ||
    direct === "ignored-explicit-target"
  ) {
    return direct;
  }
  const match = direct.match(
    /\bseedInfluence=(target-carryover|verify-signal|ignored-explicit-target)\b/i,
  );
  return match?.[1] as SeedInfluenceDiagnostic | undefined;
}
