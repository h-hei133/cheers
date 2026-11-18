import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';

const surfaces = new WeakMap<ShellRuntimeContext, () => void>();

/** The current input host binds its successor UI before startup callbacks run. */
export function bindSessionSurface(context: ShellRuntimeContext, prepare: () => void): () => void {
  surfaces.set(context, prepare);
  return () => { if (surfaces.get(context) === prepare) surfaces.delete(context); };
}

export function prepareSessionSurface(context: ShellRuntimeContext): void {
  surfaces.get(context)?.();
}
