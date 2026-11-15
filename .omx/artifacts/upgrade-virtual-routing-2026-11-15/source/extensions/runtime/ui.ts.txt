import type { ModelRouteSignal } from '../../core/models/virtual/contract.js';

export interface ExtensionUiDialogOptions {
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/** Callback-side cancellation is observable data; host dialog options retain native signals. */
export interface ExtensionUiRequestOptions {
  readonly timeout?: number;
  readonly signal?: ModelRouteSignal;
}

export interface ExtensionUiApi extends Omit<ExtensionUiHost, 'select' | 'confirm' | 'input' | 'editor'> {
  readonly select?: (title: string, options: readonly string[], opts?: ExtensionUiRequestOptions) => Promise<string | undefined>;
  readonly confirm?: (title: string, message: string, opts?: ExtensionUiRequestOptions) => Promise<boolean>;
  readonly input?: (title: string, placeholder?: string, opts?: ExtensionUiRequestOptions) => Promise<string | undefined>;
  readonly editor?: (title: string, prefill?: string, opts?: ExtensionUiRequestOptions) => Promise<string | undefined>;
}

export interface ExtensionUiHost {
  readonly select?: (title: string, options: readonly string[], opts?: ExtensionUiDialogOptions) => Promise<string | undefined>;
  readonly confirm?: (title: string, message: string, opts?: ExtensionUiDialogOptions) => Promise<boolean>;
  readonly input?: (title: string, placeholder?: string, opts?: ExtensionUiDialogOptions) => Promise<string | undefined>;
  readonly editor?: (title: string, prefill?: string, opts?: ExtensionUiDialogOptions) => Promise<string | undefined>;
  readonly notify?: (message: string, notifyType?: 'info' | 'warning' | 'error') => void;
  readonly setStatus?: (statusKey: string, statusText: string | undefined) => void;
  readonly setWidget?: (widgetKey: string, widgetLines: readonly string[] | undefined, placement?: 'aboveEditor' | 'belowEditor') => void;
  readonly setTitle?: (title: string) => void;
  readonly setEditorText?: (text: string) => void;
}

export interface ExtensionUiSource {
  readonly host: ExtensionUiHost | undefined;
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
}

/** A missing surface is unavailable; a retired surface cancels without later effects. */
export function resolveUiHost(source: () => ExtensionUiSource, admission?: () => void): Required<ExtensionUiHost> {
  const dialog = <T>(method: 'select' | 'confirm' | 'input' | 'editor', args: readonly unknown[], fallback: T, opts?: ExtensionUiDialogOptions): Promise<T> => {
    admission?.();
    const captured = source();
    if (captured.admission?.() || captured.signal?.aborted || opts?.signal?.aborted) return Promise.resolve(fallback);
    const call = captured.host?.[method];
    if (!call) return Promise.reject(new Error('Extension UI is unavailable.'));
    return runDialog(captured, opts, fallback, resolved => Reflect.apply(call, captured.host, [...args, resolved]) as Promise<T>);
  };
  const effect = (method: 'notify' | 'setStatus' | 'setWidget' | 'setTitle' | 'setEditorText', args: readonly unknown[]): void => {
    admission?.();
    const captured = source();
    if (captured.admission?.() || captured.signal?.aborted) return;
    const call = captured.host?.[method];
    if (!call) throw new Error('Extension UI is unavailable.');
    Reflect.apply(call, captured.host, args);
  };
  const ui: Required<ExtensionUiHost> = {
    select: (title, options, opts) => {
      if (!Array.isArray(options) || options.length > 256 || options.some(option => typeof option !== 'string' || Buffer.byteLength(option) > 512)) {
        return Promise.reject(new Error('Extension choices exceed the UI input limit.'));
      }
      const choices = Object.freeze([...options]);
      return dialog<string | undefined>('select', [title, choices], undefined, opts)
        .then(value => value !== undefined && choices.includes(value) ? value : undefined);
    },
    confirm: (title, message, opts) => dialog('confirm', [title, message], false, opts),
    input: (title, placeholder, opts) => dialog('input', [title, placeholder], undefined, opts),
    editor: (title, prefill, opts) => dialog('editor', [title, prefill], undefined, opts),
    notify: (message, kind) => effect('notify', [message, kind]),
    setStatus: (key, value) => effect('setStatus', [key, value]),
    setWidget: (key, value, placement) => effect('setWidget', [key, value, placement]),
    setTitle: title => effect('setTitle', [title]),
    setEditorText: text => effect('setEditorText', [text]),
  };
  for (const call of Object.values(ui)) Object.setPrototypeOf(call, null);
  return Object.freeze(Object.setPrototypeOf(ui, null));
}

function runDialog<T>(source: ExtensionUiSource, opts: ExtensionUiDialogOptions | undefined, fallback: T,
  call: (options: ExtensionUiDialogOptions) => Promise<T>): Promise<T> {
  if (opts?.timeout !== undefined && (!Number.isFinite(opts.timeout) || opts.timeout <= 0)) {
    return Promise.reject(new Error('Extension UI timeout must be positive and finite.'));
  }
  const controller = new AbortController();
  const captured = opts ? { timeout: opts.timeout, signal: opts.signal } : undefined;
  const signals = [...new Set([source.signal, captured?.signal].filter((signal): signal is AbortSignal => signal !== undefined))];
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (value: T, failed = false, error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', cancel);
      controller.abort();
      if (failed) reject(error); else resolve(value);
    };
    const cancel = () => finish(fallback);
    for (const signal of signals) signal.addEventListener('abort', cancel, { once: true });
    if (signals.some(signal => signal.aborted)) { cancel(); return; }
    if (captured?.timeout !== undefined) timer = setTimeout(cancel, Math.min(captured.timeout, 2_147_483_647));
    // Observe a host that settles after cancellation, including a late rejection.
    Promise.resolve().then(() => settled ? fallback : call({ ...captured, signal: controller.signal }))
      .then(value => {
        if (settled) return;
        try {
          // Revalidate the captured owner without resolving a replacement surface.
          finish(source.admission?.() ? fallback : value);
        } catch (error) { finish(fallback, true, error); }
      }, error => finish(fallback, true, error));
  });
}
