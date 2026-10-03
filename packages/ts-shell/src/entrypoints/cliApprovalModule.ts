import type { Interface as ReadlineInterface } from "node:readline";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { applyInteractiveApprovalDecisionWiring } from "../core/shell/interactiveApprovalWiring.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { EscalationPrompt, EscalationResponse } from "../core/shell/approval/contract.js";
import type { SessionContinuitySnapshot } from "../session/SessionManager.js";
import type { ApprovalModeObject } from "../cli/approval/approvalModeContract.js";
import type { InteractiveApprovalResult } from "../cli/interactive/picker/approval.js";
import {
  scopeAnswer,
  scopeLabel,
  scopeMeaning,
  type PermissionScope,
} from "../cli/approval/permissionScope.js";
import {
  createApprovalResponse,
  formatAllowOnceAppliedLine,
  formatApprovalConflictResolutionLine,
  formatApprovalDecisionLine,
  formatApprovalObjectLine,
  formatApprovalPromptDecisionMenuLine,
  formatDefaultNonInteractiveDenyLine,
  formatExplicitApprovalComment,
  formatInteractiveApprovalComment,
  formatInteractiveBlockedComment,
  formatNonInteractiveApprovalComment,
  formatNonInteractiveApprovalPolicyLine,
  formatNonInteractiveBlockedComment,
  formatTrustPolicyUpdatedLine,
  renderApprovalAuditSurface,
  renderApprovalRequiredSurface,
  renderCachedApprovalSurface,
  type ApprovalAuditRecord,
  type ApprovalDecisionSource,
} from "./approvalPromptBridge.js";

export type { ApprovalModeObject } from "../cli/approval/approvalModeContract.js";

interface NonInteractiveApprovalDecisionPlan {
  readonly source: ApprovalDecisionSource;
  readonly decision?: "deny" | "allow-once" | "allow-always";
  readonly stopReason?: string;
  readonly overrideNotes: readonly string[];
}

export interface ApprovalModeConflictAnalysis {
  readonly ambiguousStop: boolean;
  readonly stopReason?: string;
}

export function analyzeApprovalModeConflict(
  approvalModeObject?: ApprovalModeObject,
): ApprovalModeConflictAnalysis {
  if (!approvalModeObject) {
    return { ambiguousStop: false };
  }
  if (approvalModeObject.source === "prompt-ambiguous-verify-lineage") {
    return {
      ambiguousStop: true,
      stopReason:
        "Conflicting prompt approval signals (allow-once vs allow-always) for blocked verify continuation.",
    };
  }
  if (!approvalModeObject.executableNow) {
    return {
      ambiguousStop: true,
      stopReason: `Approval mode cannot be applied safely for blocked verify continuation: missing ${approvalModeObject.missingFields.join(", ")}.`,
    };
  }
  return { ambiguousStop: false };
}

