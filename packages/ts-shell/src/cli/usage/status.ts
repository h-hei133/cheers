import { bind, checkBinding, type AccountUsageHost } from './binding.js';
import { readResetAttempts } from './state.js';
import type { ResetAttempt } from '../../core/auth/account/usage/model.js';
import { hashContent } from '../../core/workspace/files.js';
import { readOnlyTool } from '../../core/tools/capability.js';
import { runPreparedTool } from '../../turn/invoke.js';

const requestId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function unresolved(attempt: ResetAttempt): boolean { return attempt.status === 'pending' || attempt.status === 'unknown'; }
function display(accountKey: string, attempts: readonly ResetAttempt[], id?: string): string {
  const selected = id === undefined ? [...attempts].sort((a, b) => Number(unresolved(b)) - Number(unresolved(a))
    || Date.parse(b.createdAt) - Date.parse(a.createdAt)) : attempts.filter(attempt => attempt.id === id);
  const visible = selected.slice(0, 20);
  return [`Local reset receipts. Account digest: ${accountKey}`,
    'Saved local evidence only; the remote result was not checked by this command.',
    selected.length ? `Showing ${visible.length} of ${selected.length} retained requests. Use /usage reset status <request-id> to inspect one.`
      : id === undefined ? 'No retained reset requests for the selected account.' : 'No retained reset request matches this ID for the selected account.',
    ...visible.map(attempt => `Request ${requestId.test(attempt.id) ? attempt.id : `[unrecognized ID; digest ${hashContent(attempt.id)}]`}; local state ${attempt.status}; credit digest ${hashContent(attempt.credit.id)}; created ${new Date(attempt.createdAt).toISOString()}.`),
    attempts.some(unresolved) ? 'Further reset consumption is blocked by a pending or unknown request. Reconcile that exact request with the account service; this inspection leaves its fence intact.'
      : 'This inspection does not consume a credit or change a receipt.'].join('\n');
}

/** The original reader supplies bounded, validated records; no remote settlement is inferred. */
export async function inspectResetStatus(host: AccountUsageHost, id?: string): Promise<string> {
  const binding = bind(host, false);
  const observation = 'Local reset receipts were read. Details require the same selected account.';
  let details: string | undefined;
  const tool = readOnlyTool({ name: 'account_reset_status', description: 'Inspect saved local reset receipts for the selected account without contacting its service.',
    argsSchema: { type: 'object', additionalProperties: false },
    resultAdmission: () => {
      try { checkBinding(host, binding); return undefined; }
      catch { return 'Account request authority changed; local receipt details were withheld.'; }
    },
    async execute(_args, context) {
      context.abortSignal?.throwIfAborted(); checkBinding(host, binding);
      let attempts: readonly ResetAttempt[];
      try { attempts = readResetAttempts(binding.accountKey); }
      catch { throw new Error('Local reset receipts are unavailable or invalid; nothing was changed.'); }
      checkBinding(host, binding);
      // Hooks may await an account switch; keep receipt identities out of their output and events.
      details = display(binding.accountKey, attempts, id);
      return { success: true, output: observation };
    } });
  const result = await runPreparedTool(tool, {}, host.gate(tool.name), undefined, undefined, 'Reset receipts');
  if (result.isError || details === undefined) return result.output;
  checkBinding(host, binding);
  return result.output.replace(observation, details);
}
