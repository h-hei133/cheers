import {snapshotData} from '../../values/data.js';
import {isRecord} from '../../values/record.js';
import type {HookDecision} from '../types.js';

/** A legacy input hook keeps its own veto contract, but cannot return an unverified allow. */
export function captureInputHookDecision(value: unknown): HookDecision | undefined {
  if (value === undefined) return undefined;
  const saved = snapshotData(value, {bytes:64*1024*1024, nodes:4096, depth:12, allowCrossRealm:true});
  if (!isRecord(saved) || saved.decision !== undefined && (typeof saved.decision !== 'string' || !['allow','block','retry'].includes(saved.decision))) {
    throw new Error('Prompt input hook result was refused.');
  }
  return saved as unknown as HookDecision;
}
