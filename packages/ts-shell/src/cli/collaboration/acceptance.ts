import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { digest, keys, object, requireValue } from '../../collaboration/contract/value.js';
import type { Acceptance, Proposal } from '../../collaboration/contract/model.js';
import { collaborationHosts } from './state.js';
import { currentBinding } from './projection.js';
import type { CollaborationComposition } from './model.js';

/** Called immediately before the ordinary durable prompt barrier, including queued delivery. */
export async function admitCollaborationPrompt(context: ShellRuntimeContext, prompt: string, metadata: Record<string, unknown> | undefined, signal: AbortSignal): Promise<void> {
  if (!metadata?.collaboration) return;
  const record = object(metadata.collaboration); keys(record, ['version', 'origin', 'epoch', 'roomId', 'principal', 'generation', 'proposalId',
    'acceptanceId', 'digest', 'acceptedBy', 'sessionId', 'sessionCreatedAt', 'projectId']);
  const host = collaborationHosts.get(context); const acceptance = host?.accepted.get(String(record.acceptanceId));
  requireValue(host && host.host && acceptance && digest(acceptance) === digest(record), 'stale');
  requireValue(digest(currentBinding(host)) === digest({ sessionId: acceptance.sessionId, sessionCreatedAt: acceptance.sessionCreatedAt, projectId: acceptance.projectId })
    && acceptance.digest === digest({ kind: 'ask', text: prompt, target: undefined }) && !host.active, 'stale');
  signal.throwIfAborted(); host.host.check();
  // Consume locally before the request so an unknown dispatch can never be submitted twice.
  host.accepted.delete(acceptance.acceptanceId);
  const response = await host.host.request('dispatch', { acceptanceId: acceptance.acceptanceId, digest: acceptance.digest });
  const result = object(response.result); signal.throwIfAborted();
  requireValue(result.acceptanceId === acceptance.acceptanceId && result.principal === acceptance.principal && result.kind === 'ask'
    && result.generation === acceptance.generation && result.status === 'dispatched', 'stale');
  const controller = host.runtime.getCurrentRunController(); requireValue(controller?.signal === signal, 'stale');
  host.active = { acceptance, controller, expiresAt: Number(result.expiresAt) };
}
export function updateCollaborationAdmission(host: CollaborationComposition, proposals: readonly Omit<Proposal, 'text'>[], expiresAt: number): void {
  host.proposals = proposals;
  const active = host.active;
  if (active) {
    const proposal = proposals.find(item => item.acceptanceId === active.acceptance.acceptanceId);
    if (proposal?.status !== 'dispatched' || proposal.generation !== active.acceptance.generation || proposal.principal !== active.acceptance.principal) active.controller.abort();
    else active.expiresAt = expiresAt;
  }
}
export function invalidateCollaborationAdmission(host: CollaborationComposition): void {
  host.accepted.clear(); host.active?.controller.abort();
}
export async function settleCollaborationRun(host: CollaborationComposition, outcome: 'completed' | 'failed' | 'cancelled' | 'unknown'): Promise<void> {
  const active = host.active; if (!active) return;
  // Clear before awaiting; a delayed settlement never owns a later local run.
  host.active = undefined;
  try { await host.host?.request('settle', { acceptanceId: active.acceptance.acceptanceId, outcome,
    ...(active.sourceEntryId ? { sourceEntryId: active.sourceEntryId } : {}) }); } catch { /* Service retains dispatched/unknown; no replay or manufactured completion. */ }
}
export async function settleCollaborationPrompt(context: ShellRuntimeContext, metadata: Record<string, unknown> | undefined, signal: AbortSignal,
  outcome: 'completed' | 'failed' | 'cancelled' | 'unknown'): Promise<void> {
  const host = collaborationHosts.get(context); const origin = metadata?.collaboration as Partial<Acceptance> | undefined;
  if (host?.active && host.active.controller.signal === signal && host.active.acceptance.acceptanceId === origin?.acceptanceId)
    await settleCollaborationRun(host, outcome);
}
