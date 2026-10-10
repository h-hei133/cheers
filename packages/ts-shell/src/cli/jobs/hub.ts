import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { requestLedgerFacts } from '../../core/agent/request/projection.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { decodeGoal, goalMatchesScope } from '../../planning/goal/codec.js';
import { decodeAdvisor } from '../../advisor/codec.js';
import { sameValue } from '../../config/values.js';
import type { JobOrigin } from '../../workflow/jobs/model.js';
import type { JobsComposition } from './model.js';
import { localProjection, remoteProjection } from './projection.js';
import { agentProjection } from './agent/projection.js';
import { dagProjection } from './dag/projection.js';

/** Parent relationships describe provenance/lifetime, not an invented DAG order. */
function parentLinks(id: string, origin: JobOrigin) {
  return [
    ...(origin.goalId ? [{ childId: id, parentId: origin.goalId, parentKind: 'goal' }] : []),
    ...(origin.parentId ? [{ childId: id, parentId: origin.parentId, parentKind: 'advisor-note' }] : []),
    ...(origin.acceptanceId ? [{ childId: id, parentId: origin.acceptanceId, parentKind: 'collaboration-acceptance' }] : []),
    ...(origin.sourceEntryId ? [{ childId: id, parentId: origin.sourceEntryId, parentKind: 'prompt' }] : []),
  ];
}
export function hubProjection(host: JobsComposition) {
  const bound = readBoundSessionState(host.manager, host.session);
  const journal = host.jobs.read();
  const goal = decodeGoal(bound.state.goal);
  const advisor = decodeAdvisor(bound.state.advisor);
  const ledger = decodeRequestLedger(bound.state.requestLedger);
  const ledgerBound = ledger?.sessionId === bound.scope.sessionId && ledger.sessionCreatedAt === bound.scope.sessionCreatedAt
    && ledger.directoryIdentity === bound.directoryIdentity;
  const jobs = [...(journal.local ?? []).map(job => localProjection(host, job)), ...(journal.agents ?? []).map(job => agentProjection(host, job)),
    ...(journal.dags ?? []).map(job => dagProjection(host, job)), ...journal.jobs.map(remoteProjection)];
  return { sessionId: host.session.id,
    main: { kind: 'session', status: host.runtime.getState?.() ?? bound.state.status,
      runPhase: bound.state.runPhase, sourceEntryId: bound.state.pendingPromptEntryId, stopReason: bound.state.terminalReason },
    goal: goal ? { id: goal.id, status: goal.phase, detached: !goalMatchesScope(goal, bound.scope),
      scheduling: goal.scheduling, tokenBudget: goal.tokenBudget ?? 'uncapped', completion: goal.completion } : bound.state.goal === undefined ? undefined : 'unavailable',
    advisor: advisor && sameValue(advisor.workspace, bound.scope.workspace) && advisor.sessionId === bound.scope.sessionId
      && advisor.sessionCreatedAt === bound.scope.sessionCreatedAt
      ? { kind: 'advisor', status: advisor.status, enabled: advisor.enabled, pending: advisor.pending,
        notes: advisor.notes.map(note => ({ id: note.id, checkpointId: note.checkpointId, submittedAt: note.submittedAt })) }
      : bound.state.advisor === undefined ? undefined : 'unavailable',
    jobs,
    requestUsage: ledger && ledgerBound ? Object.values(ledger.scopes).map(scope => ({ scopeId: scope.scope.id,
      detached: scope.scope.workspacePath !== bound.scope.workspace.path || scope.scope.workspaceIdentity !== bound.scope.workspace.identity,
      ...(scope.scope.id === goal?.id ? { tokenBudget: goal.tokenBudget ?? 'uncapped' } : {}), ...requestLedgerFacts(scope) })) : 'unavailable',
    parents: [...(journal.local ?? []), ...(journal.agents ?? []), ...(journal.dags ?? []), ...journal.jobs].flatMap(job => [
      ...parentLinks(job.id, job.origin), ...(job.backend === 'agent' && job.child ? [{ childId: job.child.scope.sessionId, parentId: job.scope.sessionId, parentKind: 'session' }] : []),
    ]).concat((journal.dags ?? []).flatMap(job => job.steps.map(step => ({ childId: step.jobId, parentId: job.id, parentKind: 'workflow' })))),
    dependencies: (journal.dags ?? []).flatMap(job => job.definition.steps.flatMap(step => step.needs.map(needed => ({ workflowId: job.id,
      childId: job.steps.find(state => state.id === step.id)!.jobId, dependsOn: job.steps.find(state => state.id === needed)!.jobId })))),
    completionProof: false };
}
