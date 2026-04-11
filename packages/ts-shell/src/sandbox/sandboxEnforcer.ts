import { SandboxPolicy, type PermissionCheck, type PolicyDecision } from './sandboxPolicy.js';
import { EscalationWorkflow, type EscalationPrompt, type EscalationResponse } from './escalationWorkflow.js';
import { AuditTrail } from './auditTrail.js';

export type { PermissionCheck, PolicyDecision, EscalationPrompt, EscalationResponse };

export interface SandboxEnforcerConfig {
  workspaceRoot: string;
  auditLogPath?: string;
  sessionId?: string;
  userId?: string;
}

export interface EnforcedPermissionResult {
  allowed: boolean;
  reason: string;
  wasEscalated: boolean;
  auditEntryId?: string;
}

export class SandboxEnforcer {
  private policy: SandboxPolicy;
  private escalation: EscalationWorkflow;
  private audit: AuditTrail;
  private config: SandboxEnforcerConfig;

  constructor(config: SandboxEnforcerConfig) {
    this.config = config;
    this.policy = new SandboxPolicy(config.workspaceRoot);
    this.escalation = new EscalationWorkflow();
    this.audit = new AuditTrail({
      logFilePath: config.auditLogPath,
    });
  }

  setEscalationPromptHandler(
    handler: (prompt: EscalationPrompt) => Promise<EscalationResponse>
  ): void {
    this.escalation.setPromptCallback(handler);
  }

  async checkAndEnforce(
    toolName: string,
    check: PermissionCheck
  ): Promise<EnforcedPermissionResult> {
    const policyDecision = this.policy.checkPermission(check);

    this.audit.logPermissionCheck(
      toolName,
      check.operation,
      check.target,
      policyDecision,
      this.config.sessionId
    );

    if (policyDecision.allowed) {
      return {
        allowed: true,
        reason: policyDecision.reason,
        wasEscalated: false,
      };
    }

    if (!policyDecision.requiresEscalation) {
      this.audit.logPolicyViolation(
        toolName,
        check.operation,
        check.target,
        'hard_deny',
        policyDecision.reason,
        this.config.sessionId
      );

      return {
        allowed: false,
        reason: policyDecision.reason,
        wasEscalated: false,
      };
    }

    this.audit.logEscalationRequest(
      toolName,
      check.operation,
      check.target,
      policyDecision,
      'pending',
      this.config.sessionId
    );

    const escalationResponse = await this.escalation.requestEscalation(
      toolName,
      check.operation,
      check.target,
      policyDecision
    );

    this.audit.logEscalationDecision(
      toolName,
      check.operation,
      check.target,
      escalationResponse,
      this.config.sessionId
    );

    const allowed = 
      escalationResponse.decision === 'allow' ||
      escalationResponse.decision === 'allow-once' ||
      escalationResponse.decision === 'allow-always';

    return {
      allowed,
      reason: allowed
        ? `Escalation approved: ${escalationResponse.decision}`
        : `Escalation denied by user. Review recent audit entries for details.`,
      wasEscalated: true,
    };
  }

  getAuditTrail(): AuditTrail {
    return this.audit;
  }

  getPolicy(): SandboxPolicy {
    return this.policy;
  }

  close(): void {
    this.audit.close();
    this.escalation.cancelPendingPrompts();
  }
}
