export type EscalationDecision = 'allow' | 'deny' | 'allow-once' | 'allow-always';

export interface EscalationResponse {
  promptId: string;
  decision: EscalationDecision;
  respondedAt: number;
  userComment?: string;
  /** Group ids the user approved; absent means the host collected no selection. */
  selected?: readonly string[];
}

export interface EscalationPrompt {
  id: string;
  title: string;
  message: string;
  context: {
    toolName: string;
    operation: string;
    target: string;
    /** A complete read-only approval preview; closing it never approves effects. */
    preview?: string;
    previewKind?: 'file-plan' | 'execution';
    selections?: readonly { readonly id: string; readonly label: string; readonly files?: readonly string[] }[];
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
