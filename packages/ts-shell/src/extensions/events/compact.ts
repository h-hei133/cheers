import { snapshotData } from '../../core/values/data.js';
import type { ExtensionBeforeCompactResult } from './model.js';

/** Only cancellation and summary text can affect a planned compaction. */
export function createCompactResultCapture(snapshot: typeof snapshotData) {
  return function captureCompactResult(result: unknown): ExtensionBeforeCompactResult | undefined {
    if (result === undefined) return undefined;
    const saved = snapshot(result, { bytes: 192 * 1024, nodes: 32, depth: 4, allowCrossRealm: true });
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid extension compaction result.');
    const value = saved as Record<string, unknown>;
    if ((value.cancel !== undefined && typeof value.cancel !== 'boolean')
      || (value.summary !== undefined && (typeof value.summary !== 'string' || !value.summary.trim() || Buffer.byteLength(value.summary) > 128 * 1024))) {
      throw new Error('Invalid extension compaction result.');
    }
    // Existing aliases could return a veto in the legacy hook shape.
    if (value.cancel === true || value.decision === 'block' || value.decision === 'retry') return Object.freeze({ cancel: true });
    return Object.freeze(value.summary === undefined ? {} : { summary: value.summary as string });
  };
}

export const captureCompactResult = createCompactResultCapture(snapshotData);

export function mergeCompactResult(previous: ExtensionBeforeCompactResult | undefined, next: ExtensionBeforeCompactResult | undefined): ExtensionBeforeCompactResult | undefined {
  if (previous?.cancel || next?.cancel) return Object.freeze({ cancel: true });
  return next?.summary === undefined ? previous : next;
}
