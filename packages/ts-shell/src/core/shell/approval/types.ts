export type PermissionBehavior = "allow" | "deny" | "ask";

export type PermissionRuleSource =
  | "userSettings"
  | "projectSettings"
  | "localSettings"
  | "cliArg"
  | "command"
  | "session";

export interface ApprovalTrustGrantView {
  readonly scope: string;
  readonly toolName: string;
  readonly selector: string;
  readonly persisted: boolean;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly source: PermissionRuleSource;
}

export interface ApprovalEvaluation {
  readonly behavior: PermissionBehavior;
  readonly granted: boolean;
  readonly reason: string;
  readonly matchedGrant?: ApprovalTrustGrantView;
}

export interface PersistedApprovalGrant {
  readonly scope: string;
  readonly toolName: string;
  readonly selector: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly source?: PermissionRuleSource;
}

export interface PersistedApprovalPolicyState {
  readonly version: 1;
  readonly grants: readonly PersistedApprovalGrant[];
  readonly lastUpdatedAt: string;
}

export interface ApprovalLastHit {
  readonly key: string;
  readonly timestamp: string;
  readonly behavior: PermissionBehavior;
}
