import type { Interface as ReadlineInterface } from "node:readline";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import {
  createCliEscalationPromptHandler,
  type ApprovalModeObject,
} from "../../entrypoints/cliApprovalModule.js";
import type { StreamingRenderer } from "../../renderer/StreamingRenderer.js";
import type { EscalationPrompt, EscalationResponse } from "../../sandbox/index.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { persistApprovalAuditDecision } from "./cliApprovalAuditBridge.js";

export function createCliApprovalEscalationBridge(input: {
  readonly renderer: StreamingRenderer;
  readonly readline: () => ReadlineInterface | null;
  readonly getViewMode: () => "compact" | "verbose";
  readonly trustPolicy: ApprovalTrustPolicy;
  readonly getProjectRoot: () => string;
  readonly getNonInteractiveDecision: () =>
    | "deny"
    | "allow-once"
    | "allow-always"
    | undefined;
  readonly getApprovalModeObject: () => ApprovalModeObject | undefined;
  readonly sessionManager: SessionManager;
  readonly getSessionId: () => string;
}): (prompt: EscalationPrompt) => Promise<EscalationResponse> {
  return createCliEscalationPromptHandler(
    input.renderer,
    input.readline(),
    input.getViewMode,
    input.trustPolicy,
    input.getProjectRoot,
    input.getNonInteractiveDecision,
    input.getApprovalModeObject,
    (record) => {
      persistApprovalAuditDecision({
        sessionManager: input.sessionManager,
        sessionId: input.getSessionId(),
        record,
      });
    },
  );
}
