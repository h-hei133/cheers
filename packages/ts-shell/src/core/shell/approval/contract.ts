export type EscalationDecision = 'allow' | 'deny' | 'allow-once' | 'allow-always';

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
  context: {
    toolName: string;
    operation: string;
    target: string;
  };
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

