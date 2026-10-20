import type { FileState } from '../../authority/state.js';
import type { ProfileIdentity } from '../../../core/paths/profile/context.js';

export interface WorkspaceIdentity {
  readonly path: string;
  readonly identity: string;
}

export interface OperationScope {
  readonly sessionId: string;
  readonly workspace: WorkspaceIdentity;
  readonly profile?: ProfileIdentity;
}

export type ContentVersion = { readonly state: 'absent' } | { readonly state: 'exists'; readonly hash: string; readonly mode?: number };
export type OperationStatus = 'intent' | 'committed' | 'compensating' | 'restored' | 'failed' | 'partial' | 'unknown';
export type UndoStatus = 'none' | 'intent' | 'restored-verified' | 'partial' | 'unknown';

export interface OperationSelection {
  readonly fullRevision: string;
  readonly selectedRevision: string;
  readonly selectedGroupIds: readonly string[];
  readonly skippedGroupIds: readonly string[];
}

export interface OperationFile {
  readonly id: string;
  readonly workspace: WorkspaceIdentity;
  readonly path: string;
  readonly kind: 'create' | 'update' | 'delete';
  readonly before: ContentVersion;
  readonly after: ContentVersion;
  readonly snapshot: { readonly authorityId: string; readonly recordId: string };
  readonly status: 'pending' | 'committed' | 'unchanged' | 'unknown';
  readonly compensation?: 'intent' | 'restored-verified' | 'blocked' | 'unknown';
  readonly rename?: { readonly source: string; readonly target: string };
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
  readonly selection?: OperationSelection;
  readonly files: readonly OperationFile[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EditOperationIdentity {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly callId: string;
  readonly correlationId?: string;
  readonly selection?: OperationSelection;
}

export interface PreparedFile {
  readonly workspaceRoot: string;
  readonly workspaceIdentity?: string;
  readonly relativePath: string;
  readonly before: FileState;
  readonly content: string | undefined;
  /** Complete-read ceiling retained across approval, snapshots and commit checks. */
  readonly maxBytes?: number;
  readonly mode?: number;
  readonly rename?: OperationFile['rename'];
  readonly assertFileAccess?: (absolutePath: string) => void;
}

export interface PreparedOperation {
  readonly scope: OperationScope;
  readonly identity: EditOperationIdentity;
  readonly operationId: string;
  readonly files: readonly { readonly input: PreparedFile; readonly receipt: OperationFile }[];
}
