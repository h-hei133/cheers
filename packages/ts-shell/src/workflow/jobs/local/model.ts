import type { ExecutionAuthority, CommandExecutionResult } from '../../../runtime/execution/types.js';
import type { LocalJob } from '../model.js';

export interface BackgroundTask {
  readonly id: string;
  readonly command: string;
  readonly cwd: string;
  readonly pid: number | undefined;
  readonly startedAt: number;
  readonly state: 'queued' | 'paused' | 'starting' | 'running' | 'exited' | 'killed' | 'unknown';
  readonly exitCode?: number;
  readonly output: string;
  readonly outputTruncated?: boolean;
  readonly outputPath?: string;
  readonly failure?: string;
}
export interface BackgroundInput {
  readonly command: string;
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly shell?: { readonly command: string; readonly args: readonly string[] };
  readonly timeoutMs?: number;
  readonly authority?: ExecutionAuthority;
}
export interface BackgroundRunner {
  start(input: BackgroundInput): BackgroundTask;
  /**
   * Own a child that was spawned for a foreground wait.
   *
   * The process is not spawned again; the same PID becomes a provisional task
   * that can be promoted to a durable job before the wait gives up. Adopting a
   * command that finishes in the foreground leaves no journal entry.
   */
  adopt?(handle: import('../../../runtime/execution/types.js').LocalExecutionHandle, input: BackgroundInput): BackgroundTask;
  /** Promote a provisional task to a durable job; false when capacity refused it. */
  promote?(id: string): boolean;
  list(): readonly BackgroundTask[];
  get(id: string): BackgroundTask | undefined;
  stop(id: string): Promise<boolean>;
  onEnded(listener: (task: BackgroundTask) => void): () => void;
}
/** Internal live capability. A durable row alone implements none of these operations. */
export interface LocalJournalPort {
  get(id: string): LocalJob;
  list(): readonly LocalJob[];
  create(input: BackgroundInput): string;
  /** Create, arm and mark a known live PID for a promoted foreground child. */
  promote(id: string, input: BackgroundInput, pid: number | undefined): void;
  arm(id: string): void;
  started(id: string): void;
  output(id: string, stream: 'stdout' | 'stderr', chunk: Buffer): void;
  finish(id: string, result: Pick<CommandExecutionResult, 'status' | 'exitCode' | 'terminationFailed' | 'outputFailed' | 'spawnErrorCode'>): void;
  unverified(id: string): void;
  admission(id: string): string | undefined;
}
