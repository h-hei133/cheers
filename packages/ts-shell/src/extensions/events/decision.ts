import { snapshotData } from '../../core/values/data.js';

export type SessionBeforeEventName = 'session_before_switch' | 'session_before_fork' | 'session_before_tree' | 'session_before_compact';

export function isSessionBeforeEvent(name: string): name is SessionBeforeEventName {
  return isSessionTransitionEvent(name) || name === 'session_before_tree' || name === 'session_before_compact';
}

export function isSessionTransitionEvent(name: string): boolean {
  return name === 'session_before_switch' || name === 'session_before_fork';
}

/** Capture before the callback result crosses a runtime boundary. */
export function createSessionCancellationCapture(captureData: typeof snapshotData) {
  return function captureCancellation(result: unknown): boolean {
    if (result === undefined) return false;
    let captured;
    try { captured = captureData(result, { bytes: 128 * 1024, nodes: 4096, depth: 12, allowCrossRealm: true }); }
    catch { throw new Error('Extension session result must contain inert data.'); }
    if (captured === null || typeof captured !== 'object' || Array.isArray(captured)) {
      throw new Error('Extension session result must contain a boolean cancel field.');
    }
    const cancellation = Object.getOwnPropertyDescriptor(captured, 'cancel')?.value as unknown;
    if (cancellation !== undefined && typeof cancellation !== 'boolean') {
      throw new Error('Extension session result must contain a boolean cancel field.');
    }
    return cancellation === true;
  }
}

export const sessionCancellation = createSessionCancellationCapture(snapshotData);
