import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { SessionChangeRequest, SessionChangeResult } from '../../../core/shell/replacement.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../../session/store/sessionFileLayout.js';
import { SessionStoreAccess } from '../../../session/store/sessionStoreAccess.js';
import { readSessionFileVersion } from '../../../session/store/version.js';
import { extensionNavigation } from '../extensions/navigation.js';
import { shutdownExtensionsFor, retireExtensionsFor, replaceExtensionsFor, startExtensionsFor } from '../extensions.js';
import type { CurrentSessionSelectionRecord } from '../../../session/store/currentSelection.js';
import { normalizePathIdentity } from '../../../session/continuation/roots.js';
import { prepareSessionSurface } from './surface.js';
import { captureSessionTransition } from '../../../session/store/transition.js';
import type { Session } from '../../../session/schema/sessionRecord.js';

/** Coordinate callbacks around the existing synchronous activation and context publication owners. */
export function installSessionChange(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime): void {
  const store = new SessionStoreAccess();
  let changing = false;
  context.sessionChange = async request => {
    if (changing || runtime.isRunning()) return { status: 'refused', reason: 'A session operation is still running.' };
    const captured = { ...request };
    changing = true;
    try { return await runtime.commands.run(signal => change(context, manager, store, captured, signal), 'session-change', captured.signal); }
    catch (error) { return { status: 'refused', reason: error instanceof Error ? error.message : 'Session replacement failed.' }; }
    finally { changing = false; }
  };
}

async function change(context: ShellRuntimeContext, manager: SessionManager, store: SessionStoreAccess,
  request: SessionChangeRequest, signal: AbortSignal): Promise<SessionChangeResult> {
  const source = context.session, cwd = context.cwd, root = context.projectRoot, configured = configurationAdmission(context);
  const sourceId = source.id, sourceCreatedAt = source.createdAt, sourceRoot = source.projectRoot;
  const destinationRoot = request.projectRoot ?? root;
  const admission = () => {
    signal.throwIfAborted();
    const refused = request.admission?.() ?? configured();
    if (refused) throw new Error(refused);
    if (context.session !== source || source.id !== sourceId || source.createdAt !== sourceCreatedAt || source.projectRoot !== sourceRoot
      || context.cwd !== cwd || context.projectRoot !== root) throw new Error('The active session changed while preparing replacement.');
  };
  const events = extensionNavigation(context, admission, signal);
  let quiesced = false;
  try {
    admission();
    const selection = store.readCurrentSessionSelection(root), destination = store.readCurrentSessionSelection(destinationRoot);
    events.check();
    if (!await events.before(request.reason === 'fork'
      ? { type: 'session_before_fork', sessionId: source.id, workspaceRoot: cwd, ...(request.entryId ? { entryId: request.entryId } : {}) }
      : { type: 'session_before_switch', sessionId: source.id, workspaceRoot: cwd, reason: request.reason,
        ...(request.targetSessionId ? { targetSessionId: request.targetSessionId } : {}) })) return { status: 'cancelled', reason: 'Session replacement cancelled before activation.' };
    events.check();
    const candidate = request.prepare(events.check);
    events.check();
    if (normalizePathIdentity(candidate.projectRoot) !== normalizePathIdentity(destinationRoot)) throw new Error('The prepared session belongs to a different project.');
    if (request.targetSessionId !== undefined && candidate.id !== request.targetSessionId) throw new Error('The prepared saved session does not match the selected target.');
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), candidate.id);
    const version = readSessionFileVersion(layout);
    const preparedCurrent = captureSessionTransition(layout);
    if (version !== readSessionFileVersion(layout)) throw new Error('The selected saved session changed during preparation.');
    if (request.expectedVersion !== undefined && request.expectedVersion !== version) throw new Error('The selected saved session changed. Reopen its picker.');
    quiesced = true;
    // The idle replacement owns this command; joining it here would wait on itself.
    await shutdownExtensionsFor(context, request.reason, async () => {});
    events.check();
    await retireExtensionsFor(context);
    // Original generations are intentionally retired. Only source/selection authority remains.
    admission();
    let activation: CurrentSessionSelectionRecord | undefined;
    const selected = manager.tryResume(candidate.id, candidate.projectRoot, { mode: request.mode ?? 'continuity-only', expectedVersion: version,
      beforeActivate: admission,
      activation: { guard: { source: { projectRoot: root, expected: selection }, destination, signal,
        admission: () => { admission(); return undefined; } }, captureSelection: record => { activation = { ...record }; } } });
    if (!selected.ok) throw new Error(selected.error);
    if (!activation) throw new Error('The saved activation identity is unavailable.');
    const savedCurrent = preparedCurrent(selected.session);
    request.publish(selected.session);
    const adopted = captureSuccessor(context, manager, store, selected.session, activation, signal, savedCurrent);
    adopted();
    if (selected.warning) throw new Error(selected.warning);
    await replaceExtensionsFor(context);
    adopted();
    prepareSessionSurface(context);
    adopted();
    await startExtensionsFor(context, request.reason);
    adopted();
    return { status: 'changed', session: selected.session };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Session replacement failed.';
    if (quiesced) { context.workspaceIssue = 'Session replacement was not verified. Restart before continuing.'; return { status: 'unknown', reason }; }
    return { status: 'refused', reason };
  }
}

/** Validate the adopted owner after waits; startup may append through its own saved writer. */
function captureSuccessor(context: ShellRuntimeContext, manager: SessionManager, store: SessionStoreAccess,
  session: Session, activation: CurrentSessionSelectionRecord, signal: AbortSignal, savedCurrent: (readback: () => void) => void): () => void {
  const id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
  const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration, configured = configurationAdmission(context);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), id);
  if (context.session !== session || normalizePathIdentity(root) !== normalizePathIdentity(sessionRoot)) throw new Error('The successor session was not published.');
  const current = () => {
    signal.throwIfAborted();
    if (context.session !== session || session.id !== id || session.createdAt !== createdAt || session.projectRoot !== sessionRoot
      || context.cwd !== cwd || context.projectRoot !== root || context.configuration !== configuration) throw new Error('The successor runtime changed during replacement.');
  };
  const check = () => { const refused = configured(); if (refused) throw new Error(refused); current(); };
  return () => {
    check();
    savedCurrent(() => {
      const version = readSessionFileVersion(layout), saved = manager.getSession(id);
      if (!saved || saved.id !== id || saved.createdAt !== createdAt || normalizePathIdentity(saved.projectRoot) !== normalizePathIdentity(sessionRoot)
        || version !== readSessionFileVersion(layout)) throw new Error('The successor saved session changed during acquisition.');
      check();
      const selected = store.readCurrentSessionSelection(sessionRoot);
      if (!selected || selected.sessionId !== activation.sessionId || selected.activationId !== activation.activationId
        || selected.updatedAt !== activation.updatedAt) throw new Error('The successor saved activation changed during replacement.');
    });
    current();
  };
}
