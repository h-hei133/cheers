import { randomUUID } from "node:crypto";
import type {
  RpcExtensionUiRequest,
  RpcExtensionUiResponse,
  RpcUiBridge,
  RpcUiDialogOptions,
} from "./protocol.js";

export type { RpcUiBridge, RpcUiDialogOptions };
interface PendingUiRequest {
  readonly resolve: (response: RpcExtensionUiResponse | undefined) => void;
  readonly cleanup: () => void;
}

/** Create a bidirectional RPC UI bridge tracking pending dialog prompts over JSONL. */
export function createRpcUiBridge(emit: (request: RpcExtensionUiRequest) => void): RpcUiBridge {
  const pending = new Map<string, PendingUiRequest>();

  const requestDialog = <T>(
    build: (id: string) => RpcExtensionUiRequest,
    defaultValue: T,
    extract: (response: RpcExtensionUiResponse) => T,
    opts?: RpcUiDialogOptions,
  ): Promise<T> => {
    if (opts?.signal?.aborted) return Promise.resolve(defaultValue);
    const id = randomUUID();
    return new Promise<T>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => settle(undefined);
      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        opts?.signal?.removeEventListener("abort", onAbort);
        pending.delete(id);
      };
      const settle = (response: RpcExtensionUiResponse | undefined) => {
        cleanup();
        if (!response || ("cancelled" in response && response.cancelled)) {
          resolve(defaultValue);
          return;
        }
        resolve(extract(response));
      };
      pending.set(id, { resolve: settle, cleanup });
      opts?.signal?.addEventListener("abort", onAbort, { once: true });
      if (opts?.timeout !== undefined && opts.timeout > 0) {
        timer = setTimeout(() => settle(undefined), opts.timeout);
      }
      emit(build(id));
    });
  };

  return {
    select: (title, options, opts) => requestDialog(
      id => ({ type: "extension_ui_request", id, method: "select", title, options, ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
      undefined,
      res => ("value" in res ? res.value : undefined),
      opts,
    ),
    confirm: (title, message, opts) => requestDialog(
      id => ({ type: "extension_ui_request", id, method: "confirm", title, message, ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
      false,
      res => ("confirmed" in res ? res.confirmed : false),
      opts,
    ),
    input: (title, placeholder, opts) => requestDialog(
      id => ({ type: "extension_ui_request", id, method: "input", title, ...(placeholder !== undefined ? { placeholder } : {}), ...(opts?.timeout !== undefined ? { timeout: opts.timeout } : {}) }),
      undefined,
      res => ("value" in res ? res.value : undefined),
      opts,
    ),
    editor: (title, prefill) => requestDialog(
      id => ({ type: "extension_ui_request", id, method: "editor", title, ...(prefill !== undefined ? { prefill } : {}) }),
      undefined,
      res => ("value" in res ? res.value : undefined),
    ),
    notify: (message, notifyType) => emit({ type: "extension_ui_request", id: randomUUID(), method: "notify", message, ...(notifyType ? { notifyType } : {}) }),
    setStatus: (statusKey, statusText) => emit({ type: "extension_ui_request", id: randomUUID(), method: "setStatus", statusKey, statusText }),
    setWidget: (widgetKey, widgetLines, widgetPlacement) => emit({ type: "extension_ui_request", id: randomUUID(), method: "setWidget", widgetKey, widgetLines, ...(widgetPlacement ? { widgetPlacement } : {}) }),
    setTitle: (title) => emit({ type: "extension_ui_request", id: randomUUID(), method: "setTitle", title }),
    setEditorText: (text) => emit({ type: "extension_ui_request", id: randomUUID(), method: "set_editor_text", text }),
    handleUiResponse: (response) => {
      const entry = pending.get(response.id);
      if (!entry) return false;
      entry.resolve(response);
      return true;
    },
    pendingCount: () => pending.size,
    dispose: () => {
      for (const entry of [...pending.values()]) entry.resolve(undefined);
    },
  };
}
