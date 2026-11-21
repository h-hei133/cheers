import vm from 'node:vm';
import { snapshotData } from '../../core/values/data.js';

export function captureToolSelection(value: unknown): readonly string[] {
  const names = snapshotData(value, { bytes: 128 * 1024, nodes: 1026, depth: 1, allowCrossRealm: true });
  if (!Array.isArray(names) || !names.every(name => typeof name === 'string' && name.length > 0 && name.length <= 512
    && name === name.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(name))) throw new Error('Invalid extension tool selection.');
  return Object.freeze([...new Set<string>(names)]);
}

/** Give file extensions a realm-local Promise and keep host errors out of the VM. */
export function createToolSelectionBridge(context: vm.Context, change: (names: readonly string[]) => Promise<void>): typeof change {
  const send = (names: readonly string[], reply: (applied: boolean) => void): void => {
    const settle = (applied: boolean) => { try { reply(applied); } catch { /* The VM cannot undo settlement. */ } };
    void change(names).then(() => settle(true), () => settle(false));
  };
  Object.defineProperty(context, '__selectTools', { value: Object.setPrototypeOf(send, null), configurable: true });
  return new vm.Script(`(() => {
    const send = globalThis.__selectTools;
    const LocalPromise = Promise, LocalError = Error;
    delete globalThis.__selectTools;
    return names => new LocalPromise((resolve, reject) => {
      send(names, applied => applied ? resolve() : reject(new LocalError('Extension tool selection failed.')));
    });
  })()`).runInContext(context) as typeof change;
}
