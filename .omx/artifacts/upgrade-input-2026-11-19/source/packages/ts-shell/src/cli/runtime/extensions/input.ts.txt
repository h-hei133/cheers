import type {ShellRuntimeContext} from '../../../core/shell/runtimeContext.js';
import type {PromptInputRequest, PreparedPromptInput} from '../../../core/shell/input/contract.js';
import {InputPreparationError} from '../../../core/shell/input/contract.js';
import {configurationOperation} from '../../../core/shell/scope.js';
import {dispatchExtensionEvent, getExtensionEventRunners} from '../../../core/hooks/extensionBridge.js';
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

/** Capture the effective input before any history injection, provenance claim or prompt write. */
export async function prepareExtensionInput(context: ShellRuntimeContext, request: PromptInputRequest,
  prepareHooks: (operation: ReturnType<typeof configurationOperation>, audit: (snapshot: SessionStateSnapshot, publish: () => void) => void) => HookDispatcher): Promise<PreparedPromptInput> {
  const session = context.session, id = session.id, createdAt = session.createdAt, sessionRoot = session.projectRoot;
  const cwd = context.cwd, root = context.projectRoot, configuration = context.configuration, publication = configuration.current;
  const host = extensionHostFor(context), runners = [...getExtensionEventRunners(cwd, id)], signal = request.signal;
  const store = new SessionStoreAccess(), storedSession = store.load(id), selected = store.readCurrentSessionSelection(root);
  if (storedSession.createdAt !== createdAt || storedSession.projectRoot !== sessionRoot) throw new InputPreparationError();
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), id);
  let saved = captureSessionTransition(layout)(storedSession);
  const operation = configurationOperation(context);
  const checkSource = () => {
    signal.throwIfAborted();
    const refusal = operation.admission();
    if (refusal || request.sessionId !== id || context.session !== session || session.id !== id || session.createdAt !== createdAt || session.projectRoot !== sessionRoot
      || context.cwd !== cwd || context.projectRoot !== root || context.configuration !== configuration || configuration.current !== publication
      || extensionHostFor(context) !== host) throw new InputPreparationError();
    for (const runner of runners) runner.admission?.();
    signal.throwIfAborted();
  };
  let inputPending = true;
  const check = () => {
    checkSource();
    if (inputPending) saved(() => {if (!sameValue(store.readCurrentSessionSelection(root), selected)) throw new InputPreparationError();});
    checkSource();
  };
  const audit = (snapshot: SessionStateSnapshot, publish: () => void) => {
    if (!inputPending) {publish(); return;}
    saved.publishState(snapshot, publish, () => {
      checkSource();
      if (!sameValue(store.readCurrentSessionSelection(root), selected)) throw new InputPreparationError();
    });
  };
  try {
    check();
    let event: ExtensionInputEvent = Object.freeze({type:'input', sessionId:id, workspaceRoot:cwd, timestamp:new Date().toISOString(),
      source:request.source, text:request.prompt, prompt:request.prompt, ...(request.images ? {images:captureInputImages(request.images)} : {})});
    let handled = false;
    const outcome = await dispatchExtensionEvent(cwd, id, 'input', () => event, {runners, signal,
      admission:() => {try {check(); return undefined;} catch {return 'Prompt input source changed.';}},
      consume:result => {const captured = captureInputResult(result); handled = captured.action === 'handled'; if(!handled) event = projectInputEvent(event, captured); return !handled;},
    });
    check();
    if (outcome.failed || outcome.cancelled && !handled) throw new InputPreparationError();
    if (request.metadata?.collaboration && (handled || event.text !== request.prompt || !sameValue(event.images, request.images))) throw new InputPreparationError();
    const images = event.images ? captureInputImages(event.images) : undefined;
    const hooks = prepareHooks(operation, audit); check();
    const legacy = await hooks.dispatch({eventName:'UserPromptSubmit', sessionId:id, workspaceRoot:cwd, timestamp:event.timestamp, prompt:event.text}, {signal});
    check();
    if (legacy.decision === 'block' || legacy.decision === 'retry' || legacy.decision === 'unknown') throw new InputPreparationError();
    if (handled) return Object.freeze({status:'handled', check});
    let published = false;
    const publication = () => {
      if (published) throw new InputPreparationError();
      checkSource();
      const current = store.load(id), turns = current.turns, last = turns.at(-1);
      const content = images?.length ? [{type:'text', text:event.text}, ...images] : event.text;
      if (current.createdAt !== createdAt || current.projectRoot !== sessionRoot || current.pendingPrompt !== event.text
        || turns.length !== storedSession.turns.length + 1 || !sameValue(turns.slice(0, -1), storedSession.turns)
        || last?.role !== 'user' || !sameValue(last.content, content) || !sameValue(last.metadata, request.metadata)) throw new InputPreparationError();
      saved = captureSessionTransition(layout)(current);
      published = true; check();
    };
    return Object.freeze({status:'continue', prompt:event.text, ...(images ? {images} : {}), check, published:publication,
      admission:inputAdmissionReceipt({sessionId:id, workspaceRoot:cwd, text:event.text, images, signal, check, hooks,
        onConsumed:() => {inputPending = false;}})});
  } catch {throw new InputPreparationError();}
}

function captureInputImages(images: readonly ImageContent[]): readonly ImageContent[] {
  const captured = snapshotData(images, {bytes:64*1024*1024, nodes:4096, depth:8, allowCrossRealm:true}) as unknown as readonly ImageContent[];
  return Object.freeze(captured.map(image => {
    const result = Object.freeze({type:'image' as const, data:image.data, mimeType:canonicalImageMime(image.mimeType)});
    inspectImage(result); return result;
  }));
}
