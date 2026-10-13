import path from 'node:path';
import { planSandboxedCommand } from '../../sandbox/osSandbox.js';
import type { ExecutionService } from '../../runtime/execution/service.js';
import type { Evaluation, EvaluationRound, Measurement } from './model.js';
import { evaluationDigest } from './assets.js';
import { decodeMetrics } from './scoring.js';
import { assertEvaluationPlacement } from './isolation.js';

export class EvaluationExecutionError extends Error {
  constructor(readonly status: 'failed' | 'cancelled' | 'unknown') { super(`Evaluation ${status}; candidate retained and source unchanged.`); }
}
async function isolatedResult(row: Evaluation, round: EvaluationRound, execution: Pick<ExecutionService, 'runCommand'>,
  signal: AbortSignal, root: string, entry: string, input: unknown, identity: string, candidate: boolean) {
  const plan = planSandboxedCommand({ shell: row.frozen.executable.path, shellArgs: [path.join(root, entry)],
    workspaceRoot: root, isolateProcesses: true, sessionCreated: true, readOnlyRoots: [root],
    rules: { enabled: true, failClosed: true, network: { allowedDomains: [] },
      filesystem: { allowRead: [row.frozen.executable.path], allowWrite: [], denyRead: [] } } });
  if (plan.state !== 'isolated' || !plan.command || !plan.args) throw new Error('Evaluation isolation is unavailable. No evaluator was dispatched.');
  let output = Buffer.alloc(0); let bytes = 0; let inputFailed = false;
  const result = await execution.runCommand({ operationKind: 'command.run', command: plan.command, args: plan.args,
    cwd: root, workspaceRoot: root, authority: { mode: 'sandbox-approved', source: 'tool-runtime-approval', reason: 'The exact frozen evaluation passed the ordinary command gate.' },
    caller: 'evaluation-workflow', reason: candidate ? 'Run candidate without evaluator or expected outcomes' : 'Grade output without executing candidate code',
    reportSafeCommand: `${candidate ? 'Candidate' : 'Evaluator'} ${row.id} round ${round.id} ${identity}`,
    timeoutMs: row.frozen.spec.timeoutMs, abortSignal: signal, cleanupTreeOnExit: true, captureOutput: false,
    env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', USERPROFILE: '/tmp', LANG: 'C.UTF-8', ...(candidate ? { EVAL_CANDIDATE_ROOT: root } : {}) },
    onOutput: chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 32768) throw new Error('Evaluation output exceeds its bound.'); },
    onStdout: chunk => { if (output.length + chunk.length > 16384) throw new Error('Evaluation result exceeds its bound.'); output = Buffer.concat([output, chunk]); },
    onStdin: stream => { void stream.write(Buffer.from(JSON.stringify(input) + '\n')).then(() => stream.end(), () => { inputFailed = true; stream.end(); }); },
  });
  if (result.terminationFailed || result.outputFailed) throw new EvaluationExecutionError('unknown');
  if (inputFailed) throw new EvaluationExecutionError('failed');
  if (result.status !== 'completed' || result.exitCode !== 0) throw new EvaluationExecutionError(result.status === 'cancelled' ? 'cancelled' : 'failed');
  const text = output.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(output)) throw new Error('Evaluation output is not UTF-8.');
  return { text, receiptId: result.receipt.receiptId };
}
export async function measureEvaluation(row: Evaluation, round: EvaluationRound, execution: Pick<ExecutionService, 'runCommand'>,
  signal: AbortSignal, admission: () => string | undefined, progress: (measurement: Measurement) => void): Promise<void> {
  if (process.platform !== 'linux') throw new Error('Isolated evaluations currently require Linux process and filesystem namespaces.');
  assertEvaluationPlacement(row.scope.workspace.path, row.directory!.path, row.frozen.executable.path);
  const section = round.kind === 'baseline' ? 'baseline' : 'candidate';
  const candidate = path.join(row.directory!.path, section); const evaluator = path.join(row.directory!.path, 'evaluator');
  const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) controller.abort(); const timer = setTimeout(abort, 60_000);
  try {
    for (const sample of row.frozen.spec.samples) for (let repetition = 0; repetition < row.frozen.spec.repetitions; repetition++) {
      controller.signal.throwIfAborted(); const blocked = admission(); if (blocked) throw new Error(blocked);
      if (evaluationDigest(row, section) !== round.digest) throw new Error('Candidate or fixed assets changed during evaluation.');
      const identity = `sample ${sample.id} repetition ${repetition}`;
      const actual = await isolatedResult(row, round, execution, controller.signal, candidate, row.frozen.spec.candidateEntry,
        { id: sample.id, input: sample.input }, identity, true);
      if (admission() || evaluationDigest(row, section) !== round.digest) throw new Error('Evaluation authority or measured files changed.');
      const grade = await isolatedResult(row, round, execution, controller.signal, evaluator, row.frozen.spec.entry,
        { id: sample.id, input: sample.input, expected: sample.expected, actual: actual.text }, identity, false);
      if (admission() || evaluationDigest(row, section) !== round.digest) throw new Error('Evaluation authority or measured files changed.');
      progress({ sample: sample.id, repetition, metrics: decodeMetrics(grade.text, row.frozen.spec), receiptId: grade.receiptId, candidateReceiptId: actual.receiptId });
    }
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
