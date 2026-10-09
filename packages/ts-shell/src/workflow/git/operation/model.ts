import type { GitSnapshot } from '../read/model.js';
import type { CommandExecutionResult } from '../../../runtime/execution/service.js';
export type GitOperationStatus = 'prepared' | 'permission-pending' | 'denied' | 'blocked' | 'succeeded' | 'failed' | 'partial' | 'unknown';
export interface GitOperationResult {
  readonly status: GitOperationStatus;
  readonly note: string;
  readonly hash?: string;
  readonly receipts?: readonly CommandExecutionResult['receipt'][];
  readonly target?: string;
  readonly durability?: 'unknown';
}
export interface GitPlan {
  readonly id: string;
  readonly snapshot: GitSnapshot;
  readonly summary: string;
  readonly preview: string;
  readonly targets: readonly string[];
  readonly args: readonly string[];
  readonly input?: Buffer;
  readonly sources?: readonly string[];
  /** Exact native checkout paths; approval grants no persistent file-tool root. */
  readonly nativeTargets?: readonly string[];
  readonly run?: (signal?: AbortSignal) => Promise<GitOperationResult>;
  readonly commitIndex?: string;
  readonly remote?: { readonly url: string; readonly ref: string; readonly before: string | null; readonly desired: string };
}
