import { createHash } from 'node:crypto';
import { READ_ONLY_SCRIPT_ERROR, READ_ONLY_SCRIPT_OPERATIONS, type ScriptObserver } from '../execution.js';

export type Observation = readonly [id: number, request: string, reply: string];

export interface ReplayTrace {
  readonly environment: string;
  readonly observations: readonly Observation[];
  readonly output: string;
}

export const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const MAX_REQUEST_CHARS = 16 * 1024;
const MAX_REPLY_CHARS = 1024 * 1024;
const DIFFERENT_OBSERVATION = 'The script catalogue observation differs from the recording.';

export function replayDigest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function traceReplay(expected?: ReplayTrace): {
  readonly observer: ScriptObserver;
  readonly finish: (result: string) => ReplayTrace;
} {
  const requested = new Map<number, string>();
  const expectedRequests = new Map(expected?.observations.map(([id, digest]) => [id, digest]));
  const observations: Observation[] = [];
  const output = createHash('sha256');
  let environment: string | undefined;
  let issued = 0;
  return {
    observer: {
      ready(value) {
        environment = replayDigest(value);
        if (expected && expected.environment !== environment) throw new Error('The script runtime differs from the recording.');
      },
      request(rpc) {
        if (!READ_ONLY_SCRIPT_OPERATIONS.some(operation => operation === rpc.op)) throw new Error(READ_ONLY_SCRIPT_ERROR);
        if (rpc.id !== ++issued) throw new Error('The script catalogue request sequence is invalid.');
        const serialized = JSON.stringify([rpc.op, rpc.payload]);
        if (serialized.length > MAX_REQUEST_CHARS) throw new Error('The script catalogue request exceeds the replay limit.');
        const request = createHash('sha256').update(serialized).digest('hex');
        if (expected && expectedRequests.get(rpc.id) !== request) throw new Error(DIFFERENT_OBSERVATION);
        requested.set(rpc.id, request);
      },
      reply(rpc, reply) {
        const request = requested.get(rpc.id);
        if (!request) throw new Error('The script catalogue reply has no matching request.');
        if (!reply.ok) throw new Error('The script catalogue observation failed.');
        if (reply.json.length > MAX_REPLY_CHARS) throw new Error('The script catalogue reply exceeds the replay limit.');
        const digest = replayDigest(reply.json);
        const next = expected?.observations[observations.length];
        if (expected && (!next || next[0] !== rpc.id || next[2] !== digest)) throw new Error(DIFFERENT_OBSERVATION);
        observations.push([rpc.id, request, digest]);
        requested.delete(rpc.id);
      },
      text(kind, value) {
        output.update(JSON.stringify([kind, value]));
      },
    },
    finish(result) {
      if (!environment || requested.size) throw new Error('The script observation sequence is incomplete.');
      if (expected && expected.observations.length !== observations.length) throw new Error(DIFFERENT_OBSERVATION);
      const digest = output.update(JSON.stringify(['result', result])).digest('hex');
      if (expected && expected.output !== digest) throw new Error('The script output differs from the recording.');
      return { environment, observations, output: digest };
    },
  };
}
