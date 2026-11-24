import type { Interface as ReadlineInterface } from "node:readline";

import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import {
  createCliEscalationPromptHandler,
} from "../../entrypoints/cliApprovalModule.js";
import type { PermissionScope } from "./permissionScope.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import type { ApprovalInteraction, EscalationPrompt, EscalationResponse } from "../../core/shell/approval/contract.js";
import type { SessionManager } from "../../session/SessionManager.js";
import { persistApprovalAuditDecision } from "./cliApprovalAuditBridge.js";
import type { InteractiveApprovalResult } from "../interactive/picker/approval.js";
import type {SessionStateSnapshot} from '../../session/schema/sessionStateSnapshot.js';
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
  readonly sessionManager: SessionManager;
  readonly auditPublication?: (snapshot: SessionStateSnapshot, publish: () => void) => void;
  readonly getSessionId: () => string;
  /** How much the session may do before it has to ask. */
  readonly getPermissionScope?: () => PermissionScope;
  readonly promptInteractiveApproval?: (
    prompt: EscalationPrompt,
    signal?: AbortSignal,
  ) => Promise<InteractiveApprovalResult>;
}): (prompt: EscalationPrompt, interaction?: ApprovalInteraction) => Promise<EscalationResponse> {
  return createCliEscalationPromptHandler(
    input.renderer,
    input.readline(),
    input.getViewMode,
    input.trustPolicy,
    input.getProjectRoot,
    input.getNonInteractiveDecision,
    undefined,
    (record) => {
      persistApprovalAuditDecision({
        sessionManager: input.sessionManager,
        sessionId: input.getSessionId(),
        record,
        publication:input.auditPublication,
      });
    },
    input.getPermissionScope,
    input.promptInteractiveApproval,
  );
}
