import { sameValue } from '../../../config/values.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import type { BoundSessionScope } from '../../../session/store/contract.js';
import type { OperationReceipt } from '../../../edit/recovery/operation/model.js';
import { nativeProof } from './codec.js';
import { textDigest } from '../../plan/codec.js';
import { observeTargets, matchingOperations } from './targets.js';
import type { AcceptanceState, AcceptanceEvidence } from './model.js';

export function acceptanceEvidence(acceptance: AcceptanceState, scope: BoundSessionScope, events: readonly TranscriptEvent[],
  operations: readonly OperationReceipt[], access: (absolute: string) => void): readonly AcceptanceEvidence[] | undefined {
  const since = events.filter(event => Date.parse(event.timestamp) >= Date.parse(acceptance.approvedAt));
  // A compensated event is written by recovery for a call the run never
  // settled; it records that the outcome is unknown, not that the work failed
  // and not that the user refused it. Counting it as evidence would block a
  // goal forever after a crash the user recovered from.
  const blocks = (inner: { readonly type: string }): boolean => {
    if (inner.type === 'tool.result') {
      const result = inner as { readonly success?: boolean; readonly compensated?: boolean };
      return result.success !== true && result.compensated !== true;
    }
    if (inner.type === 'approval.resolved') {
      const resolution = inner as { readonly outcome?: string; readonly compensated?: boolean };
      return resolution.outcome !== 'approved' && resolution.compensated !== true;
    }
    return inner.type === 'lifecycle.cancelled' || inner.type === 'query.failed' || inner.type === 'lifecycle.error';
  };
  if (since.some(event => event.type === 'query-event' && blocks(event.event))) return undefined;
  const result: AcceptanceEvidence[] = [];
  for (const criterion of acceptance.criteria) {
    const check = criterion.kind === 'command' ? acceptance.checks[criterion.id] : undefined;
    if (criterion.kind === 'command' && (!check || !check.known || check.native.status !== 'completed' || check.native.exitCode !== 0
      || check.native.commandDigest !== criterion.commandDigest || check.native.sessionId !== scope.sessionId
      || !sameValue(check.native.cwd, scope.workspace) || Date.parse(check.native.startedAt) < Date.parse(acceptance.approvedAt))) return undefined;
    const targets = observeTargets(scope.workspace.path, criterion.kind === 'command' ? criterion.targets : [criterion.path], access);
    if (check) {
      if (!sameValue(targets, check.targets) || operations.some(operation => operation.sequence > check.operationSequence
        && operation.files.some(file => targets.some(target => target.path === file.path)))) return undefined;
      const originals = events.filter(event => event.type === 'query-event' && event.event.type === 'execution.command'
        && event.event.proof.invocationId === check.native.invocationId);
      if (originals.length !== 1 || originals[0]?.type !== 'query-event' || originals[0].event.type !== 'execution.command'
        || !nativeProof(originals[0].event.proof) || !sameValue(originals[0].event.proof, check.native)
        || originals[0].sourceEntryId !== check.sourcePromptEntryId || originals[0].event.sourcePromptEntryId !== check.sourcePromptEntryId
        || !events.some(event => event.type === 'message' && event.role === 'user' && event.id === check.sourcePromptEntryId)) return undefined;
      const calls = since.flatMap(event => event.type === 'message' && event.role === 'assistant' ? event.tool_calls ?? [] : [])
        .filter(call => call.id === check.native.callId);
      const results = since.filter(event => event.type === 'message' && event.role === 'tool' && event.tool_call_id === check.native.callId);
      if (calls.length !== 1 || results.length !== 1 || calls[0]!.function.name !== 'bash') return undefined;
      let args: unknown; try { args = JSON.parse(calls[0]!.function.arguments); } catch { return undefined; }
      if (!args || typeof args !== 'object' || !('command' in args) || typeof args.command !== 'string'
        || textDigest(args.command) !== check.native.commandDigest) return undefined;
    } else if (criterion.kind === 'artifact') {
      const observed = targets[0]!.version;
      if (criterion.expected === 'absent' ? observed.state !== 'absent' : observed.state !== 'exists' || observed.hash !== criterion.expected) return undefined;
    }
    const receipts = criterion.implementation ? matchingOperations(operations, acceptance.operationBaseline, targets) : [];
    if (!receipts || receipts.some(receipt => !receipt.correlationId || !events.some(event => event.type === 'message' && event.id === receipt.correlationId
      && event.role === 'user' && Date.parse(event.timestamp) >= Date.parse(acceptance.approvedAt)
      && (event.metadata?.source === 'plan-execution' && event.metadata.planVersion === acceptance.planVersion
        || event.metadata?.source === 'goal-continuation' && event.metadata.goalId === acceptance.goalId)))) return undefined;
    result.push({ criterionId: criterion.id, kind: criterion.kind, targets, operationReceipts: receipts.map(receipt =>
      ({ operationId: receipt.operationId, revision: receipt.revision, sequence: receipt.sequence })),
    ...(check ? { native: check.native, sourcePromptEntryId: check.sourcePromptEntryId } : {}) });
  }
  return result;
}
