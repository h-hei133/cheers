import { createSessionStoreLayout, locateExistingSessionLayout } from '../../../session/store/sessionFileLayout.js';
import { readSessionFileVersion } from '../../../session/store/version.js';
import { SessionPublicationError } from '../../../session/store/bound.js';
import { captureAnnotationChange, isAnnotationEntryId, type AnnotationChange } from '../../../session/context/annotations.js';
import { appendSessionAnnotation } from '../../../session/context/write.js';
import { readSessionNavigationAsync } from '../../../session/query/navigation.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { markContextUnknown } from '../../../observability/usageTelemetry.js';
import { readAdmission } from './admission.js';

export type AnnotationResult = {
  readonly status: 'committed' | 'unchanged' | 'unknown' | 'persisted';
  readonly sessionId: string;
  readonly annotationId?: string;
  readonly version?: string;
  readonly output: string;
};

type AnnotationRuntime = Pick<ShellSessionRuntime, 'commands' | 'isRunning'>;

/** One command owner spans acquisition, the existing writer, and adoption of its receipt. */
export async function annotateSession(context: ShellRuntimeContext, runtime: AnnotationRuntime, input: {
  readonly entryId: string;
  readonly expectedVersion?: string;
  readonly change: AnnotationChange;
  readonly signal?: AbortSignal;
  readonly isBusy?: () => boolean;
}): Promise<AnnotationResult> {
  const session = context.session;
  const sessionId = session.id, cwd = context.cwd;
  const { entryId, expectedVersion, signal: requestedSignal, isBusy } = input;
  const change = captureAnnotationChange(input.change);
  const unchanged = (output: string): AnnotationResult => ({ status: 'unchanged', sessionId, output });
  if (!isAnnotationEntryId(entryId) || !change) return unchanged('Invalid session annotation.');
  if (runtime.isRunning() || isBusy?.()) return unchanged('A session operation is still running.');
  const assertCurrent = readAdmission(context);
  const configured = configurationAdmission(context);
  let result: AnnotationResult | undefined;
  let operationSignal: AbortSignal | undefined;
  try {
    return await runtime.commands.run(async signal => {
      operationSignal = signal;
      const check = (): void => {
        signal.throwIfAborted();
        assertCurrent();
        if (runtime.commands.current?.controller.signal !== signal || isBusy?.()) throw new Error('A session operation is still running.');
        const refused = configured();
        if (refused) throw new Error(refused);
      };
      check();
      const source = await readSessionNavigationAsync(sessionId, cwd, { signal });
      check();
      if (!source.actionSafe || source.session.id !== sessionId || source.session.createdAt !== session.createdAt
        || source.session.projectRoot !== session.projectRoot) return unchanged('The saved session is unavailable for editing.');
      if (expectedVersion !== undefined && source.version !== expectedVersion) {
        return unchanged('The saved conversation changed. Reopen its tree before editing.');
      }
      const publication = appendSessionAnnotation({ session: source.session, expectedVersion: source.version,
        targetId: entryId, change, admission: () => { check(); return undefined; } });
      result = { status: 'persisted', sessionId, annotationId: publication.event.id,
        output: 'Session annotation was saved. Reopen the session to refresh its view.' };
      check();
      const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId);
      if (readSessionFileVersion(layout) !== publication.version) return result;
      if (publication.event.type === 'context-edit') {
        markContextUnknown(sessionId);
        context.promptIdentity = undefined;
      }
      context.session = publication.session;
      return { status: 'committed', sessionId, annotationId: publication.event.id, version: publication.version,
        output: 'Session annotation saved.' };
    }, 'command', requestedSignal);
  } catch (error) {
    if (result) return result;
    if (error instanceof SessionPublicationError) {
      if (error.state === 'unknown') return { status: 'unknown', sessionId,
        output: 'Session annotation persistence is unknown. Reopen the saved tree before retrying.' };
      if (error.state === 'persisted') return { status: 'persisted', sessionId,
        output: 'Session annotation was saved. Reopen the session to refresh its view.' };
      if (error.code === 'invalid') return unchanged('This message does not support the requested annotation.');
      if (error.code === 'conflict') return unchanged('The saved conversation changed. Reopen its tree before editing.');
    }
    return unchanged(operationSignal?.aborted ? 'Session annotation was cancelled.' : 'The saved session could not be edited.');
  }
}
