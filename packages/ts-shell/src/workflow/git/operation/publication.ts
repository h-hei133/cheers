import type { GitOperationResult } from './model.js';

/** Receipt storage cannot change evidence of an already executed native effect. */
export function publishGitResult(result: GitOperationResult, publish: (result: GitOperationResult) => GitOperationResult | void): GitOperationResult {
  try { return publish(result) ?? result; }
  catch { return { ...result, durability: 'unknown', note: result.note + '\nGit operation receipt could not be durably saved; save outcome is unknown. Native outcome above is retained. No operation or save was retried.' }; }
}
