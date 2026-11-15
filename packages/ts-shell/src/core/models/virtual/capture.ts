import { types } from 'node:util';
import { THINKING_LEVELS, type ThinkingLevel } from '../effort.js';
import { snapshotData } from '../../values/data.js';
import type { ModelRoute, ModelRouteInput, CapturedVirtualModelDefinition, VirtualModelDefinition, VirtualModelMetadata } from './contract.js';

export const MAX_VIRTUAL_MODELS = 256;

function fields(value: unknown, allowed: readonly string[]): Record<string, PropertyDescriptor> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) throw new Error('Virtual model registration requires an object.');
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) {
    throw new Error('Virtual model data contains unsupported fields.');
  }
  const captured = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => !('value' in captured[key as string]!))) throw new Error('Virtual model data cannot contain accessors.');
  return captured;
}

function label(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error('Virtual model identifiers and names must be bounded nonempty text.');
  }
  return value;
}

function tokenLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('Virtual model token limits must be positive integers.');
  return value as number;
}

function levels(value: unknown): readonly ThinkingLevel[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || types.isProxy(value) || value.length > THINKING_LEVELS.length
    || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Virtual model thinking levels are invalid.');
  const result: ThinkingLevel[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !('value' in descriptor) || !THINKING_LEVELS.includes(descriptor.value) || result.includes(descriptor.value)) {
      throw new Error('Virtual model thinking levels are invalid.');
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
}

/** Capture VM and inline definitions without invoking accessors or retaining mutable metadata. */
export function captureVirtualDefinition<TState = unknown>(value: VirtualModelDefinition<TState> | CapturedVirtualModelDefinition<TState>, admission?: () => void): CapturedVirtualModelDefinition<TState> {
  const captured = fields(value, ['provider', 'id', 'name', 'thinkingLevels', 'contextWindow', 'maxTokens', 'route']);
  const route = captured.route?.value as CapturedVirtualModelDefinition<TState>['route'];
  if (typeof route !== 'function') throw new Error('Virtual model registration requires a route callback.');
  const provider = label(captured.provider?.value, 128);
  if (provider.includes('/')) throw new Error('Virtual model provider identifiers cannot contain slashes.');
  const thinkingLevels = levels(captured.thinkingLevels?.value);
  const contextWindow = tokenLimit(captured.contextWindow?.value), maxTokens = tokenLimit(captured.maxTokens?.value);
  const metadata: VirtualModelMetadata = Object.freeze({ provider, id: label(captured.id?.value, 512), name: label(captured.name?.value, 256),
    ...(thinkingLevels !== undefined ? { thinkingLevels } : {}), ...(contextWindow !== undefined ? { contextWindow } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}) });
  return Object.freeze({ ...metadata, route: async (request: ModelRouteInput<TState>) => {
    const signal = request.signal;
    const assertSignal = signal && AbortSignal.prototype.throwIfAborted.bind(signal);
    admission?.(); assertSignal?.();
    const returned = await route(request);
    admission?.(); assertSignal?.();
    const result = captureModelRoute(returned);
    admission?.(); assertSignal?.();
    return result;
  } });
}

/** Capture callback output before another promise boundary can read a then/accessor hook. */
export function captureModelRoute<TState>(value: ModelRoute<TState>): ModelRoute<TState> {
  const captured = fields(value, ['provider', 'modelId', 'thinkingLevel', 'state']);
  const provider = label(captured.provider?.value, 128), modelId = label(captured.modelId?.value, 512);
  if (provider.includes('/')) throw new Error('Virtual model provider identifiers cannot contain slashes.');
  const thinkingLevel = captured.thinkingLevel?.value as ThinkingLevel | undefined;
  if (thinkingLevel !== undefined && !THINKING_LEVELS.includes(thinkingLevel)) throw new Error('Virtual model thinking level is invalid.');
  const state = captured.state?.value === undefined ? undefined
    : snapshotData(captured.state.value, { bytes: 256 * 1024, nodes: 10_000, depth: 24, allowCrossRealm: true }) as TState;
  return Object.freeze({ provider, modelId, ...(thinkingLevel !== undefined ? { thinkingLevel } : {}), ...(state !== undefined ? { state } : {}) });
}

/** Native data slots only: a custom map, sparse array or accessor cannot bypass capture. */
export function captureVirtualDefinitions(value: readonly (VirtualModelDefinition | CapturedVirtualModelDefinition)[], admission?: () => void): readonly CapturedVirtualModelDefinition[] {
  if (!Array.isArray(value) || types.isProxy(value)) throw new Error('Virtual model registrations require an array.');
  if (value.length > MAX_VIRTUAL_MODELS) throw new Error('Virtual model registration limit exceeded.');
  if (Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Virtual model registration array contains unsupported fields.');
  const result: CapturedVirtualModelDefinition[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !('value' in descriptor)) throw new Error('Virtual model registration array requires data slots.');
    result.push(captureVirtualDefinition(descriptor.value, admission));
  }
  return Object.freeze(result);
}

/** Callback-free metadata can be composed beside the accepted physical catalogue. */
export function virtualModelMetadata(definition: VirtualModelDefinition | CapturedVirtualModelDefinition): VirtualModelMetadata {
  const { route: _route, ...metadata } = definition;
  return Object.freeze(metadata);
}
