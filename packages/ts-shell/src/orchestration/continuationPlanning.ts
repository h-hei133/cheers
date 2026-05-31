import { rebindPathLikeToWorkspace } from "../core/paths/legacyRootRebase.js";
import { formatApprovalAuthorityFacts } from "../edit/authority/projection/approval.js";
import { projectProviderSafeDiagnostics } from "./providerOutcomeProjection.js";
import type { ContinuityStateLike } from "./runtimeHandoffProjection.js";
import {
  blockerNextAction,
  inferVerificationBlockerKind,
} from "../verification/result/failure/outcome.js";
import type { CodingVerificationBlockerKind } from "./types.js";
import type { ReflectiveStateQueryKind } from "./workflowTaskPlanner.js";

export interface RepairContinuationObject {
  readonly kind: "edit-fix";
  readonly targetPath?: string;
  readonly authority: "rebased-continuity-target" | "none";
  readonly replaceFrom?: string;
  readonly verifyCommand?: string;
  readonly replaceTo?: string;
  readonly blockerReason?: string;
  readonly sourceLineage: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly executableNow: boolean;
  readonly missingFields: readonly string[];
}

export interface VerifyContinuationObject {
  readonly kind: "rerun-verify";
  readonly targetPath?: string;
  readonly authority: "rebased-continuity-target" | "none";
  readonly command?: string;
  readonly commandCwd?: string;
  readonly blockerReason?: string;
  readonly sourceLineage: readonly string[];
  readonly resumeEligible: boolean;
  readonly confidence: "high" | "medium" | "low";
  readonly executableNow: boolean;
  readonly missingFields: readonly string[];
}

export function deriveContinuationTargetPath(
  continuity: ContinuityStateLike,
  workspaceRoot: string,
): string | undefined {
  const explainOutputTarget = deriveExplainTargetPathFromAssistantOutput(
    continuity.lastAssistantOutput,
  );
  if (isUsableContinuationTargetPath(explainOutputTarget ?? "")) {
    const reboundFromExplain = rebindContinuationTargetToWorkspace(
      explainOutputTarget!,
      workspaceRoot,
    );
    if (reboundFromExplain) {
      return reboundFromExplain;
    }
  }
  const readLikeTask =
    continuity.lastTaskKind === "read-file" ||
    continuity.lastTaskKind === "repo-explain" ||
    continuity.lastTaskKind === "inspect-files";
  const diagnosticTarget = projectProviderSafeDiagnostics(continuity)?.target;
  const preferredOrder = readLikeTask
    ? [
        ...(diagnosticTarget ? [diagnosticTarget] : []),
        ...(continuity.recentTargetFiles ?? []),
        ...(continuity.recentFailedFiles ?? []).map((entry) => entry.path),
        ...(continuity.recentChangedFiles ?? []),
        ...(continuity.recentVerifiedFiles ?? []),
      ]
    : [
        ...(diagnosticTarget ? [diagnosticTarget] : []),
        ...(continuity.recentTargetFiles ?? []),
        ...(continuity.recentChangedFiles ?? []),
        ...(continuity.recentFailedFiles ?? []).map((entry) => entry.path),
        ...(continuity.recentVerifiedFiles ?? []),
      ];

  for (const rawCandidate of preferredOrder) {
    const candidate = normalizePathLike(rawCandidate ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      continue;
    }
    const rebound = rebindContinuationTargetToWorkspace(
      candidate,
      workspaceRoot,
    );
    if (rebound) {
      return rebound;
    }
  }
  return undefined;
}