export function createCliEscalationPromptHandler(
  renderer: StreamingRenderer,
  rl: ReadlineInterface | null,
  getViewMode: () => "compact" | "verbose",
  trustPolicy: ApprovalTrustPolicy,
  getProjectRoot: () => string,
  getNonInteractiveDecision?: () =>
    | "deny"
    | "allow-once"
    | "allow-always"
    | undefined,
  getApprovalModeObject?: () => ApprovalModeObject | undefined,
  persistApprovalAudit?: (record: ApprovalAuditRecord) => void,
  getPermissionScope?: () => PermissionScope,
  promptInteractiveApproval?: (
    prompt: EscalationPrompt,
  ) => Promise<InteractiveApprovalResult>,
): (prompt: EscalationPrompt) => Promise<EscalationResponse> {
  function emitApprovalAudit(record: ApprovalAuditRecord): void {
    if (!promptInteractiveApproval) {
      renderApprovalAuditSurface(renderer, record);
    }
    persistApprovalAudit?.(record);
  }

  function resolveNonInteractiveApprovalDecision(input: {
    cliDecision?: "deny" | "allow-once" | "allow-always";
    approvalModeObject?: ApprovalModeObject;
    hasAllowOnceCache: boolean;
    hasAllowAlwaysGrant: boolean;
  }): NonInteractiveApprovalDecisionPlan {
    const overrideNotes: string[] = [];
    const hasCachedGrant = input.hasAllowOnceCache || input.hasAllowAlwaysGrant;
    if (input.cliDecision) {
      if (input.approvalModeObject) {
        if (input.approvalModeObject.mode !== input.cliDecision) {
          overrideNotes.push(
            `Prompt approval-mode object (${input.approvalModeObject.mode}) is overridden by explicit CLI policy (${input.cliDecision}).`,
          );
        } else {
          overrideNotes.push(
            "Prompt approval-mode object is present; explicit CLI policy remains the source of truth.",
          );
        }
      }
      if (hasCachedGrant) {
        overrideNotes.push(
          "Cached grant is present but overridden by explicit non-interactive policy.",
        );
      }
      if (
        input.approvalModeObject &&
        (input.approvalModeObject.source ===
          "prompt-ambiguous-verify-lineage" ||
          !input.approvalModeObject.executableNow)
      ) {
        overrideNotes.push(
          "Prompt approval-mode signal is not safely executable and is overridden by explicit CLI policy.",
        );
      }
      return {
        source: "cli-policy",
        decision: input.cliDecision,
        overrideNotes,
      };
    }

    if (input.approvalModeObject) {
      const conflict = analyzeApprovalModeConflict(input.approvalModeObject);
      if (conflict.ambiguousStop) {
        return {
          source: "ambiguous-stop",
          stopReason: conflict.stopReason,
          overrideNotes,
        };
      }
      if (hasCachedGrant) {
        overrideNotes.push(
          "Prompt approval-mode object overrides cached grant for this blocked verify continuation.",
        );
      }
      return {
        source: "approval-mode-object",
        decision: input.approvalModeObject.mode,
        overrideNotes,
      };
    }

    if (input.hasAllowOnceCache) {
      return {
        source: "allow-once-cache",
        decision: "allow-once",
        overrideNotes,
      };
    }
    if (input.hasAllowAlwaysGrant) {
      return {
        source: "allow-always-policy",
        decision: "allow-always",
        overrideNotes,
      };
    }
    return {
      source: "default-deny",
      decision: "deny",
      overrideNotes,
    };
  }

  return async (prompt) => {
    const projectRoot = getProjectRoot();
    const evaluation = trustPolicy.evaluate(prompt, projectRoot);
    const isNonInteractive = rl === null && !promptInteractiveApproval;
    const cliNonInteractiveDecision = isNonInteractive
      ? getNonInteractiveDecision?.()
      : undefined;
    const approvalModeObject = getApprovalModeObject?.();
    const hasAllowOnceCache = trustPolicy.hasAllowOnce(evaluation.cacheKey);
    const hasAllowAlwaysGrant = Boolean(evaluation.matchedGrant);
    const hasCachedGrant = hasAllowOnceCache || hasAllowAlwaysGrant;
    // A session scope answers before anything is put to the user, and only in the
    // interactive channel: the non-interactive path has its own explicit policy,
    // and letting a display-level setting speak for it would hide which authority
    // actually decided.
    const scope = getPermissionScope?.() ?? "ask";
    const scopeDecision = isNonInteractive ? undefined : scopeAnswer(scope, prompt);
    if (scopeDecision) {
      renderApprovalRequiredSurface(renderer, {
        prompt,
        includeRisk: true,
        decisionSource: "session-scope",
        lines: [`- Session permission scope is \`${scopeLabel(scope)}\`: ${scopeMeaning(scope)}.`],
      });
      emitApprovalAudit({
        channel: "interactive",
        decision: scopeDecision,
        decisionSource: `session-scope:${scope}`,
        persistent: false,
        cacheEffect: "none",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
      renderer.renderLine(formatApprovalDecisionLine(scopeDecision));
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: scopeDecision,
        userComment: `Allowed by the session permission scope (${scopeLabel(scope)}), not by an explicit answer.`,
      });
    }

    if (isNonInteractive) {
      const nonInteractiveDecisionPlan = resolveNonInteractiveApprovalDecision({
        cliDecision: cliNonInteractiveDecision,
        approvalModeObject,
        hasAllowOnceCache,
        hasAllowAlwaysGrant,
      });
      renderApprovalRequiredSurface(renderer, {
        prompt,
        includeRisk: true,
        decisionSource: nonInteractiveDecisionPlan.source,
        lines: [
          ...nonInteractiveDecisionPlan.overrideNotes.map((note) => `- ${note}`),
          ...(approvalModeObject
            ? [formatApprovalObjectLine("Non-interactive", approvalModeObject)]
            : []),
        ],
      });
      if (nonInteractiveDecisionPlan.source === "ambiguous-stop") {
        const stopReason =
          nonInteractiveDecisionPlan.stopReason ??
          "Approval mode is ambiguous.";
        renderer.renderLine(stopReason);
        renderer.renderLine(formatApprovalConflictResolutionLine());
        emitApprovalAudit({
          channel: "non-interactive",
          decision: "deny",
          decisionSource: "ambiguous-stop",
          persistent: false,
          cacheEffect: "ambiguous-stop",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
          stopReason,
        });
        renderer.renderLine("");
        return createApprovalResponse({
          promptId: prompt.id,
          decision: "deny",
          userComment: formatNonInteractiveBlockedComment(stopReason),
        });
      }
      const resolvedDecision = nonInteractiveDecisionPlan.decision ?? "deny";
      renderer.renderLine(
        formatNonInteractiveApprovalPolicyLine({
          resolvedDecision,
          cliDecision: cliNonInteractiveDecision,
          decisionSource: nonInteractiveDecisionPlan.source,
          hasCachedGrant,
        }),
      );
      if (resolvedDecision === "allow-once") {
        renderer.renderLine(formatAllowOnceAppliedLine());
      }
      if (resolvedDecision === "allow-always") {
        const persisted = trustPolicy.rememberAllowAlways(prompt, projectRoot);
        renderer.renderLine(
          formatTrustPolicyUpdatedLine({
            scopeLabel: persisted.scopeLabel,
            projectRoot,
          }),
        );
      }
      if (nonInteractiveDecisionPlan.source === "allow-once-cache") {
        trustPolicy.consumeAllowOnce(evaluation.cacheKey);
        trustPolicy.recordLastHit({
          source: "allow-once-cache",
          projectRoot,
          scopeLabel: evaluation.scopeLabel,
          cacheKey: evaluation.cacheKey,
        });
      }
      if (nonInteractiveDecisionPlan.source === "allow-always-policy") {
        trustPolicy.recordLastHit({
          source: "allow-always-policy",
          projectRoot,
          scopeLabel: evaluation.scopeLabel,
          cacheKey: evaluation.cacheKey,
        });
      }
      emitApprovalAudit({
        channel: "non-interactive",
        decision: resolvedDecision,
        decisionSource: nonInteractiveDecisionPlan.source,
        persistent: resolvedDecision === "allow-always",
        cacheEffect:
          resolvedDecision === "allow-always"
            ? nonInteractiveDecisionPlan.source === "allow-always-policy"
              ? "allow-always-cache-hit"
              : "allow-always-persisted"
            : nonInteractiveDecisionPlan.source === "allow-once-cache"
              ? "allow-once-cache-consumed"
              : "none",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
        lineage: approvalModeObject?.verifyLineage,
      });
      renderer.renderLine(formatApprovalDecisionLine(resolvedDecision));
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: resolvedDecision,
        userComment: formatNonInteractiveApprovalComment({
          decision: resolvedDecision,
          decisionSource: nonInteractiveDecisionPlan.source,
        }),
      });
    }

    if (approvalModeObject) {
      const interactiveDecisionPlan = resolveNonInteractiveApprovalDecision({
        approvalModeObject,
        hasAllowOnceCache,
        hasAllowAlwaysGrant,
      });
      if (interactiveDecisionPlan.source === "ambiguous-stop") {
        const stopReason =
          interactiveDecisionPlan.stopReason ?? "Approval mode is ambiguous.";
        renderApprovalRequiredSurface(renderer, {
          prompt,
          includeRisk: true,
          decisionSource: interactiveDecisionPlan.source,
        });
        renderer.renderLine(stopReason);
        emitApprovalAudit({
          channel: "interactive",
          decision: "deny",
          decisionSource: "ambiguous-stop",
          persistent: false,
          cacheEffect: "ambiguous-stop",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
          stopReason,
        });
        renderer.renderLine("");
        return createApprovalResponse({
          promptId: prompt.id,
          decision: "deny",
          userComment: formatInteractiveBlockedComment(stopReason),
        });
      }
      if (interactiveDecisionPlan.source === "approval-mode-object") {
        const resolvedDecision = interactiveDecisionPlan.decision ?? "deny";
        renderApprovalRequiredSurface(renderer, {
          prompt,
          includeRisk: true,
          decisionSource: interactiveDecisionPlan.source,
          lines: [
            ...interactiveDecisionPlan.overrideNotes.map((note) => `- ${note}`),
            formatApprovalObjectLine("Interactive", approvalModeObject),
          ],
        });
        if (resolvedDecision === "allow-once") {
          renderer.renderLine(formatAllowOnceAppliedLine());
        }
        if (resolvedDecision === "allow-always") {
          const persisted = trustPolicy.rememberAllowAlways(
            prompt,
            projectRoot,
          );
          renderer.renderLine(
            formatTrustPolicyUpdatedLine({
              scopeLabel: persisted.scopeLabel,
              projectRoot,
            }),
          );
        }
        emitApprovalAudit({
          channel: "interactive",
          decision: resolvedDecision,
          decisionSource: interactiveDecisionPlan.source,
          persistent: resolvedDecision === "allow-always",
          cacheEffect:
            resolvedDecision === "allow-always"
              ? "allow-always-persisted"
              : "none",
          projectRoot,
          cacheKey: evaluation.cacheKey,
          scopeLabel: evaluation.scopeLabel,
          lineage: approvalModeObject?.verifyLineage,
        });
        renderer.renderLine(formatApprovalDecisionLine(resolvedDecision));
        renderer.renderLine("");
        return createApprovalResponse({
          promptId: prompt.id,
          decision: resolvedDecision,
          userComment: formatInteractiveApprovalComment({
            decision: resolvedDecision,
            decisionSource: interactiveDecisionPlan.source,
          }),
        });
      }
    }

    if (hasAllowOnceCache) {
      trustPolicy.consumeAllowOnce(evaluation.cacheKey);
      trustPolicy.recordLastHit({
        source: "allow-once-cache",
        projectRoot,
        scopeLabel: evaluation.scopeLabel,
        cacheKey: evaluation.cacheKey,
      });
      renderCachedApprovalSurface(renderer, {
        prompt,
        lines: ["- Decision: allow-once (cached in current shell run)"],
      });
      emitApprovalAudit({
        channel: isNonInteractive ? "non-interactive" : "interactive",
        decision: "allow-once",
        decisionSource: "allow-once-cache",
        persistent: false,
        cacheEffect: "allow-once-cache-consumed",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: "allow-once",
        userComment: "CLI auto-approval from allow-once cache",
      });
    }
    if (evaluation.matchedGrant) {
      trustPolicy.recordLastHit({
        source: "allow-always-policy",
        projectRoot,
        scopeLabel: evaluation.scopeLabel,
        cacheKey: evaluation.cacheKey,
      });
      renderCachedApprovalSurface(renderer, {
        prompt,
        lines: [
          "- Decision: allow-always (project policy match)",
          `- Scope: ${evaluation.scopeLabel}`,
          `- Rule key: ${evaluation.matchedGrant.scopeKey}`,
        ],
      });
      emitApprovalAudit({
        channel: isNonInteractive ? "non-interactive" : "interactive",
        decision: "allow-always",
        decisionSource: "allow-always-policy",
        persistent: true,
        cacheEffect: "allow-always-cache-hit",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: "allow-always",
        userComment: "CLI auto-approval from project allow-always trust policy",
      });
    }

    if (!promptInteractiveApproval) {
      renderApprovalRequiredSurface(renderer, { prompt, includeRisk: true });
      for (const line of trustPolicy.explain(
        evaluation,
        projectRoot,
        getViewMode(),
      )) {
        renderer.renderLine(`- ${line}`);
      }
      if (getViewMode() === "verbose") {
        renderer.renderLine(`- Recommended default: ${prompt.recommendedAction}`);
        renderer.renderLine("");
        renderer.renderLine(prompt.message);
      } else {
        renderer.renderLine(
          "- Tip: use /view developer to see policy and full escalation details.",
        );
      }
      renderer.renderLine(formatApprovalPromptDecisionMenuLine());
    }

    let decision: "deny" | "allow-once" | "allow-always";
    let decisionInputKey: "y" | "a" | "n" | "other" | undefined;
    let denialReason: string | undefined;
    if (isNonInteractive) {
      decision = "deny";
      decisionInputKey = "n";
      renderer.renderLine(formatDefaultNonInteractiveDenyLine());
      if (approvalModeObject) {
        renderer.renderLine(
          formatApprovalObjectLine("Non-interactive", approvalModeObject),
        );
      }
    } else if (promptInteractiveApproval) {
      try {
        const res = await promptInteractiveApproval(prompt);
        if (typeof res === "object" && res !== null) {
          decision = res.decision;
          denialReason = res.reason;
        } else if (typeof res === "string") {
          decision = res;
        } else {
          decision = "deny";
        }
      } catch {
        decision = "deny";
      }
      decisionInputKey =
        decision === "allow-once"
          ? "y"
          : decision === "allow-always"
            ? "a"
            : "n";
    } else {
      const answer = await askReadline(rl, "approval> ");
      const normalized = answer.trim().toLowerCase();
      decisionInputKey =
        normalized === "y"
          ? "y"
          : normalized === "a"
            ? "a"
            : normalized === "n"
              ? "n"
              : "other";
      decision =
        normalized === "y"
          ? "allow-once"
          : normalized === "a"
            ? "allow-always"
            : "deny";
    }

    if (!promptInteractiveApproval && decision === "allow-once") {
      renderer.renderLine(formatAllowOnceAppliedLine());
    }
    const interactiveWiring = applyInteractiveApprovalDecisionWiring({
      decision,
      prompt,
      projectRoot,
      evaluation,
      trustPolicy,
    });
    if (decision === "allow-always" && interactiveWiring.persistedGrant) {
      const persisted = interactiveWiring.persistedGrant;
      if (!promptInteractiveApproval) {
        renderer.renderLine(
          formatTrustPolicyUpdatedLine({
            scopeLabel: persisted.scopeLabel,
            projectRoot,
          }),
        );
      }
    }
    emitApprovalAudit({
      channel: isNonInteractive ? "non-interactive" : "interactive",
      decision,
      decisionSource: isNonInteractive
        ? "default-deny"
        : "interactive-keypress",
      persistent: decision === "allow-always",
      cacheEffect:
        decision === "allow-always" ? "allow-always-persisted" : "none",
      projectRoot,
      cacheKey: evaluation.cacheKey,
      scopeLabel: evaluation.scopeLabel,
      lineage: approvalModeObject?.verifyLineage,
      ...(decisionInputKey ? { inputKey: decisionInputKey } : {}),
      ...(decision === "deny"
        ? {
            stopReason: denialReason
              ? `Interactive approval denied by user: ${denialReason}`
              : "Interactive approval denied by user input.",
          }
        : {}),
    });

    if (!promptInteractiveApproval) {
      renderer.renderLine(formatApprovalDecisionLine(decision));
      renderer.renderLine("");
    }
    return createApprovalResponse({
      promptId: prompt.id,
      decision,
      userComment: denialReason
        ? `User denied with reason: ${denialReason}`
        : formatExplicitApprovalComment({
            decision,
            hasApprovalModeObject: Boolean(getApprovalModeObject?.()),
          }),
    });
  };
}


