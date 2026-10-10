import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ModelAdmissionError, type RequestPolicy } from '../../core/agent/request/model.js';
import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { sessionRequestStore } from '../../session/store/requests.js';
import { requireValue } from '../../collaboration/contract/value.js';
import { collaborationHosts } from './state.js';
import type { CollaborationComposition } from './model.js';

export function collaborationAdmissionFor(context: ShellRuntimeContext, base?: () => string | undefined): () => string | undefined {
  const host = collaborationHosts.get(context); const active = host?.active;
  return () => {
    const blocked = base?.(); if (blocked || !active) return blocked;
    try { host!.host!.check(); requireValue(host!.active === active && !active.controller.signal.aborted && Date.now() < active.expiresAt, 'stale'); return undefined; }
    catch { return 'Remote acceptance authority was revoked, expired or changed.'; }
  };
}

/** A goal keeps its budget; otherwise the same session ledger meters the room/principal. */
export function collaborationPolicyFor(context: ShellRuntimeContext, policy: RequestPolicy | undefined): RequestPolicy | undefined {
  const host = collaborationHosts.get(context); const active = host?.active;
  if (!host || !active) return policy;
  const admission = collaborationAdmissionFor(context);
  if (!active.sourceEntryId) active.sourceEntryId = host.manager.getSession(context.session.id)?.turns.at(-1)?.id;
  const check = () => { if (admission()) throw new ModelAdmissionError('inactive'); };
  const base = policy ?? roomPolicy(host, active);
  const original = base.withAdmission?.(check) ?? base;
  return { reserve: request => {
    check();
    return original.reserve({ ...request, purpose: `${request.purpose}/collaboration/${active.acceptance.principal}/${active.acceptance.acceptanceId}` });
  }, withAdmission: extra => collaborationPolicyFor(context, original.withAdmission?.(() => { check(); extra(); }) ?? original)!,
  withCompletionReserve: reserve => collaborationPolicyFor(context, original.withCompletionReserve?.(reserve) ?? original)! };
}

function roomPolicy(host: CollaborationComposition, active: NonNullable<CollaborationComposition['active']>): RequestPolicy {
  const session = host.context.session;
  const root = captureWorkspaceRoot(host.context.projectRoot, host.context.projectRoot, 'read');
  const scope = { id: `collaboration/${active.acceptance.epoch}/${active.acceptance.roomId}/${active.acceptance.principal}`,
    workspacePath: root.path, workspaceIdentity: root.identity };
  return createRequestPolicy(sessionRequestStore(host.manager, session, scope, view => {
    const current = captureWorkspaceRoot(view.projectRoot, view.projectRoot, 'read');
    if (host.context.session.id !== session.id || host.context.session.createdAt !== session.createdAt
      || current.path !== root.path || current.identity !== root.identity) throw new ModelAdmissionError('inactive');
    return {};
  }), scope.id);
}
