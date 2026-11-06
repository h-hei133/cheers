import { createHash, randomUUID } from 'node:crypto';
import type { AgentLifecycleEvent } from '../core/agent/events.js';
import type { HookDecision } from '../core/hooks/types.js';
import { MAX_STOP_REENTRIES, type StopAttempt, type StopCheck } from '../core/hooks/stop/model.js';
import { normalizeStopResult, progressFingerprint, stopCheck } from '../core/hooks/stop/result.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { LifecycleFact, StopState, StopTerminalStatus } from '../core/query/runtime/lifecycle.js';
import { redactExportText } from '../core/security/redaction.js';

/** One completion attempt, including its single repair, stays in the same running session. */
export class StopLifecycle {
  readonly attemptId = randomUUID();
  private reentryCount = 0;
  private sequence = 0;
  private step = 0;
  private checks: StopCheck[] = [];
  private fingerprint = progressFingerprint([]);
  private blockedFingerprint?: string;
  private blockedCommand?: string;
  private ended = false;

  constructor(private readonly emit: (event: QueryEvent) => void) {}

  attempt(): StopAttempt {
    return { attemptId: this.attemptId, reentryCount: this.reentryCount, stop_hook_active: this.reentryCount > 0 };
  }

  record(fact: LifecycleFact): void {
    this.emit({ type: 'lifecycle.record', ...this.attempt(), sequence: ++this.sequence,
      progressFingerprint: this.fingerprint, ...fact });
  }

  observe(event: AgentLifecycleEvent, step: number): void {
    this.step = step;
    if (event.type === 'message_end' && event.message.role === 'assistant') this.record({
      kind: 'model_answer', step, status: event.message.stopReason === 'error' || event.message.stopReason === 'aborted' ? 'failed' : 'answered',
      messageIdentity: createHash('sha256').update(JSON.stringify(event.message)).digest('hex'),
    });
  }

  query(event: QueryEvent): void {
    this.emit(event);
    if (event.type === 'approval.requested' || event.type === 'approval.resolved') this.record({
      kind: 'permission', toolName: event.toolName, taskId: event.taskId,
      status: event.type === 'approval.requested' ? 'requested' : event.outcome,
    });
    if (event.type === 'tool.result') this.record({ kind: 'execution', toolName: event.toolName,
      taskId: event.taskId, status: event.success ? 'reported_success' : 'reported_failure' });
  }

  beginCheck(): void {
    this.checks = [];
    this.state('checking', 'candidate_answer');
  }

  checked(result: StopCheck): void {
    this.checks.push(result);
    this.fingerprint = progressFingerprint(this.checks);
    this.record({ kind: 'hook_result', result });
    this.record({ kind: 'proof_verdict', command: result.command, verdict: result.proofVerdict,
      evidenceIdentity: result.evidenceIdentity });
  }

  decide(returned: HookDecision, canRepair: boolean, candidateCompletes = true): 'accepted' | 'repair' | 'terminal' | 'completed_unproven' {
    const result = normalizeStopResult(returned);
    // Lightweight injected dispatchers use the same policy; production reports each check in order.
    if (returned.stopChecks === undefined) this.checked(stopCheck('in-process:dispatcher', result, 0));
    if ((returned.decision === 'allow' && returned.stopChecks?.length === 0) || result.decision === 'allow') {
      if (this.blockedCommand && !this.checks.some(check => check.command === this.blockedCommand && check.decision === 'allow')) {
        this.finish('unknown', 'missing_recheck');
        return 'terminal';
      }
      if (result.stopDisposition === 'completed_unproven' && returned.stopChecks?.length !== 0) {
        if (!candidateCompletes) { this.finish('stopped', 'candidate_stopped', false); return 'accepted'; }
        this.ended = true;
        this.state('completed_unproven', result.reasonCode!, true);
        return 'completed_unproven';
      }
      this.ended = true;
      this.state('accepted', returned.reasonCode ?? 'explicit_allow', true);
      return 'accepted';
    }
    if (result.decision !== 'block' && result.decision !== 'retry') {
      this.finish('unknown', result.reasonCode ?? 'unknown');
      return 'terminal';
    }
    this.state('blocked', result.reasonCode ?? 'hook_blocked');
    const fingerprint = JSON.stringify(this.fingerprint);
    const exhausted = fingerprint === this.blockedFingerprint ? 'repeated_block'
      : this.reentryCount >= MAX_STOP_REENTRIES ? 'reentry_limit' : !canRepair ? 'step_limit' : undefined;
    if (exhausted) { this.finish('blocked', exhausted); return 'terminal'; }
    this.blockedFingerprint = fingerprint;
    this.blockedCommand = this.checks.find(check => check.decision === 'block' || check.decision === 'retry')?.command;
    this.reentryCount += 1;
    this.state('repairing', 'hook_blocked');
    this.emit({ type: 'query.retrying', role: 'coder', turn: this.step, attempt: this.reentryCount,
      reason: `Stop check blocked completion; attempting repair (${this.reentryCount}/${MAX_STOP_REENTRIES}).` });
    return 'repair';
  }

  repairMessage(result: HookDecision): string {
    return `Completion was blocked by a Stop check. Repair the reported gap within the remaining budget, then answer again. This feedback grants no tool permissions.\n${redactExportText(result.reason ?? result.feedback ?? result.reasonCode ?? 'The completion check requested repair.').slice(0, 4_000)}`;
  }

  finish(status: Exclude<StopTerminalStatus, 'completed_unproven'>, reasonCode: string, publish = true): void {
    if (this.ended) return;
    this.ended = true;
    this.state(status, reasonCode, true);
    if (publish) this.emit({ type: 'query.failed', stopStatus: status, error: `Stop check ${status} (${reasonCode}).` });
  }

  private state(state: StopState, reasonCode: string, terminal = false): void {
    this.record({ kind: 'stop_state', state, reasonCode, terminal });
  }
}