export function materializeApprovalModeObject(input: {
  prompt: string;
  continuity?: SessionContinuitySnapshot;
}): ApprovalModeObject | undefined {
  const modeCue = detectApprovalModeCue(input.prompt);
  if (!modeCue) {
    return undefined;
  }
  const continuity = input.continuity;
  const verifyLineageReady = hasBlockedVerifyResumeLineage(continuity);
  const missingFields: string[] = [];
  if (!verifyLineageReady) {
    missingFields.push("verify-lineage");
  }
  if (modeCue.ambiguous) {
    missingFields.push("approval-mode");
  }
  return {
    mode: modeCue.mode ?? "deny",
    persistent: modeCue.mode === "allow-always",
    source: modeCue.ambiguous
      ? "prompt-ambiguous-verify-lineage"
      : "prompt-explicit-verify-lineage",
    verifyLineage: "blocked-verify-resume",
    command: continuity?.lastVerificationCommand,
    commandCwd: extractVerifyHintFromContinuity(continuity, "verify-cwd-hint"),
    targetPath:
      extractVerifyHintFromContinuity(continuity, "verify-target-hint") ??
      continuity?.recentTargetFiles?.[0],
    executableNow: missingFields.length === 0 && Boolean(modeCue.mode),
    missingFields,
  };
}

