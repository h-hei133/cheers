import { Script, type Context } from 'node:vm';
import { types } from 'node:util';
import type { CustomAgentMessage } from '../../core/agent/custom.js';
import { snapshotData } from '../../core/values/data.js';

export type ExtensionMessageRenderer = (message: Readonly<CustomAgentMessage>) => string | undefined;

export interface RegisteredMessageRenderer {
  readonly customType: string;
  readonly render: ExtensionMessageRenderer;
}

export const MAX_MESSAGE_RENDERERS = 64;

export function captureMessageRenderer(customType: unknown, render: unknown): RegisteredMessageRenderer {
  if (typeof customType !== 'string' || !/^[\w.-]{1,128}$/.test(customType)
    || typeof render !== 'function' || types.isProxy(render)) throw new Error('Invalid custom message renderer.');
  return Object.freeze({ customType, render: render as ExtensionMessageRenderer });
}

export function invokeMessageRenderer(render: ExtensionMessageRenderer, message: CustomAgentMessage,
  invoke?: (callback: ExtensionMessageRenderer, json: string) => unknown): string | undefined {
  const captured = snapshotData(message, { bytes: 256 * 1024, nodes: 4096, depth: 24 });
  const result = invoke ? invoke(render, JSON.stringify(captured)) : render(captured as unknown as CustomAgentMessage);
  if (types.isPromise(result)) {
    void Promise.prototype.then.call(result, undefined, () => undefined);
    return undefined;
  }
  return typeof result === 'string' && Buffer.byteLength(result) <= 32 * 1024 ? result : undefined;
}

/** File renderers receive only VM-owned data and return primitive text. */
export function createMessageRendererBridge(context: Context) {
  const port = '__cheersRenderMessage';
  const initialize = new Script(`(() => {
    const parse = JSON.parse, keys = Object.keys, freeze = Object.freeze;
    const then = Promise.prototype.then, apply = Reflect.apply;
    const lock = value => {
      if (value && typeof value === 'object') {
        for (const key of keys(value)) lock(value[key]);
        freeze(value);
      }
      return value;
    };
    return (render, json) => {
      const value = render(lock(parse(json)));
      if (typeof value === 'string' || value === undefined) return value;
      try { apply(then, value, [undefined, () => undefined]); } catch {}
    };
  })()`);
  const invoke = initialize.runInContext(context) as (render: ExtensionMessageRenderer, json: string) => unknown;
  const renderScript = new Script(`${port}()`);
  return (render: ExtensionMessageRenderer, json: string): unknown => {
    if (Object.hasOwn(context, port)) return undefined;
    const run = () => invoke(render, json);
    Object.defineProperty(context, port, { value: Object.setPrototypeOf(run, null), configurable: true });
    try { return renderScript.runInContext(context, { timeout: 25 }); }
    finally { delete context[port]; }
  };
}
