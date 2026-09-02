import path from "node:path";
import type {
  ApprovalAuditRecord,
} from "../core/shell/approvalPromptRenderer.js";
import {
  renderApprovalAuditRecord,
  renderApprovalHeader,
  renderApprovalPromptFacts,
} from "../core/shell/approvalPromptRenderer.js";
import type { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import type { EscalationPrompt, EscalationResponse } from "../sandbox/index.js";

export type { ApprovalAuditRecord };

export type ApprovalDecision = "deny" | "allow-once" | "allow-always";

export type ApprovalDecisionSource =
  | "cli-policy"
  | "approval-mode-object"
  | "allow-once-cache"
  | "allow-always-policy"
  | "default-deny"
  | "ambiguous-stop"
  /** Answered by the session's permission scope rather than by the user. */
  | "session-scope";

export interface ApprovalModeSurfaceObject {
  readonly mode: ApprovalDecision;
  readonly persistent: boolean;
  readonly verifyLineage: string;
}

export function renderApprovalAuditSurface(
  renderer: StreamingRenderer,
  record: ApprovalAuditRecord,
): void {
  renderApprovalAuditRecord(renderer, record);
}

export function renderApprovalRequiredSurface(
  renderer: StreamingRenderer,
  input: {
    readonly prompt: EscalationPrompt;
    readonly includeRisk?: boolean;
    readonly decisionSource?: string;
    readonly lines?: readonly string[];
  },
): void {
  renderApprovalHeader(renderer, "approval-required");
  renderApprovalPromptFacts(renderer, {
    prompt: input.prompt,
    includeRisk: input.includeRisk,
    decisionSource: input.decisionSource,
  });
  renderApprovalLines(renderer, input.lines ?? []);
}

export function renderCachedApprovalSurface(
  renderer: StreamingRenderer,
  input: {
    readonly prompt: EscalationPrompt;
    readonly lines?: readonly string[];
  },
): void {
  renderApprovalHeader(renderer, "cached-approval");
  renderApprovalPromptFacts(renderer, { prompt: input.prompt });
  renderApprovalLines(renderer, input.lines ?? []);
}

export function formatApprovalObjectLine(
  channelLabel: "Non-interactive" | "Interactive",
  approvalModeObject: ApprovalModeSurfaceObject,
): string {
  return `${channelLabel} approval object: mode=${approvalModeObject.mode}, lineage=${approvalModeObject.verifyLineage}, persistent=${approvalModeObject.persistent ? "yes" : "no"}`;
}

export function formatNonInteractiveApprovalPolicyLine(input: {
  readonly resolvedDecision: ApprovalDecision;
  readonly cliDecision?: ApprovalDecision;
  readonly decisionSource: ApprovalDecisionSource;
  readonly hasCachedGrant: boolean;
}): string {
  const suffix =
    input.cliDecision !== undefined
      ? " (explicit CLI)"
      : input.decisionSource === "approval-mode-object"
        ? " (prompt approval-mode-object)"
        : input.hasCachedGrant
          ? " (cached grant)"
          : " (default deny)";
  return `Non-interactive approval policy: ${input.resolvedDecision}${suffix}`;
}

export function formatAllowOnceAppliedLine(): string {
  return "Allow-once applied to this execution only (non-persistent).";
}

export function formatTrustPolicyUpdatedLine(input: {
  readonly scopeLabel: string;
  readonly projectRoot: string;
}): string {
  return `Trust policy updated: ${input.scopeLabel} @ ${path.basename(input.projectRoot) || input.projectRoot}`;
}

export function formatApprovalDecisionLine(decision: ApprovalDecision): string {
  return `Approval decision: ${decision}`;
}

export function formatApprovalConflictResolutionLine(): string {
  return "Resolve approval conflict explicitly with --non-interactive-approval deny|allow-once|allow-always.";
}

export function formatApprovalPromptDecisionMenuLine(): string {
  return "Decision: y=allow-once, a=allow-always, n=deny (default n)";
}

export function formatDefaultNonInteractiveDenyLine(): string {
  return "Non-interactive approval policy: deny (default deny)";
}

export function createApprovalResponse(input: {
  readonly promptId: string;
  readonly decision: ApprovalDecision;
  readonly userComment: string;
  readonly respondedAt?: number;
}): EscalationResponse {
  return {
    promptId: input.promptId,
    decision: input.decision,
    respondedAt: input.respondedAt ?? Date.now(),
    userComment: input.userComment,
  };
}

export function formatNonInteractiveBlockedComment(stopReason: string): string {
  return `CLI non-interactive approval blocked: ${stopReason}`;
}

export function formatInteractiveBlockedComment(stopReason: string): string {
  return `CLI interactive approval blocked: ${stopReason}`;
}

export function formatNonInteractiveApprovalComment(input: {
  readonly decision: ApprovalDecision;
  readonly decisionSource: ApprovalDecisionSource;
}): string {
  return `CLI non-interactive approval: ${input.decision} (${input.decisionSource})`;
}

export function formatInteractiveApprovalComment(input: {
  readonly decision: ApprovalDecision;
  readonly decisionSource: ApprovalDecisionSource;
}): string {
  return `CLI interactive approval: ${input.decision} (${input.decisionSource})`;
}

export function formatExplicitApprovalComment(input: {
  readonly decision: ApprovalDecision;
  readonly hasApprovalModeObject: boolean;
}): string {
  return `CLI explicit approval: ${input.decision}${input.hasApprovalModeObject ? " (approval-mode-object)" : ""}`;
}

function renderApprovalLines(
  renderer: Pick<StreamingRenderer, "renderLine">,
  lines: readonly string[],
): void {
  for (const line of lines) {
    renderer.renderLine(line);
  }
}
