import { snapshotData } from '../values/data.js';
import { isRecord } from '../values/record.js';
import type { HookDecision } from './types.js';

const MAX_OUTPUT_BYTES = 64 * 1024;
const observedOutputs = new WeakMap<HookDecision, () => boolean>();

function acceptedScriptOutput(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_OUTPUT_BYTES && Buffer.byteLength(value) <= MAX_OUTPUT_BYTES
    ? value : undefined;
}

/** Only captured data reaches dispatch or the result projector. */
export function captureScriptHookDecision(value: unknown): HookDecision | undefined {
  if (value === undefined || value === null) return undefined;
  const saved = snapshotData(value, { bytes: 512 * 1024, nodes: 256, depth: 8, allowCrossRealm: true });
  if (!isRecord(saved)) return undefined;
  const specific = isRecord(saved.hookSpecificOutput) ? saved.hookSpecificOutput : undefined;
  const updatedToolOutput = acceptedScriptOutput(saved.updatedToolOutput ?? specific?.updatedToolOutput);
  const decision = saved.decision === 'block' || saved.decision === 'retry' ? saved.decision : 'allow';
  return {
    decision,
    ...(typeof saved.reason === 'string' ? { reason: saved.reason } : {}),
    ...(typeof saved.feedback === 'string' ? { feedback: saved.feedback } : {}),
    ...(specific ? { hookSpecificOutput: specific } : {}),
    ...(updatedToolOutput !== undefined ? { updatedToolOutput } : {}),
  };
}

export function publishScriptOutput(decision: HookDecision, text: string, current: () => boolean): HookDecision {
  const result = Object.freeze({ ...decision, updatedToolOutput: text });
  observedOutputs.set(result, current);
  return result;
}

export function currentScriptOutput(decision: HookDecision): string | undefined {
  return observedOutputs.get(decision)?.() ? decision.updatedToolOutput : undefined;
}
