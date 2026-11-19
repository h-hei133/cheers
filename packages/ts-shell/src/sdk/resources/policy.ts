import type {RuntimeConfigOverrides} from '../../config/runtimeConfig.js';
import type {LoadExtensionsResult} from '../resourceLoader.js';

export interface SdkToolPolicy {
  readonly noTools?: 'all' | 'builtin';
  readonly tools?: readonly string[];
  readonly excludeTools?: readonly string[];
  readonly customToolNames: readonly string[];
}

/** Original caller choices define successor tool admission. */
export function resolveSdkToolPolicy(options: SdkToolPolicy, resources: LoadExtensionsResult) {
  const excluded = new Set(options.excludeTools ?? []);
  const extra = [...options.customToolNames, ...resources.extensions.flatMap(entry => entry.extension.tools.map(tool => tool.name))];
  if (options.noTools === 'all') return {allowedTools:[] as readonly string[]};
  if (options.noTools === 'builtin') return {allowedTools:extra.filter(name => !excluded.has(name))};
  if (options.tools) return {allowedTools:options.tools.filter(name => !excluded.has(name))};
  return excluded.size ? {disabledTools:[...excluded]} : {};
}

/** Capture arrays before asynchronous initialization can mutate the caller's options. */
export function captureSdkToolPolicy(options: Omit<SdkToolPolicy, 'customToolNames'> & {readonly customTools?: readonly {readonly name: string}[]}): SdkToolPolicy {
  return Object.freeze({noTools:options.noTools, ...(options.tools ? {tools:Object.freeze([...options.tools])} : {}),
    ...(options.excludeTools ? {excludeTools:Object.freeze([...options.excludeTools])} : {}),
    customToolNames:Object.freeze((options.customTools ?? []).map(tool => tool.name))});
}

/** SDK filtering intersects restrictions captured before its generated allowlist. */
export function boundedSdkToolPolicy(policy: SdkToolPolicy, resources: LoadExtensionsResult, overrides: RuntimeConfigOverrides) {
  const resolved = resolveSdkToolPolicy(policy, resources);
  const requested = resolved.allowedTools;
  const outer = overrides.allowedTools;
  return {...resolved, ...(requested !== undefined ? {allowedTools:outer === undefined ? requested : requested.filter(name => outer.includes(name))} : {})};
}
