import type { RouteScopedEditJournalOperationKind } from "../result/journal/model.js";

export type RecoveryAuthorityBeforeState = "exists" | "absent";
export type RecoveryAuthorityExpectedCurrentState =
  | "exists"
  | "absent"
  | "unknown";

export interface RecoveryOperationBinding {
  readonly operationId: string;
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceIdentity: string;
}

export interface RecoveryAuthorityStoredRecord {
  readonly operation?: RecoveryOperationBinding;
  readonly schemaVersion: 1;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRelativePath: string;
  readonly operationKind: RouteScopedEditJournalOperationKind;
  readonly beforeState: RecoveryAuthorityBeforeState;
  readonly beforeContentHash?: string;
  readonly beforeContentSizeBytes?: number;
  readonly beforeMode?: number;
  readonly beforeContentRef?: string;
  readonly expectedCurrentState: RecoveryAuthorityExpectedCurrentState;
  readonly expectedCurrentContentHash?: string;
  readonly expectedCurrentMode?: number;
  readonly capturedAtPhase: "pre-write";
  readonly persistence: "non-default";
  readonly createdAt: string;
  readonly evidence: readonly string[];
}
