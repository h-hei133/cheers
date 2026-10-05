import { networkFailure } from '../../network/error.js';
import { deniedResult } from '../toolResultLifecycle.js';
import type { ToolExecutionResult } from '../../../tools/types.js';

export type WebSource = 'fetch' | 'exa' | 'tavily' | 'keyless';

export function webFailure(source: WebSource, error: unknown): ToolExecutionResult {
  const failure = networkFailure(error);
  const refusal = source === 'fetch' && failure.code === 'denied' ? ' (refusing to fetch a disallowed URL)' : '';
  return deniedResult(`Web ${source} failed: ${failure.code}${failure.status === undefined ? '' : ` (HTTP ${failure.status})`}${refusal}.`,
    { network: { source, ...failure } });
}
