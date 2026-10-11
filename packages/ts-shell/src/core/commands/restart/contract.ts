export interface RestartRequest {
  readonly argv: readonly string[];
  readonly sessionId?: string;
  readonly workspaceRoot?: string;
  readonly workingDirectory?: string;
  readonly reason: 'user-command' | 'signal' | 'startup-recovery';
}

export type RestartOutcome =
  | { readonly status: 'requested'; readonly request: RestartRequest }
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'failed'; readonly reason: string };

/** Narrow bootstrap port: the owner must drain resources before rebuilding the runtime and reading back recovery. */
export interface RestartPort {
  request(request: RestartRequest): Promise<RestartOutcome>;
}

export function restartRequest(argv: readonly string[], sessionId?: string): RestartRequest {
  return { argv: [...argv], ...(sessionId ? { sessionId } : {}), reason: 'user-command' };
}
