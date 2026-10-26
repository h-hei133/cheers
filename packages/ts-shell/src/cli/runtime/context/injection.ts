import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { buildPromptWithFutureTurnInjections, type SessionFutureTurnProjectionDependencies } from '../../../core/shell/sessionFutureTurnProjection.js';
import { capturePromptSources } from '../../../context/request/sources.js';
import { recordsFileFor } from '../../../memory/memoryPersistence.js';
import type { ProjectMemoryStore } from '../../../memory/projectMemoryStoreContract.js';

/** Prepare the actual future-turn payload without consuming its generation. */
export async function prepareContextInjection(context: ShellRuntimeContext, memoryStore: ProjectMemoryStore,
  prompt: string, signal: AbortSignal, dependencies: SessionFutureTurnProjectionDependencies = {}) {
  const session = context.session;
  const sources = capturePromptSources(); sources.track(recordsFileFor(memoryStore.ref));
  signal.throwIfAborted();
  const prepared = await buildPromptWithFutureTurnInjections({ deps: { ...dependencies, projectMemoryStore: memoryStore,
    projectMemoryReadOptions: { signal, maxBytes: 512 * 1024, onSource: sources.track } }, sessionId: session.id, prompt });
  signal.throwIfAborted(); sources.verify();
  const isCurrent = () => {
    sources.verify();
    return !signal.aborted && context.session === session && prepared.isCurrent();
  };
  const verifyContent = async (checkingSignal: AbortSignal) => {
    checkingSignal.throwIfAborted();
    if (!isCurrent()) throw new Error('Prepared memory context changed.');
    await sources.verifyContent(checkingSignal);
    if (!isCurrent()) throw new Error('Prepared memory context changed.');
  };
  await verifyContent(signal);
  return { prompt: prepared.prompt, isCurrent, verifyContent };
}
