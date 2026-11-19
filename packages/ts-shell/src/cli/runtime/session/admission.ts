import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';

/** Keep a saved read bound to its original runtime through response publication. */
export function readAdmission(context: ShellRuntimeContext): () => void {
  const selected = context.session, active = context.activeSession;
  const id = selected.id, createdAt = selected.createdAt, sessionRoot = selected.projectRoot;
  const cwd = context.cwd, projectRoot = context.projectRoot;
  const configuration = context.configuration, publication = configuration.current;
  const signal = configuration.backgroundSignal;
  return () => {
    signal.throwIfAborted();
    if (context.session !== selected || context.activeSession !== active || selected.id !== id || selected.createdAt !== createdAt
      || selected.projectRoot !== sessionRoot || context.cwd !== cwd || context.projectRoot !== projectRoot
      || context.configuration !== configuration || configuration.current !== publication) {
      throw new Error('The selected session changed during the read.');
    }
  };
}