function askReadline(
  rl: ReadlineInterface | null,
  question: string,
): Promise<string> {
  if (!rl) {
    return Promise.resolve("n");
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function detectApprovalModeCue(
  prompt: string,
): { mode?: "allow-once" | "allow-always"; ambiguous: boolean } | undefined {
  const normalized = prompt.toLowerCase();
  const hasVerifyContinuationCue =
    /(?:\b(?:continue|rerun|re-run|retry|run|execute|do that)\b.*\b(?:verify|verification|test|tests|build|lint|check)\b|\b(?:verify|verification|test|tests|build|lint|check)\b.*\b(?:again|retry|rerun|re-run|continue)\b|继续.*(?:验证|测试|构建|编译|检查)|重跑.*(?:测试|构建|编译)|再跑一次.*(?:测试|构建|编译)|继续刚才那个验证)/iu.test(
      prompt,
    );
  if (!hasVerifyContinuationCue) {
    return undefined;
  }
  const onceCue =
    /\ballow[-\s]?once\b|\bone[\s-]?time\b|\bjust this time\b|\btemporar(?:y|ily)\b|一次性授权|仅这一次|这次授权|临时授权|就这一次/u.test(
      normalized,
    );
  const alwaysCue =
    /\ballow[-\s]?always\b|\balways allow\b|\bremember(?:\s+it|\s+this)?\b|\bpermanent(?:ly)?\b|姘镐箙鍏佽|闀挎湡鎺堟潈|璁颁綇(?:杩欎釜)?鎺堟潈|姘镐箙鎺堟潈/u.test(
      normalized,
    );
  if (!onceCue && !alwaysCue) {
    return undefined;
  }
  if (onceCue && alwaysCue) {
    return { ambiguous: true };
  }
  return { mode: onceCue ? "allow-once" : "allow-always", ambiguous: false };
}

function hasBlockedVerifyResumeLineage(
  continuity?: SessionContinuitySnapshot,
): boolean {
  if (!continuity) {
    return false;
  }
  if (
    continuity.lastVerificationResumeEligible === true &&
    Boolean(continuity.lastVerificationCommand?.trim())
  ) {
    return true;
  }
  if (
    continuity.lastVerificationStatus === "blocked" &&
    continuity.lastVerificationBlockerKind === "approval-denied" &&
    Boolean(continuity.lastVerificationCommand?.trim())
  ) {
    return true;
  }
  return (
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      /^verify-resume-eligible:(?:1|true|yes)$/i.test(entry.trim()),
    ) && Boolean(continuity.lastVerificationCommand?.trim())
  );
}

function extractVerifyHintFromContinuity(
  continuity: SessionContinuitySnapshot | undefined,
  prefix: "verify-cwd-hint" | "verify-target-hint",
): string | undefined {
  if (!continuity) {
    return undefined;
  }
  const matcher = new RegExp(`^${prefix}:(.+)$`, "i");
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const match = entry.match(matcher);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return undefined;
}
