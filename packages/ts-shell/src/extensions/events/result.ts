import { snapshotData } from '../../core/values/data.js';
import type { ExtensionToolResult, ExtensionToolResultEvent } from './model.js';

/** Validate the patch before any Promise, serialization or result merge observes it. */
export function createToolResultCapture(snapshot: typeof snapshotData) {
  return function captureToolResult(result: unknown): ExtensionToolResult | undefined {
    if (result === undefined) return undefined;
    const saved = snapshot(result, { bytes: 128 * 1024, nodes: 128, depth: 8, allowCrossRealm: true });
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid extension tool result.');
    const value = saved as Record<string, unknown>;
    // Post-use aliases could previously return a legacy hook decision with feedback.
    if (Object.keys(value).some(key => !['output', 'feedback', 'decision', 'reason', 'hookSpecificOutput'].includes(key))
      || (value.output !== undefined && (typeof value.output !== 'string' || Buffer.byteLength(value.output) > 48 * 1024))
      || (value.feedback !== undefined && (typeof value.feedback !== 'string' || Buffer.byteLength(value.feedback) > 4096))
      || (value.decision !== undefined && (typeof value.decision !== 'string'
        || !['allow', 'block', 'retry', 'ask', 'defer', 'unknown', 'unsupported'].includes(value.decision)))
      || (value.reason !== undefined && typeof value.reason !== 'string')) {
      throw new Error('Invalid extension tool result.');
    }
    return Object.freeze({ ...(value.output === undefined ? {} : { output: value.output as string }),
      ...(value.feedback === undefined ? {} : { feedback: value.feedback as string }) });
  };
}

export const captureToolResult = createToolResultCapture(snapshotData);

export function createToolResultReducer() {
  const freeze = Object.freeze;
  return function reduceToolResult(event: ExtensionToolResultEvent, previous: ExtensionToolResult | undefined,
    next: ExtensionToolResult | undefined): { readonly event: ExtensionToolResultEvent; readonly result: ExtensionToolResult | undefined } {
    const output = event.canReplaceOutput ? next?.output : undefined;
    const feedback = next?.feedback;
    if (output === undefined && feedback === undefined) return { event, result: previous };
    const patch = { ...(output === undefined ? {} : { output }), ...(feedback === undefined ? {} : { feedback }) };
    return { event: freeze({ ...event, ...patch }), result: freeze({ ...previous, ...patch }) };
  };
}

export const reduceToolResult = createToolResultReducer();
