export interface PlanScope {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: { readonly path: string; readonly identity: string };
}

export interface PlanPorts {
  readonly isRecord: (value: unknown) => value is Record<string, unknown>;
  readonly freeze: <T>(value: T) => T;
}

export type PlanCriterion = {
  readonly id: string;
  readonly kind: 'command';
  readonly command: string;
  readonly commandDigest: string;
  readonly targets: readonly string[];
  readonly implementation: boolean;
} | {
  readonly id: string;
  readonly kind: 'artifact';
  readonly path: string;
  readonly expected: string | 'absent';
  readonly implementation: boolean;
};
export interface PlanDraft extends PlanScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly text: string;
  readonly criteria: readonly PlanCriterion[];
  readonly phase: 'draft' | 'approved' | 'rejected' | 'executing';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly goal?: { readonly id: string; readonly definitionDigest: string };
  readonly sourcePromptEntryId?: string;
  readonly approval?: { readonly version: string; readonly timestamp: string; readonly source: 'user' };
}
export class PlanError extends Error {
  constructor(readonly reason: 'invalid' | 'stale' | 'unavailable' | 'unapproved' | 'busy') {
    super(`Plan ${reason}.`); this.name = 'PlanError';
  }
}
