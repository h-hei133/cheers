import fs from 'node:fs';
import type {ShellRuntimeContext} from '../../../core/shell/runtimeContext.js';
import type {CaptureQueuedPromptInput, PreparedPromptInput, PromptInputRequest, QueuedPromptBinding, QueuedPromptInputRequest} from '../../../core/shell/input/contract.js';
import {InputPreparationError} from '../../../core/shell/input/contract.js';
import {configurationOperation} from '../../../core/shell/scope.js';
import {dispatchExtensionEvent, getExtensionEventRunners, type ExtensionEventRunner} from '../../../core/hooks/extensionBridge.js';
import type {HookDispatcher} from '../../../core/hooks/hookDispatcher.js';
import {inputAdmissionReceipt} from '../../../core/hooks/input/receipt.js';
import type {ExtensionInputEvent} from '../../../extensions/events/model.js';
import {captureInputResult, projectInputEvent} from '../../../extensions/events/input.js';
import {extensionHostFor} from './host.js';
import {createSessionStoreLayout, locateExistingSessionLayout} from '../../../session/store/sessionFileLayout.js';
import {captureSessionTransition} from '../../../session/store/transition.js';
import {SessionStoreAccess} from '../../../session/store/sessionStoreAccess.js';
import {sameValue} from '../../../config/values.js';
import {snapshotData} from '../../../core/values/data.js';
import {canonicalImageMime, inspectImage} from '../../../model-adapters/image/input.js';
import type {ImageContent} from '../../../model-adapters/multimodal.js';
import type {SessionStateSnapshot} from '../../../session/schema/sessionStateSnapshot.js';
import {fileIdentity, pathIdentity} from '../../../core/workspace/files.js';

type InputAudit = (snapshot: SessionStateSnapshot, publish: () => void) => void;
type InputHooks = (request: PromptInputRequest, operation: ReturnType<typeof configurationOperation>, audit: InputAudit) => HookDispatcher;
const runAuditVersions = new WeakMap<QueuedPromptBinding['checkRun'], Map<string, string>>();

/** Capture the effective input before any history injection, provenance claim or prompt write. */
export async function prepareExtensionInput(context: ShellRuntimeContext, request: PromptInputRequest, prepareHooks: InputHooks): Promise<PreparedPromptInput> {
  const {id, createdAt, sessionRoot, cwd, store, layout, operation, runners, checkBinding} = inputScope(context, request.sessionId);
  const signal = request.signal;
  const checkSource = () => checkBinding(signal);
  const storedSession = store.load(id);
  if (storedSession.createdAt !== createdAt || storedSession.projectRoot !== sessionRoot) throw new InputPreparationError();
  let saved = captureSessionTransition(layout)(storedSession);
  let inputPending = true;
  const check = () => {
    checkSource();
    if (inputPending) saved(checkSource);
    checkSource();
  };
  const audit = (snapshot: SessionStateSnapshot, publish: () => void) => {
    if (!inputPending) {publish(); return;}
    saved.publishState(snapshot, publish, checkSource);
  };
  try {
    const {text, images, handled, hooks} = await reduceInput(request, cwd, runners, check, () => prepareHooks(request, operation, audit));
    if (handled) return Object.freeze({status:'handled', check});
    let published = false;
    const publication = (requestEnvironment?: string) => {
      if (published) throw new InputPreparationError();
      checkSource();
      const current = store.load(id), turns = current.turns, last = turns.at(-1);
      const content = images?.length ? [{type:'text', text}, ...images] : text;
      const metadata = requestEnvironment === undefined ? request.metadata : { ...request.metadata, requestEnvironment };
      if (current.createdAt !== createdAt || current.projectRoot !== sessionRoot || current.pendingPrompt !== text
        || turns.length !== storedSession.turns.length + 1 || !sameValue(turns.slice(0, -1), storedSession.turns)
        || last?.role !== 'user' || !sameValue(last.content, content) || !sameValue(last.metadata, metadata)) throw new InputPreparationError();
      saved = captureSessionTransition(layout)(current);
      published = true; check();
    };
    return Object.freeze({status:'continue', prompt:text, ...(images ? {images} : {}), check, published:publication,
      checkWrite: () => { checkSource(); saved.verifyLocked(checkSource); checkSource(); },
      admission:inputAdmissionReceipt({sessionId:id, workspaceRoot:cwd, text, images, signal, check, hooks,
        onConsumed:() => {inputPending = false;}})});
  } catch {throw new InputPreparationError();}
}