export function buildReflectiveStateQueryResponse(input: {
  kind: ReflectiveStateQueryKind;
  continuity: ContinuityStateLike;
  workspaceRoot: string;
}): string {
  const targetPath = deriveContinuationTargetPath(
    input.continuity,
    input.workspaceRoot,
  );
  const terminalClassification =
    input.continuity.lastTerminalClassification ?? "unknown";
  const terminalReason = input.continuity.lastTerminalReason ?? "unknown";
  const failure =
    input.continuity.lastFailure ??
    (input.continuity.unresolvedItems ?? []).find((entry) =>
      /(?:last-error:|stop-reason:|terminal:|failed-files:|verify:)/i.test(
        entry,
      ),
    );
  const window = extractLastReadWindowFromContinuity(input.continuity);
  const fragment = extractLastReadDeliveredFragmentFromContinuity(
    input.continuity,
  );

  if (input.kind === "stop-reason") {
    if (!failure && terminalClassification === "unknown") {
      return "I don't have enough rebased session state to explain why the previous run stopped. Re-run the failed step in this migrated session, then ask again.";
    }
    return [
      `Last run status: ${terminalClassification} (${terminalReason}).`,
      `Stop reason: ${failure ?? "No detailed blocker was persisted in this session."}`,
      targetPath ? `Active target context: ${targetPath}.` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  if (input.kind === "read-position") {
    if (window.start === undefined && window.end === undefined) {
      return "I don't have a rebased read-window snapshot for this session. Please run a read step first, then ask where we stopped reading.";
    }
    const start = (window.start ?? 0) + 1;
    const end = window.end ?? window.start ?? 0;
    return [
      `Last read position: lines ${start}-${end}.`,
      window.size !== undefined
        ? `Window size: ${window.size} lines.`
        : undefined,
      targetPath ? `Read target: ${targetPath}.` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  if (input.kind === "explain-scope") {
    const rangeText =
      fragment.ranges?.join(";") ??
      (fragment.start !== undefined && fragment.end !== undefined
        ? `${fragment.start + 1}-${fragment.end}`
        : undefined);
    const hasSliceEvidence =
      (fragment.lineIndexes?.length ?? 0) > 0 ||
      (fragment.ranges?.length ?? 0) > 0 ||
      (fragment.sourceWindowStart !== undefined &&
        fragment.sourceWindowEnd !== undefined);
    if (hasSliceEvidence && rangeText) {
      return [
        `Last explain scope: slice ${rangeText}.`,
        targetPath ? `Explain target: ${targetPath}.` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    }
    if (
      input.continuity.lastGroundedDeliverableMode === "explain" ||
      input.continuity.lastTaskKind === "repo-explain"
    ) {
      return [
        "Last explain scope: whole-file.",
        targetPath ? `Explain target: ${targetPath}.` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
    }
    return "No explain-object is available in the rebased session state. Run an explain step first, then ask which part was explained.";
  }

  if (input.kind === "approval-memory") {
    return formatApprovalAuthorityFacts({ continuity: input.continuity });
  }

  if (input.kind === "task-continuity") {
    const fromAssistant = extractTaskTripletFromText(
      input.continuity.lastAssistantOutput,
    );
    const fromUser = extractTaskTripletFromText(
      input.continuity.lastUserIntent,
    );
    const task = fromAssistant.task ?? fromUser.task ?? "resume-existing-task";
    const done =
      fromAssistant.done ??
      fromUser.done ??
      `last-${input.continuity.lastTaskKind ?? "task"}-step`;
    const next =
      fromAssistant.next ??
      fromUser.next ??
      (input.continuity.lastFailure
        ? `resolve blocker: ${truncate(input.continuity.lastFailure, 80)}`
        : "continue same task");
    return [`TASK=${task}`, `DONE=${done}`, `NEXT=${next}`].join("\n");
  }

  const unresolvedPreview = (input.continuity.unresolvedItems ?? [])
    .slice(0, 2)
    .join(" | ");
  if (
    input.continuity.lastVerificationStatus === "failed" ||
    input.continuity.lastVerificationStatus === "blocked"
  ) {
    const blockedKind = extractVerificationBlockerKindFromContinuity(
      input.continuity,
    );
    const blockedNextAction = blockedKind
      ? blockerNextAction(blockedKind)
      : undefined;
    return [
      input.continuity.lastVerificationStatus === "blocked"
        ? `Recommended next step: rerun verification command (${input.continuity.lastVerificationCommand ?? "verify command"}) after resolving blocker (${blockedKind ?? "unknown"}).`
        : `Recommended next step: rerun verification command (${input.continuity.lastVerificationCommand ?? "verify command"}) and fix reported failures.`,
      input.continuity.lastVerificationReason
        ? `Verification reason: ${input.continuity.lastVerificationReason}`
        : undefined,
      input.continuity.lastVerificationStatus === "blocked" && blockedNextAction
        ? `Next action: ${blockedNextAction}`
        : undefined,
      targetPath ? `Target context: ${targetPath}.` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }
  if (targetPath) {
    return `Recommended next step: continue the pending task on ${targetPath}.`;
  }
  if (unresolvedPreview.length > 0) {
    return `Recommended next step: resolve unresolved items (${unresolvedPreview}).`;
  }
  return "I don't have enough rebased session state to recommend a concrete next step. Provide an explicit target/action so we can continue safely.";
}

export function buildRepairContinuationObject(input: {
  readonly continuity: ContinuityStateLike;
  readonly targetPath?: string;
  readonly replaceDirective?: { from: string; to: string };
}): RepairContinuationObject {
  const missingFields: string[] = [];
  if (!input.targetPath) {
    missingFields.push("target");
  }
  if (!input.replaceDirective?.from || !input.replaceDirective?.to) {
    missingFields.push("transform");
  }

  const lineage: string[] = [];
  if (input.continuity.lastFailure) {
    lineage.push(`failure:${truncate(input.continuity.lastFailure, 120)}`);
  }
  if (input.continuity.lastTerminalReason) {
    lineage.push(`terminal:${input.continuity.lastTerminalReason}`);
  }
  for (const entry of input.continuity.lastContinuationEvidence ?? []) {
    if (/^(?:transform:|repair-failed-files:|reopen-)/i.test(entry)) {
      lineage.push(entry);
    }
    if (lineage.length >= 6) {
      break;
    }
  }

  const confidence: "high" | "medium" | "low" =
    missingFields.length === 0
      ? "high"
      : missingFields.length === 1
        ? "medium"
        : "low";

  return {
    kind: "edit-fix",
    targetPath: input.targetPath,
    authority: input.targetPath ? "rebased-continuity-target" : "none",
    replaceFrom: input.replaceDirective?.from,
    verifyCommand: inferVerifyCommandFromContinuity(input.continuity),
    replaceTo: input.replaceDirective?.to,
    blockerReason:
      input.continuity.lastFailure ?? input.continuity.lastTerminalReason,
    sourceLineage: lineage,
    confidence,
    executableNow: missingFields.length === 0,
    missingFields,
  };
}

export function buildVerifyContinuationObject(input: {
  readonly continuity: ContinuityStateLike;
  readonly targetPath?: string;
  readonly command?: string;
}): VerifyContinuationObject {
  const resolvedCommand =
    input.command ?? inferVerifyCommandFromContinuity(input.continuity);
  const missingFields: string[] = [];
  if (!input.targetPath) {
    missingFields.push("target");
  }
  if (!resolvedCommand) {
    missingFields.push("command");
  }
  const resolvedCwd = extractVerifyCwdHintFromContinuity(input.continuity);
  const resumeEligible = isVerifyResumeEligibleFromContinuity(input.continuity);

  const lineage: string[] = [];
  if (input.continuity.lastFailure) {
    lineage.push(`failure:${truncate(input.continuity.lastFailure, 120)}`);
  }
  if (input.continuity.lastVerificationReason) {
    lineage.push(
      `verify-reason:${truncate(input.continuity.lastVerificationReason, 120)}`,
    );
  }
  if (input.continuity.lastVerificationStatus) {
    lineage.push(`verify-status:${input.continuity.lastVerificationStatus}`);
  }
  for (const entry of input.continuity.lastContinuationEvidence ?? []) {
    if (
      /^(?:verify-command-hint:|verify-target-hint:|verify-cwd-hint:|verify-resume-eligible:|verify-blocker-kind:|verify-next-action:|verify:|stop-reason:|last-error:)/i.test(
        entry,
      )
    ) {
      lineage.push(entry);
    }
    if (lineage.length >= 6) {
      break;
    }
  }

  const confidence: "high" | "medium" | "low" =
    missingFields.length === 0
      ? "high"
      : missingFields.length === 1
        ? "medium"
        : "low";

  return {
    kind: "rerun-verify",
    targetPath: input.targetPath,
    authority: input.targetPath ? "rebased-continuity-target" : "none",
    command: resolvedCommand,
    commandCwd: resolvedCwd,
    blockerReason:
      input.continuity.lastVerificationReason ??
      input.continuity.lastFailure ??
      input.continuity.lastTerminalReason,
    sourceLineage: lineage,
    resumeEligible,
    confidence,
    executableNow: missingFields.length === 0,
    missingFields,
  };
}

export function inferVerifyCommandFromContinuity(
  continuity: ContinuityStateLike,
): string | undefined {
  if (continuity.lastVerificationCommand?.trim()) {
    return continuity.lastVerificationCommand.trim();
  }
  const diagnosticCommand = projectProviderSafeDiagnostics(
    continuity,
  )?.command?.trim();
  if (diagnosticCommand) {
    return diagnosticCommand;
  }
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const hintMatch = entry.match(/^verify-command-hint:(.+)$/i);
    if (hintMatch?.[1]?.trim()) {
      return hintMatch[1].trim();
    }
    const summaryMatch = entry.match(/^verify=(?:\w+)\s+command=(.+)$/i);
    if (summaryMatch?.[1]?.trim()) {
      return summaryMatch[1].trim();
    }
  }
  return undefined;
}

export function isVerifyResumeEligibleFromContinuity(
  continuity: ContinuityStateLike,
): boolean {
  if (continuity.lastVerificationResumeEligible === true) {
    return true;
  }
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const hintMatch = entry.match(/^verify-resume-eligible:(.+)$/i);
    const parsed = hintMatch?.[1]?.trim().toLowerCase();
    if (parsed === "true" || parsed === "yes" || parsed === "1") {
      return true;
    }
    if (parsed === "false" || parsed === "no" || parsed === "0") {
      return false;
    }
  }
  if (
    continuity.lastVerificationStatus === "blocked" &&
    (continuity.lastVerificationBlockerKind === "approval-denied" ||
      /approval denied/i.test(continuity.lastVerificationReason ?? "")) &&
    Boolean(inferVerifyCommandFromContinuity(continuity))
  ) {
    return true;
  }
  return false;
}

export function hasLocalExplainEvidenceInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  return (continuity.lastContinuationEvidence ?? []).some((entry) =>
    /^local-explain:/i.test(entry.trim()),
  );
}

export function hasReadFragmentEvidenceInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  if (
    (continuity.lastReadFragmentLineIndexes?.length ?? 0) > 0 ||
    (continuity.lastReadFragmentRanges?.length ?? 0) > 0 ||
    continuity.lastReadFragmentStart !== undefined ||
    continuity.lastReadFragmentEnd !== undefined ||
    (continuity.lastReadFragmentSourceWindowStart !== undefined &&
      continuity.lastReadFragmentSourceWindowEnd !== undefined) ||
    Boolean(continuity.lastReadFragmentFingerprint)
  ) {
    return true;
  }
  return (continuity.lastContinuationEvidence ?? []).some((entry) =>
    /^read-fragment-(?:start|end|line-indexes|ranges|source-window-start|source-window-end|fingerprint):/i.test(
      entry.trim(),
    ),
  );
}

function extractVerifyCwdHintFromContinuity(
  continuity: ContinuityStateLike,
): string | undefined {
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const hintMatch = entry.match(/^verify-cwd-hint:(.+)$/i);
    if (hintMatch?.[1]?.trim()) {
      return hintMatch[1].trim();
    }
  }
  return undefined;
}

function extractVerificationBlockerKindFromContinuity(
  continuity: ContinuityStateLike,
): CodingVerificationBlockerKind | undefined {
  if (continuity.lastVerificationBlockerKind?.trim()) {
    const parsed = continuity.lastVerificationBlockerKind.trim().toLowerCase();
    if (
      [
        "approval-denied",
        "missing-command",
        "environment-not-ready",
        "no-verify-strategy",
        "unknown",
      ].includes(parsed)
    ) {
      return parsed as CodingVerificationBlockerKind;
    }
  }
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const hintMatch = entry.match(/^verify-blocker-kind:(.+)$/i);
    const parsed = hintMatch?.[1]?.trim().toLowerCase();
    if (
      parsed &&
      [
        "approval-denied",
        "missing-command",
        "environment-not-ready",
        "no-verify-strategy",
        "unknown",
      ].includes(parsed)
    ) {
      return parsed as CodingVerificationBlockerKind;
    }
  }

  if (continuity.lastVerificationReason?.trim()) {
    return inferVerificationBlockerKind(
      {},
      continuity.lastVerificationReason,
    );
  }
  return undefined;
}

function extractTaskTripletFromText(value: string | undefined): {
  task?: string;
  done?: string;
  next?: string;
} {
  if (!value?.trim()) {
    return {};
  }
  const task = value.match(/\bTASK\s*=\s*([^\r\n]+)/i)?.[1]?.trim();
  const done = value.match(/\bDONE\s*=\s*([^\r\n]+)/i)?.[1]?.trim();
  const next = value.match(/\bNEXT\s*=\s*([^\r\n]+)/i)?.[1]?.trim();
  return {
    ...(task ? { task } : {}),
    ...(done ? { done } : {}),
    ...(next ? { next } : {}),
  };
}

function extractLastReadWindowFromContinuity(continuity: ContinuityStateLike): {
  start?: number;
  end?: number;
  size?: number;
} {
  let start = continuity.lastReadWindowStart;
  let end = continuity.lastReadWindowEnd;
  let size = continuity.lastReadWindowSize;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (size === undefined) {
      const match = token.match(/^read-window-size:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          size = parsed;
        }
      }
    }
  }
  if (
    size === undefined &&
    start !== undefined &&
    end !== undefined &&
    end >= start
  ) {
    size = end - start;
  }
  return { start, end, size };
}

