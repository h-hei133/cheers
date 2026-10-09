export type GitArea = 'staged' | 'unstaged' | 'untracked';
export interface GitFile {
  readonly path: string;
  readonly originalPath?: string;
  readonly index: string;
  readonly worktree: string;
  readonly conflict: boolean;
  readonly submodule: boolean;
}
export interface GitSnapshot {
  readonly executionIdentity: string;
  readonly root: string;
  readonly gitDir: string;
  readonly commonDir: string;
  readonly head: string | null;
  readonly branch: string;
  readonly files: readonly GitFile[];
  readonly branches: readonly string[];
  readonly fingerprint: string;
  readonly unreadablePaths?: readonly string[];
}
export interface GitHunk {
  readonly id: string;
  readonly oldStart: number;
  readonly newStart: number;
  readonly header: string;
  readonly patch: string;
}
export interface GitDiff {
  readonly path: string;
  readonly area: GitArea;
  readonly snapshot: GitSnapshot;
  readonly text: string;
  readonly hunks: readonly GitHunk[];
  readonly binary: boolean;
  readonly limited: boolean;
  readonly hunkReason?: string;
}