/** Capture the audience at ingress and bind the saved conversation when a queue entry is taken. */
export function captureQueuedExtensionInput(context: ShellRuntimeContext, binding: QueuedPromptBinding,
  prepareHooks: InputHooks): ReturnType<CaptureQueuedPromptInput> {
  binding.checkRun();
  const {id, cwd, store, layout, operation, runners, checkBinding} = inputScope(context, binding.sessionId);
  const auditVersions = runAuditVersions.get(binding.checkRun) ?? new Map<string, string>();
  runAuditVersions.set(binding.checkRun, auditVersions);
  const files = [layout.sessionDir, layout.transcriptPath].map(file => ({file, path:pathIdentity(file), identity:fileIdentity(fs.lstatSync(file))}));
  const checkQueuedSource = (signal?: AbortSignal) => {
    binding.checkRun();
    checkBinding(signal);
    const current = getExtensionEventRunners(cwd, id);
    if (runners.length !== current.length || runners.some((runner, index) => current[index] !== runner)) throw new InputPreparationError();
    if (files.some(({file, path, identity}) => pathIdentity(file) !== path || fileIdentity(fs.lstatSync(file)) !== identity)) throw new InputPreparationError();
    binding.checkRun();
  };
  checkQueuedSource();
  return async (prompt, images, signal) => {
    const request = {...binding, prompt, ...(images.length ? {images} : {}), signal};
    const checkSource = () => checkQueuedSource(signal);
    checkSource();
    const saved = captureSessionTransition(layout, auditVersions)(store.load(id));
    const check = () => {checkSource(); saved(checkSource); checkSource();};
    const {text, images:effectiveImages, handled, registration} = await reduceInput(request, cwd, runners, check,
      () => prepareHooks(request, operation, (snapshot, publish) => saved.publishState(snapshot, publish, checkSource)));
    const verify = () => {check(); if (!registration()) throw new InputPreparationError();};
    return handled ? {status:'handled', check:verify} : {status:'continue', prompt:text, images:effectiveImages, check:verify};
  };
}

function inputScope(context: ShellRuntimeContext, sessionId: string) {
  const session = context.session, id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
  const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration, publication = configuration.current;
  const host = extensionHostFor(context), runners = [...getExtensionEventRunners(cwd, id)];
  const store = new SessionStoreAccess(), selected = store.readCurrentSessionSelection(root);
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), id), operation = configurationOperation(context);
  const checkBinding = (signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (operation.admission() || sessionId !== id || context.session !== session || session.id !== id || session.createdAt !== createdAt
      || session.projectRoot !== sessionRoot || context.cwd !== cwd || context.projectRoot !== root || context.configuration !== configuration
      || configuration.current !== publication || extensionHostFor(context) !== host
      || !sameValue(store.readCurrentSessionSelection(root), selected)) throw new InputPreparationError();
    for (const runner of runners) runner.admission?.();
    signal?.throwIfAborted();
  };
  return {id, createdAt, sessionRoot, cwd, store, layout, operation, runners, checkBinding};
}

async function reduceInput(request: PromptInputRequest | QueuedPromptInputRequest, cwd: string,
  runners: readonly ExtensionEventRunner[], check: () => void, prepareHooks: () => HookDispatcher) {
  const {sessionId, signal} = request;
  check();
  let event: ExtensionInputEvent = Object.freeze({type:'input', sessionId, workspaceRoot:cwd, timestamp:new Date().toISOString(),
    source:request.source, text:request.prompt, prompt:request.prompt, ...(request.images ? {images:captureInputImages(request.images)} : {}),
    ...('streamingBehavior' in request ? {streamingBehavior:request.streamingBehavior} : {})});
  let handled = false;
  const outcome = await dispatchExtensionEvent(cwd, sessionId, 'input', () => event, {runners, signal,
    admission:() => {try {check(); return undefined;} catch {return 'Prompt input source changed.';}},
    consume:result => {
      const captured = captureInputResult(result);
      handled = captured.action === 'handled';
      if (!handled) event = projectInputEvent(event, captured);
      return !handled;
    },
  });
  check();
  if (outcome.failed || outcome.cancelled && !handled) throw new InputPreparationError();
  if (request.metadata?.collaboration && (handled || event.text !== request.prompt || !sameValue(event.images, request.images))) throw new InputPreparationError();
  const images = event.images ? captureInputImages(event.images) : undefined;
  if (!handled && !event.text.trim() && !images?.length && 'streamingBehavior' in request) throw new InputPreparationError();
  const hooks = prepareHooks(); const registration = hooks.captureRegistration(); check();
  const legacy = await hooks.dispatch({eventName:'UserPromptSubmit', sessionId, workspaceRoot:cwd, timestamp:event.timestamp, prompt:event.text}, {signal});
  check();
  if (!registration() || legacy.decision === 'block' || legacy.decision === 'retry' || legacy.decision === 'unknown') throw new InputPreparationError();
  return {text:event.text, images, handled, hooks, registration};
}

function captureInputImages(images: readonly ImageContent[]): readonly ImageContent[] {
  const captured = snapshotData(images, {bytes:64*1024*1024, nodes:4096, depth:8, allowCrossRealm:true}) as unknown as readonly ImageContent[];
  return Object.freeze(captured.map(image => {
    const result = Object.freeze({type:'image' as const, data:image.data, mimeType:canonicalImageMime(image.mimeType)});
    inspectImage(result); return result;
  }));
}
