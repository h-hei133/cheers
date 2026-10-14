export interface UsageWindow {
  readonly name: 'primary' | 'secondary';
  readonly usedPercent: number;
  readonly resetsAt?: string;
}
export interface ResetCredit {
  readonly id: string;
  readonly resetType: string;
  readonly expiresAt: string;
}
export interface AccountUsage {
  readonly source: string;
  readonly fetchedAt: string;
  readonly windows: readonly UsageWindow[];
  readonly credits: readonly ResetCredit[];
  readonly availableCount?: number;
  readonly creditStatus: 'available' | 'unsupported' | 'unavailable';
}
export interface ResetAttempt {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly accountKey: string;
  readonly credentialKey: string;
  readonly sessionId: string;
  readonly credit: ResetCredit;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: 'prepared' | 'pending' | 'reset' | 'refused' | 'unknown';
  readonly code?: 'reset' | 'no_credit' | 'nothing_to_reset' | 'already_redeemed';
}
