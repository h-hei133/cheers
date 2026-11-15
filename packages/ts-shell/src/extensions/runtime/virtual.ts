import vm from 'node:vm';
import { types } from 'node:util';
import { AsyncResource } from 'node:async_hooks';
import { snapshotData } from '../../core/values/data.js';
import { captureModelRoute } from '../../core/models/virtual/capture.js';
import type { ModelRoute, ModelRouteInput, VirtualModelDefinition } from '../../core/models/virtual/contract.js';
import { redactReportText } from '../../core/security/redaction.js';
import type { ExtensionUiHost, ExtensionUiApi } from './ui.js';
import { VIRTUAL_SOURCE } from './virtualSource.js';

interface VmRoutePort {
  readonly ui: Required<ExtensionUiApi>;
  reply(id: number, ok: boolean, json: string): void;
  invoke(callback: VirtualModelDefinition['route'], id: number, json: string): void;
  cancel(id: number): void;
}

function diagnostic(error: unknown): string {
  let message = 'Virtual model callback failed.';
  if (types.isNativeError(error)) {
    const own = Object.getOwnPropertyDescriptor(error, 'message');
    if (own && 'value' in own && typeof own.value === 'string') message = own.value;
  }
  return redactReportText(message, 512);
}

function encodeResult(value: unknown): string {
  try { return JSON.stringify({ ok: true, value: captureModelRoute(value as ModelRoute) }); }
  catch (error) { return JSON.stringify({ ok: false, error: diagnostic(error) }); }
}

function requestJson(request: ModelRouteInput): string {
  if (types.isProxy(request)) throw new Error('Virtual model request requires inert data.');
  const data: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(request)) {
    if (key === 'signal') continue;
    const own = Object.getOwnPropertyDescriptor(request, key);
    if (typeof key !== 'string' || !own || !('value' in own)) throw new Error('Virtual model request requires inert data.');
    data[key] = own.value;
  }
  return JSON.stringify(snapshotData(data, { bytes: 8 * 1024 * 1024, nodes: 100_000, depth: 32 }));
}

/** File callbacks receive VM data and primitive replies, while the original host owns admission/UI. */
export function createVirtualBridge(context: vm.Context, ui: Required<ExtensionUiHost>) {
  let sequence = 0;
  let port: VmRoutePort;
  const routes = new Map<number, { resolve(value: ModelRoute): void; reject(error: unknown): void; cleanup(): void }>();
  const dialogs = new Map<number, AbortController>();
  const sendUi = (id: number, method: string, json: string): string => {
    try {
      if (!Number.isSafeInteger(id) || id < 1 || typeof json !== 'string') throw new Error('Invalid virtual UI request.');
      if (method === 'cancel') { dialogs.get(id)?.abort(); return ''; }
      if (!['select', 'confirm', 'input', 'editor', 'notify', 'setStatus', 'setWidget', 'setTitle', 'setEditorText'].includes(method)) {
        throw new Error('Invalid virtual UI method.');
      }
      if (Buffer.byteLength(json) > 256 * 1024) throw new Error('Virtual UI request exceeds its size limit.');
      const args = snapshotData(JSON.parse(json), { bytes: 256 * 1024, nodes: 10_000, depth: 16 });
      if (!Array.isArray(args)) throw new Error('Invalid virtual UI arguments.');
      const dialog = ['select', 'confirm', 'input', 'editor'].includes(method);
      const parameters: unknown[] = [...args];
      if ((method === 'input' || method === 'editor') && parameters[1] === null) parameters[1] = undefined;
      if (['notify', 'setStatus', 'setWidget'].includes(method) && parameters[1] === null) parameters[1] = undefined;
      if (method === 'setWidget' && parameters[2] === null) parameters[2] = undefined;
      if (dialog) {
        const controller = new AbortController(); dialogs.set(id, controller);
        const options = parameters[parameters.length - 1] as { timeout?: number };
        if (!options || typeof options !== 'object') throw new Error('Invalid virtual UI options.');
        parameters[parameters.length - 1] = { timeout: options.timeout, signal: controller.signal };
      }
      const value = Reflect.apply(ui[method as keyof ExtensionUiHost]!, ui, parameters) as unknown;
      if (dialog) {
        void Promise.resolve(value).then(result => {
          const json = result === undefined ? '' : JSON.stringify(snapshotData(result, { bytes: 256 * 1024, nodes: 10_000, depth: 16 }));
          port.reply(id, true, json);
        }, failure => port.reply(id, false, diagnostic(failure))).catch(() => {
          try { port.reply(id, false, 'Virtual UI reply failed.'); } catch { /* A failed VM receiver cannot escape as a host rejection. */ }
        }).finally(() => dialogs.delete(id));
      }
      return '';
    } catch (error) { dialogs.delete(id); return diagnostic(error); }
  };
  const settle = (id: number, ok: boolean, json: string): void => {
    const entry = routes.get(id);
    if (!entry) return;
    routes.delete(id); entry.cleanup();
    try {
      if (!ok) throw new Error(json);
      const parsed = JSON.parse(json) as { ok: boolean; value?: ModelRoute; error?: string };
      if (!parsed.ok) throw new Error(parsed.error ?? 'Virtual model callback failed.');
      entry.resolve(captureModelRoute(parsed.value!));
    } catch (error) { entry.reject(error); }
  };
  for (const [name, callback] of Object.entries({ __virtualUi: sendUi, __virtualSettle: settle, __virtualCapture: encodeResult, __virtualDiagnostic: diagnostic })) {
    Object.defineProperty(context, name, { value: Object.setPrototypeOf(callback, null), configurable: true });
  }
  port = new vm.Script(VIRTUAL_SOURCE).runInContext(context) as VmRoutePort;
  return {
    ui: port.ui,
    invoke(callback: VirtualModelDefinition['route'], request: ModelRouteInput): Promise<ModelRoute> {
      const json = requestJson(request), id = ++sequence;
      const signal = request.signal;
      const assertSignal = signal && AbortSignal.prototype.throwIfAborted.bind(signal);
      assertSignal?.();
      return new Promise((resolve, reject) => {
        const owner = new AsyncResource('extension-virtual-route');
        const cleanup = () => {
          if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', cancel);
          owner.emitDestroy();
        };
        const cancel = () => {
          routes.delete(id);
          try { owner.runInAsyncScope(() => port.cancel(id)); } catch { /* A VM listener cannot veto host cancellation. */ }
          cleanup();
          try { assertSignal?.(); } catch (error) { reject(error); return; }
          reject(new Error('Virtual model request was cancelled.'));
        };
        routes.set(id, { resolve, reject, cleanup });
        if (signal) EventTarget.prototype.addEventListener.call(signal, 'abort', cancel, { once: true });
        try { assertSignal?.(); port.invoke(callback, id, json); }
        catch (error) { routes.delete(id); cleanup(); reject(error); }
      });
    },
  };
}
