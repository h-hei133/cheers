import { sameValue } from '../../../config/values.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import type { TranscriptEvent } from '../../../session/sessionEventCodec.js';
import type { QueryEvent } from '../../../core/query/runtime/events.js';
import { publishBoundSessionState, readBoundSessionState, type BoundSessionHost } from '../../../session/store/bound.js';
import type { CommandProofObserver, NativeCommandProof } from '../../../runtime/execution/proof.js';
import { decodePlan, planVersion } from '../../plan/codec.js';
import { decodeGoal } from '../codec.js';
import { goalDefinition } from './definition.js';
import { decodeAcceptance } from './codec.js';
import { observeTargets, scopedOperations, operationSequence } from './targets.js';
import type { TargetObservation } from './model.js';

interface CaptureHost extends BoundSessionHost {
  getTranscriptEvents(sessionId: string): readonly TranscriptEvent[];
  appendQueryEvent(sessionId: string, event: QueryEvent, source?: { readonly entryId?: string }): void;
}
/** The callback is supplied only to the native tool boundary, before result shaping/hooks. */
export function acceptanceCapture(host: CaptureHost, session: Session, sourcePromptEntryId: string, goalId?: string): CommandProofObserver {
  return {
    started(native, access) {
      try {
        const bound = readBoundSessionState(host, session); const acceptance = decodeAcceptance(bound.state.goalAcceptance);
        const plan = decodePlan(bound.state.plan); const goal = decodeGoal(bound.state.goal);
        const origins = host.getTranscriptEvents(session.id).filter(event => event.type === 'message' && event.id === sourcePromptEntryId);
        const origin = origins.length === 1 && origins[0]?.type === 'message' ? origins[0] : undefined;
        if (!acceptance || !plan || plan.phase !== 'executing' || !goal || goal.id !== goalId || goal.id !== acceptance.goalId
          || goalDefinition(goal) !== acceptance.definitionDigest || planVersion(plan) !== acceptance.planVersion
          || native.sessionId !== bound.scope.sessionId || !sameValue(native.cwd, bound.scope.workspace) || !access
          || !acceptance.criteria.some(criterion => criterion.kind === 'command' && criterion.commandDigest === native.commandDigest)) return;
        if (origin?.role !== 'user' || !(origin.metadata?.source === 'plan-execution' && origin.metadata.planVersion === acceptance.planVersion
          || origin.metadata?.source === 'goal-continuation' && origin.metadata.goalId === acceptance.goalId)) return;
        const targets: Record<string, readonly TargetObservation[]> = {}; let known = true;
        for (const criterion of acceptance.criteria) {
          if (criterion.kind !== 'command' || criterion.commandDigest !== native.commandDigest) continue;
          try { targets[criterion.id] = observeTargets(bound.scope.workspace.path, criterion.targets, access); }
          catch { known = false; }
        }
        publishBoundSessionState(host, session, bound, (current, previous) => sameValue(current.goalAcceptance, previous.goalAcceptance)
          && sameValue(current.plan, previous.plan) && sameValue(current.goal, previous.goal), state => {
          if (acceptance.pending[native.invocationId] || Object.keys(acceptance.pending).length >= 64) throw new Error('Native invocation cannot be replayed.');
          return { ...state, goalAcceptance: { ...acceptance, pending: { ...acceptance.pending,
            [native.invocationId]: { native, sourcePromptEntryId, targets, known } } } };
        });
      } catch { /* Unpublished evidence is unknown and cannot pass acceptance. */ }
    },
    settled(native, access) {
      host.appendQueryEvent(session.id, { type: 'execution.command', proof: native, sourcePromptEntryId }, { entryId: sourcePromptEntryId });
      try {
        const bound = readBoundSessionState(host, session); const acceptance = decodeAcceptance(bound.state.goalAcceptance);
        const pending = acceptance?.pending[native.invocationId];
        if (!acceptance || !pending || !sameValue(pending.native, startOf(native)) || pending.sourcePromptEntryId !== sourcePromptEntryId) return;
        const checks = { ...acceptance.checks }; let known = pending.known && Boolean(access); let sequence = 0;
        try { sequence = operationSequence(scopedOperations(bound.scope)); } catch { known = false; }
        for (const criterion of acceptance.criteria) {
          if (criterion.kind !== 'command' || criterion.commandDigest !== native.commandDigest) continue;
          let targets: ReturnType<typeof observeTargets> = [];
          try { if (!access) throw new Error('Source policy unavailable.'); targets = observeTargets(bound.scope.workspace.path, criterion.targets, access); }
          catch { known = false; }
          if (!sameValue(targets, pending.targets[criterion.id])) known = false;
          checks[criterion.id] = { criterionId: criterion.id, native, sourcePromptEntryId, targets, operationSequence: sequence, known };
        }
        const retained = { ...acceptance.pending }; delete retained[native.invocationId];
        publishBoundSessionState(host, session, bound, (current, previous) => sameValue(current.goalAcceptance, previous.goalAcceptance),
          state => ({ ...state, goalAcceptance: { ...acceptance, checks, pending: retained } }));
      } catch { /* Pending/unknown evidence prevents optimistic completion. */ }
    },
  };
}
function startOf(proof: NativeCommandProof) {
  const { settledAt: _settled, status: _status, exitCode: _exit, ...start } = proof; return start;
}
