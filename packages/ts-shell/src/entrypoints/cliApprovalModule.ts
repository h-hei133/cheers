import type { Interface as ReadlineInterface } from "node:readline";
import { ApprovalTrustPolicy } from "../core/shell/approvalTrustPolicy.js";
import { applyInteractiveApprovalDecisionWiring } from "../core/shell/interactiveApprovalWiring.js";
import { StreamingRenderer } from "../presentation/terminal/streaming.js";
import type { EscalationPrompt, EscalationResponse } from "../core/shell/approval/contract.js";
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
  formatApprovalDecisionLine,
  formatApprovalPromptDecisionMenuLine,
  formatDefaultNonInteractiveDenyLine,
  formatExplicitApprovalComment,
  formatNonInteractiveApprovalComment,
  formatNonInteractiveApprovalPolicyLine,
  formatTrustPolicyUpdatedLine,
  renderApprovalAuditSurface,
  renderApprovalRequiredSurface,
  renderCachedApprovalSurface,
  type ApprovalAuditRecord,
  type ApprovalDecisionSource,
} from "./approvalPromptBridge.js";


interface NonInteractiveApprovalDecisionPlan {
  readonly source: ApprovalDecisionSource;
  readonly decision: "deny" | "allow-once" | "allow-always";
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
  // Compatibility slot for older callers; prompt hints carry no authority.
  _legacyApprovalHint?: () => unknown,
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
    hasAllowOnceCache: boolean;
    hasAllowAlwaysGrant: boolean;
  }): NonInteractiveApprovalDecisionPlan {
    if (input.cliDecision) return { source: "cli-policy", decision: input.cliDecision };
    if (input.hasAllowOnceCache) return { source: "allow-once-cache", decision: "allow-once" };
    if (input.hasAllowAlwaysGrant) return { source: "allow-always-policy", decision: "allow-always" };
    return { source: "default-deny", decision: "deny" };
  }

  return async (prompt) => {
    const projectRoot = getProjectRoot();
    const evaluation = trustPolicy.evaluate(prompt, projectRoot);
    const isNonInteractive = rl === null && !promptInteractiveApproval;
    const requiresSelection = Boolean(prompt.context.selections?.length);
    const requiresAnswer = requiresSelection || prompt.context.explicitApproval === true;
    const cliNonInteractiveDecision = isNonInteractive && !requiresAnswer
      ? getNonInteractiveDecision?.()
      : undefined;
    const hasAllowOnceCache = !requiresAnswer && trustPolicy.hasAllowOnce(evaluation.cacheKey);
    const hasAllowAlwaysGrant = !requiresAnswer && Boolean(evaluation.matchedGrant);
    const hasCachedGrant = hasAllowOnceCache || hasAllowAlwaysGrant;
    // A session scope answers before anything is put to the user, and only in the
    // interactive channel: the non-interactive path has its own explicit policy,
    // and letting a display-level setting speak for it would hide which authority
    // actually decided.
    const scope = requiresAnswer ? "ask" : getPermissionScope?.() ?? "ask";
    const scopeDecision = isNonInteractive || requiresAnswer ? undefined : scopeAnswer(scope, prompt);
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

    if (requiresSelection && !promptInteractiveApproval) {
      renderApprovalRequiredSurface(renderer, {
        prompt,
        includeRisk: true,
        decisionSource: "selection-host-unavailable",
        lines: ["- Exact patch group selection requires an interactive group picker."],
      });
      emitApprovalAudit({
        channel: isNonInteractive ? "non-interactive" : "interactive",
        decision: "deny",
        decisionSource: "selection-host-unavailable",
        persistent: false,
        cacheEffect: "none",
        projectRoot,
        cacheKey: evaluation.cacheKey,
        scopeLabel: evaluation.scopeLabel,
      });
      renderer.renderLine("");
      return createApprovalResponse({
        promptId: prompt.id,
        decision: "deny",
        userComment: "CLI exact selection blocked: no interactive group-selection host is available.",
      });
    }

    if (!requiresAnswer && isNonInteractive) {
      const nonInteractiveDecisionPlan = resolveNonInteractiveApprovalDecision({
        cliDecision: cliNonInteractiveDecision,
        hasAllowOnceCache,
        hasAllowAlwaysGrant,
      });
      renderApprovalRequiredSurface(renderer, {
        prompt,
        includeRisk: true,
        decisionSource: nonInteractiveDecisionPlan.source,
      });
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

    if (!requiresAnswer && hasAllowOnceCache) {
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
    if (!requiresAnswer && evaluation.matchedGrant) {
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
    let selected: readonly string[] | undefined;
    let selectionRevision: string | undefined;
    if (isNonInteractive) {
      decision = "deny";
      decisionInputKey = "n";
      renderer.renderLine(formatDefaultNonInteractiveDenyLine());
    } else if (promptInteractiveApproval) {
      try {
        const res = await promptInteractiveApproval(prompt);
        if (typeof res === "object" && res !== null) {
          decision = res.decision;
          denialReason = res.reason;
          if (decision !== "deny") {
            selected = res.selected;
            selectionRevision = res.selectionRevision;
          }
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

    if (prompt.context.toolName === "apply_patch" && decision === "allow-always") {
      decision = "deny";
      decisionInputKey = "n";
      denialReason = "apply_patch requires an exact one-time group selection; allow-always is not available.";
    }
    // A tool from an extension has no argument contract this program can read,
    // so a remembered grant could only be keyed on its name — and would then
    // cover every later call with any arguments. One-time approval is the most
    // that can be promised truthfully.
    if (prompt.context.toolName.startsWith("mcp__") && decision === "allow-always") {
      decision = "allow-once";
      decisionInputKey = "y";
      denialReason = "This tool comes from an extension; the grant covers this call only.";
    }
    if (prompt.context.explicitApproval && (decision === 'allow-always'
      || !prompt.options.some(option => option.value === decision))) {
      decision = 'deny'; decisionInputKey = 'n';
      denialReason = 'This call requires one-time approval; no persistent grant was saved.';
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
            hasApprovalModeObject: false,
          }),
      ...(selected ? { selected } : {}),
      ...(selectionRevision ? { selectionRevision } : {}),
    });
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
