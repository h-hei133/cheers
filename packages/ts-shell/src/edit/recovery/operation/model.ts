export interface WorkspaceIdentity {
  readonly path: string;
  readonly identity: string;
}

export interface OperationScope {
  readonly sessionId: string;
  readonly workspace: WorkspaceIdentity;
}

export type ContentVersion = { readonly state: 'absent' } | { readonly state: 'exists'; readonly hash: string };
export type OperationStatus = 'intent' | 'committed' | 'failed' | 'partial' | 'unknown';
export type UndoStatus = 'none' | 'intent' | 'restored-verified' | 'partial' | 'unknown';

export interface OperationFile {
  readonly id: string;
  readonly workspace: WorkspaceIdentity;
  readonly path: string;
  readonly kind: 'create' | 'update' | 'delete';
  readonly before: ContentVersion;
  readonly after: ContentVersion;
  readonly snapshot: { readonly authorityId: string; readonly recordId: string };
  readonly status: 'pending' | 'committed' | 'unchanged' | 'unknown';
  readonly undo: 'none' | 'intent' | 'restored-verified' | 'blocked' | 'unknown';
}

/** An intent survives crashes. Only a verified commit enters the normal undo stack. */
export interface OperationReceipt extends OperationScope {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly callId: string;
  readonly correlationId?: string;
  readonly sequence: number;
  readonly revision: number;
  readonly status: OperationStatus;
  readonly undo: UndoStatus;
  readonly files: readonly OperationFile[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EditOperationIdentity {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly callId: string;
  readonly correlationId?: string;
}
