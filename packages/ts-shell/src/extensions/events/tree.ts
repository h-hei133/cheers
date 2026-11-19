import { snapshotData } from '../../core/values/data.js';
import type { ExtensionBeforeTreeResult } from './model.js';

/** Supply the same bounded inert decoder in both runtime realms. */
export function createTreeResultCapture(snapshotData: typeof import('../../core/values/data.js').snapshotData) {
  const MAX_SUMMARY_BYTES = 128 * 1024, MAX_INSTRUCTION_BYTES = 32 * 1024;

  /** Capture only the bounded tree result; malformed overrides never cause default provider work. */
  return function captureTreeResult(result: unknown): ExtensionBeforeTreeResult {
    if (result === undefined) return {};
    let captured;
    try { captured = snapshotData(result, { bytes: 192 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Error('Extension tree result must contain inert data.'); }
    if (!captured || typeof captured !== 'object' || Array.isArray(captured)) throw new Error('Extension tree result must be an object.');
    const value = captured as Record<string, unknown>;
    for (const key of ['cancel', 'replaceInstructions']) if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Extension tree result requires boolean flags.');
    let summary: { readonly summary: string } | undefined;
    if (value.summary !== undefined) {
      if (!value.summary || typeof value.summary !== 'object' || Array.isArray(value.summary)) throw new Error('Extension tree summary must contain text.');
      const text = (value.summary as Record<string, unknown>).summary;
      if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > MAX_SUMMARY_BYTES) throw new Error('Extension tree summary is empty or exceeds its limit.');
      summary = Object.freeze({ summary: text });
    }
    const instructions = value.customInstructions;
    if (instructions !== undefined && (typeof instructions !== 'string' || !instructions.trim() || Buffer.byteLength(instructions) > MAX_INSTRUCTION_BYTES)) throw new Error('Extension tree instructions are empty or exceed their limit.');
    return Object.freeze({ ...(value.cancel !== undefined ? { cancel: value.cancel as boolean } : {}), ...(summary ? { summary } : {}),
      ...(instructions !== undefined ? { customInstructions: instructions as string } : {}),
      ...(value.replaceInstructions !== undefined ? { replaceInstructions: value.replaceInstructions as boolean } : {}) });
  }

}

export const captureTreeResult = createTreeResultCapture(snapshotData);

/** Each supplied field wins independently; cancellation remains monotonic. */
export function mergeTreeResult(previous: ExtensionBeforeTreeResult, next: ExtensionBeforeTreeResult): ExtensionBeforeTreeResult {
  if (next.cancel) return Object.freeze({ cancel: true });
  return Object.freeze({ ...previous, ...next, cancel: previous.cancel === true });
}

export function validateTreeResult(result: ExtensionBeforeTreeResult): ExtensionBeforeTreeResult {
  if (!result.cancel && result.replaceInstructions && result.customInstructions === undefined) throw new Error('Extension tree replacement instructions require text.');
  return result;
}
