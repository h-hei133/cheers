import { randomUUID } from 'node:crypto';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CompactionSetup } from '../../turn/session.js';
import { withProviderConnections, type ProviderConnectionLifetime } from '../../provider/request/connection.js';

/** One resource owner holds its controller; there is no process-wide owner registry. */
export function createProviderConnections(context: ShellRuntimeContext) {
  let current: { readonly binding: string; readonly controller: AbortController; readonly lifetime: ProviderConnectionLifetime } | undefined;
  const binding = () => JSON.stringify([context.session.id, context.session.createdAt, context.projectRoot, context.cwd,
    context.workspaceRevision, context.profile?.id, context.profile?.rootIdentity]);
  const reset = (): 'reset' | 'unchanged' => {
    if (!current) return 'unchanged';
    current.controller.abort();
    current = undefined;
    return 'reset';
  };
  const capture = (): ProviderConnectionLifetime => {
    const identity = binding();
    if (!current || current.binding !== identity) {
      reset();
      const controller = new AbortController();
      current = { binding: identity, controller, lifetime: Object.freeze({ id: randomUUID(), signal: controller.signal }) };
    }
    return current.lifetime;
  };
  const run = <T>(operation: () => T): T => withProviderConnections(capture(), operation);
  const compaction = (setup: CompactionSetup, scope: ProviderConnectionLifetime): CompactionSetup => {
    const summarize = setup.summarize;
    const prefix = setup.summarizeTurnPrefix;
    return { ...setup,
      summarize: Object.assign((...args: Parameters<typeof summarize>) => withProviderConnections(scope, () => summarize(...args)),
        { dispatchAware: summarize.dispatchAware, preflight: summarize.preflight }),
      ...(prefix ? { summarizeTurnPrefix: Object.assign((...args: Parameters<typeof prefix>) => withProviderConnections(scope, () => prefix(...args)),
        { dispatchAware: prefix.dispatchAware, preflight: prefix.preflight }) } : {}),
    };
  };
  return { reset, capture, run, compaction };
}
