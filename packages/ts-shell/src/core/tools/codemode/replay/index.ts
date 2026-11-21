import { randomInt, randomUUID } from 'node:crypto';
import { BranchStoreError, captureBranchStore } from '../../../../session/branch/store/index.js';
import type { ToolExecutionContext, ToolExecutionResult } from '../../../../tools/types.js';
import { approvedResult, deniedResult } from '../../toolResultLifecycle.js';
import { MAX_SCRIPT_RPC, READ_ONLY_SCRIPT_ERROR, type ScriptObserver, type ScriptOutcome } from '../execution.js';
import type { CodemodeOutput } from '../output.js';
import { CODEMODE_WORKER_SOURCE } from '../prelude.js';
import { DIGEST_PATTERN, replayDigest, traceReplay, type ReplayTrace } from './trace.js';

const REPLAY_NAMESPACE = 'codemode-replay';
const RECEIPT_VERSION = 1;
const SEED_LIMIT = 2 ** 32;
const RUNTIME = replayDigest([CODEMODE_WORKER_SOURCE, process.version, process.versions.v8, process.versions.icu,
  process.versions.tz, process.versions.cldr, process.versions.unicode, process.platform, process.arch]);
export const REPLAY_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type ReplayMode = { readonly kind: 'record' } | { readonly kind: 'replay'; readonly id: string };

interface ReplayClock {
  readonly startedAt: number;
  readonly seed: number;
}

interface ReplayReceipt {
  readonly version: typeof RECEIPT_VERSION;
  readonly inputs: string;
  readonly clock: ReplayClock;
  readonly trace: ReplayTrace;
}

interface ReplayResult {
  readonly status: 'recorded' | 'verified';
  readonly id: string;
}

export interface ReplayRun {
  readonly id: string;
  readonly clock: ReplayClock;
  readonly observer: ScriptObserver;
  readonly complete: (result: string, validateStore: (admission: () => void) => void) => ReplayResult;
}

export function parseReplayMode(args: Record<string, unknown>): ReplayMode | undefined {
  if (args.record !== undefined && typeof args.record !== 'boolean') throw new Error('record must be a boolean.');
  if (args.replay_id === undefined) return args.record === true ? { kind: 'record' } : undefined;
  if (args.record === true) throw new Error('Choose either record or replay_id.');
  if (typeof args.replay_id !== 'string' || args.replay_id.length !== 36 || !REPLAY_ID_PATTERN.test(args.replay_id)) {
    throw new Error('replay_id must be a valid script replay ID.');
  }
  return { kind: 'replay', id: args.replay_id };
}

function isDigest(value: unknown): value is string {
  return typeof value === 'string' && value.length === 64 && DIGEST_PATTERN.test(value);
}

function validTrace(trace: ReplayTrace | undefined): boolean {
  if (!trace || !isDigest(trace.output) || !isDigest(trace.environment) || !Array.isArray(trace.observations)
    || trace.observations.length > MAX_SCRIPT_RPC) return false;
  const ids = new Set<number>();
  for (const entry of trace.observations) {
    if (!Array.isArray(entry) || entry.length !== 3) return false;
    const [id, request, reply] = entry;
    if (!Number.isSafeInteger(id) || id < 1 || id > trace.observations.length || ids.has(id)
      || !isDigest(request) || !isDigest(reply)) return false;
    ids.add(id);
  }
  return true;
}

function parseReceipt(raw: string | undefined): ReplayReceipt {
  if (!raw) throw new Error('The script recording is unavailable on this session branch.');
  let receipt: Partial<ReplayReceipt> | null;
  try { receipt = JSON.parse(raw) as Partial<ReplayReceipt> | null; }
  catch { throw new Error('The script recording is invalid.'); }
  const clock = receipt?.clock;
  if (receipt?.version !== RECEIPT_VERSION || !isDigest(receipt.inputs) || !clock
    || !Number.isSafeInteger(clock.startedAt) || Math.abs(clock.startedAt) > 8.64e15
    || !Number.isSafeInteger(clock.seed) || clock.seed < 1 || clock.seed >= SEED_LIMIT
    || !validTrace(receipt.trace)) throw new Error('The script recording is invalid.');
  return receipt as ReplayReceipt;
}

export function prepareReplay(mode: ReplayMode, context: ToolExecutionContext,
  source: string, workerInputs: Readonly<Record<string, unknown>>): ReplayRun {
  const { sessionId, workspaceRoot } = context;
  if (!sessionId) throw new Error('Script recording and replay require a saved session.');
  const admit = (): void => {
    context.abortSignal?.throwIfAborted();
    if (context.admission?.()) throw new BranchStoreError('conflict');
    context.abortSignal?.throwIfAborted();
  };
  const store = captureBranchStore({ sessionId, cwd: workspaceRoot, namespace: REPLAY_NAMESPACE, admission: admit });
  const id = mode.kind === 'record' ? randomUUID() : mode.id;
  const expected = mode.kind === 'replay' ? parseReceipt(store.initial[id]) : undefined;
  const inputs = replayDigest([RUNTIME, sessionId, source, workerInputs]);
  if (expected && expected.inputs !== inputs) throw new Error('The script source or inputs differ from the recording.');
  const clock = expected?.clock ?? { startedAt: Date.now(), seed: randomInt(1, SEED_LIMIT) };
  const trace = traceReplay(expected?.trace);
  return {
    id,
    clock,
    observer: trace.observer,
    complete(result, validateStore) {
      const observed = trace.finish(result);
      validateStore(admit);
      if (mode.kind === 'replay') {
        store.assertCurrent([id]);
        return { status: 'verified', id };
      }
      if (Object.hasOwn(store.initial, id)) throw new BranchStoreError('conflict');
      const receipt: ReplayReceipt = { version: RECEIPT_VERSION, inputs, clock, trace: observed };
      if (store.commit({ [id]: JSON.stringify(receipt) }) !== 'persisted') throw new BranchStoreError('verification-failed', 'unknown');
      return { status: 'recorded', id };
    },
  };
}

export function replayFailure(error: unknown, signal?: AbortSignal): ToolExecutionResult {
  const message = signal?.aborted ? 'Operation aborted.' : error instanceof Error ? error.message : 'Script replay failed.';
  return deniedResult(`Script failed\n\nScript error: ${message}`, {
    codemodeReplay: error instanceof BranchStoreError
      ? { status: error.status, reason: error.reason }
      : { status: 'unchanged' },
  });
}

export function settleReplay(replay: ReplayRun, outcome: ScriptOutcome, output: CodemodeOutput,
  validateStore: (admission: () => void) => void, signal?: AbortSignal): ToolExecutionResult {
  if (!outcome.ok) return replayFailure(new Error(outcome.error), signal);
  if (outcome.writes && Object.keys(outcome.writes).length) return replayFailure(new Error(READ_ONLY_SCRIPT_ERROR), signal);
  try {
    const projected = output.result('Script completed', undefined, `Replay ID ${replay.id}`);
    const receipt = replay.complete(projected.text, validateStore);
    return approvedResult(projected.text, { ...projected.metadata, codemodeReplay: receipt, codemodeStore: { status: 'unchanged' } });
  } catch (error) {
    return replayFailure(error, signal);
  }
}
