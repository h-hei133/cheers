import type { PolicyDecision } from './sandboxPolicy.js';

export type EscalationDecision = 'allow' | 'deny' | 'allow-once' | 'allow-always';

export interface EscalationRequest {
  promptId: string;
  policyDecision: PolicyDecision;
  context: {
    toolName: string;
    operation: string;
    target: string;
  };
  requestedAt: number;
}

export interface EscalationResponse {
  promptId: string;
  decision: EscalationDecision;
  respondedAt: number;
  userComment?: string;
}

export interface EscalationPrompt {
  id: string;
  title: string;
  message: string;
  options: EscalationOption[];
  defaultOption: EscalationDecision;
  recommendedAction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface EscalationOption {
  value: EscalationDecision;
  label: string;
  description: string;
}

export class EscalationWorkflow {
  private pendingPrompts: Map<string, EscalationRequest> = new Map();
  private onPromptCallback?: (prompt: EscalationPrompt) => Promise<EscalationResponse>;

  setPromptCallback(callback: (prompt: EscalationPrompt) => Promise<EscalationResponse>): void {
    this.onPromptCallback = callback;
  }

  async requestEscalation(
    toolName: string,
    operation: string,
    target: string,
    policyDecision: PolicyDecision
  ): Promise<EscalationResponse> {
    const promptId = this.generatePromptId();
    const request: EscalationRequest = {
      promptId,
      policyDecision,
      context: { toolName, operation, target },
      requestedAt: Date.now(),
    };

    this.pendingPrompts.set(promptId, request);

    try {
      const prompt = this.buildPrompt(request);
      
      if (!this.onPromptCallback) {
        return {
          promptId,
          decision: 'deny',
          respondedAt: Date.now(),
          userComment: 'No prompt callback configured - auto-denying for safety',
        };
      }

      const response = await this.onPromptCallback(prompt);
      return response;
    } finally {
      this.pendingPrompts.delete(promptId);
    }
  }

  private buildPrompt(request: EscalationRequest): EscalationPrompt {
    const { policyDecision, context } = request;
    
    const severity = this.calculateSeverity(context.operation, context.target);
    
    return {
      id: request.promptId,
      title: `Permission escalation required`,
      message: this.formatMessage(policyDecision, context),
      options: [
        {
          value: 'deny',
          label: 'Deny',
          description: 'Block this operation',
        },
        {
          value: 'allow-once',
          label: 'Allow Once',
          description: 'Allow this operation this time only',
        },
        {
          value: 'allow-always',
          label: 'Allow Always',
          description: 'Add permission rule to always allow similar operations',
        },
      ],
      defaultOption: 'deny',
      recommendedAction: this.recommendedActionFor(severity),
      severity,
    };
  }

  private formatMessage(decision: PolicyDecision, context: { toolName: string; operation: string; target: string }): string {
    const lines: string[] = [];
    const severity = this.calculateSeverity(context.operation, context.target);
    
    lines.push(`Risk level: ${severity.toUpperCase()}`);
    lines.push(`Tool: ${context.toolName}`);
    lines.push(`Requested action: ${context.operation}`);
    lines.push(`Target: ${context.target}`);
    lines.push('');
    lines.push(`Why it was blocked: ${decision.reason}`);
    
    if (decision.policyRule) {
      lines.push(`Policy rule: ${decision.policyRule}`);
    }

    lines.push('');
    lines.push(`Recommended default: ${this.recommendedActionFor(severity)}`);
    
    return lines.join('\n');
  }

  private recommendedActionFor(severity: 'low' | 'medium' | 'high' | 'critical'): string {
    if (severity === 'critical' || severity === 'high') {
      return 'Deny unless you fully trust this operation and understand the target.';
    }

    if (severity === 'medium') {
      return 'Prefer Allow Once if you need this operation for the current task only.';
    }

    return 'Allow Once is usually safer than Allow Always for exploratory work.';
  }

  private calculateSeverity(operation: string, target: string): 'low' | 'medium' | 'high' | 'critical' {
    if (target.toLowerCase().includes('system32') || 
        target.toLowerCase().includes('/etc/') ||
        operation === 'execute') {
      return 'critical';
    }
    
    if (operation === 'write' || operation === 'delete') {
      return 'high';
    }
    
    if (operation.startsWith('network')) {
      return 'medium';
    }
    
    return 'low';
  }

  private generatePromptId(): string {
    return `esc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  getPendingPrompts(): EscalationRequest[] {
    return Array.from(this.pendingPrompts.values());
  }

  cancelPendingPrompts(): void {
    this.pendingPrompts.clear();
  }
}