function extractLastReadDeliveredFragmentFromContinuity(
  continuity: ContinuityStateLike,
): {
  start?: number;
  end?: number;
  lineIndexes?: number[];
  ranges?: string[];
  sourceWindowStart?: number;
  sourceWindowEnd?: number;
  fingerprint?: string;
  filter?: "none" | "function-definitions";
  empty?: boolean;
} {
  let start = continuity.lastReadFragmentStart;
  let end = continuity.lastReadFragmentEnd;
  const lineIndexes =
    continuity.lastReadFragmentLineIndexes?.filter(
      (value) => Number.isFinite(value) && value >= 0,
    ) ?? [];
  let ranges =
    continuity.lastReadFragmentRanges?.filter(
      (value) => value.trim().length > 0,
    ) ?? [];
  let sourceWindowStart = continuity.lastReadFragmentSourceWindowStart;
  let sourceWindowEnd = continuity.lastReadFragmentSourceWindowEnd;
  let fingerprint = continuity.lastReadFragmentFingerprint;
  let filter = continuity.lastReadFilter;
  let empty: boolean | undefined;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-fragment-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-fragment-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (lineIndexes.length === 0) {
      const match = token.match(/^read-fragment-line-indexes:([0-9,\s]+)$/);
      if (match?.[1]) {
        const parsed = normalizeReadFragmentLineIndexes(
          match[1].split(",").map((value) => Number.parseInt(value.trim(), 10)),
        );
        if (parsed.length > 0) {
          lineIndexes.push(...parsed);
        }
      }
    }
    if (ranges.length === 0) {
      const match = token.match(/^read-fragment-ranges:([0-9;,\s-]+)$/);
      if (match?.[1]) {
        ranges = match[1]
          .split(";")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
      }
    }
    if (sourceWindowStart === undefined) {
      const match = token.match(/^read-fragment-source-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowStart = parsed;
        }
      }
    }
    if (sourceWindowEnd === undefined) {
      const match = token.match(/^read-fragment-source-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowEnd = parsed;
        }
      }
    }
    if (filter === undefined) {
      const match = token.match(
        /^repair-read-filter:(none|function-definitions)$/,
      );
      if (match?.[1]) {
        filter = match[1] as "none" | "function-definitions";
      }
    }
    if (fingerprint === undefined) {
      const match = token.match(/^read-fragment-fingerprint:([0-9a-f]{64})$/);
      if (match?.[1]) {
        fingerprint = match[1];
      }
    }
    if (empty === undefined) {
      const match = token.match(/^read-fragment-empty:(true|false)$/);
      if (match?.[1]) {
        empty = match[1] === "true";
      }
    }
  }
  if (
    empty === undefined &&
    lineIndexes.length === 0 &&
    start !== undefined &&
    end !== undefined &&
    end <= start
  ) {
    empty = true;
  }
  if (ranges.length === 0 && lineIndexes.length > 0) {
    const compressed = compressLineIndexesToRanges(lineIndexes);
    if (compressed.length > 0) {
      ranges = compressed
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
  }
  return {
    start,
    end,
    ...(lineIndexes.length > 0 ? { lineIndexes } : {}),
    ...(ranges.length > 0 ? { ranges } : {}),
    ...(sourceWindowStart !== undefined ? { sourceWindowStart } : {}),
    ...(sourceWindowEnd !== undefined ? { sourceWindowEnd } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    ...(filter ? { filter } : {}),
    ...(empty !== undefined ? { empty } : {}),
  };
}

function normalizeReadFragmentLineIndexes(
  values: readonly number[] | undefined,
): number[] {
  const normalized: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const parsed = Math.floor(value);
    if (parsed < 0) {
      continue;
    }
    if (!normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }
  normalized.sort((left, right) => left - right);
  return normalized;
}

function compressLineIndexesToRanges(lineIndexes: readonly number[]): string {
  const normalized = normalizeReadFragmentLineIndexes(lineIndexes);
  if (normalized.length === 0) {
    return "";
  }
  const ranges: string[] = [];
  let start = normalized[0] ?? 0;
  let end = start;
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === undefined) {
      continue;
    }
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push(`${start}-${end}`);
    start = current;
    end = current;
  }
  ranges.push(`${start}-${end}`);
  return ranges.join(";");
}

function rebindContinuationTargetToWorkspace(
  candidatePath: string,
  workspaceRoot: string,
): string | undefined {
  const normalizedCandidate = normalizePathLike(candidatePath ?? "");
  if (!isUsableContinuationTargetPath(normalizedCandidate)) {
    return undefined;
  }
  return rebindPathLikeToWorkspace(normalizedCandidate, workspaceRoot);
}

function deriveExplainTargetPathFromAssistantOutput(
  output: string | undefined,
): string | undefined {
  if (!output) {
    return undefined;
  }
  const normalized = output.replace(/\r/g, "");
  const english =
    normalized.match(
      /^\s*Explanation\s+for\s+(.+?)(?:\s+\(\d+(?:-\d+)?\))?:/im,
    ) ??
    normalized.match(/^\s*Read result for\s+(.+?)\s*\(/im) ??
    normalized.match(/^\s*Read result for\s+(.+?):/im);
  const rawCandidate = english?.[1]?.trim();
  if (!rawCandidate) {
    return undefined;
  }
  const cleaned = normalizePathLike(rawCandidate);
  return cleaned.length > 0 ? cleaned : undefined;
}

function isUsableContinuationTargetPath(candidate: string): boolean {
  if (!candidate) {
    return false;
  }
  const lowered = candidate.toLowerCase();
  if (
    lowered === "(missing-target)" ||
    lowered === "(unknown)" ||
    lowered === "(workspace)" ||
    lowered.includes("(missing-target)")
  ) {
    return false;
  }
  return true;
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}
