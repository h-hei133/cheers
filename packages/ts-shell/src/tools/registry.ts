import { createUnifiedBrowserToolDefinition } from '../browser/tool/definition.js';
import type { PwRuntimeStatus } from '../browser/playwrightRuntime.js';
import { createCoreToolRegistry as createRegistry } from '../core/tools/registry.js';

export function browserTools() {
  return [createUnifiedBrowserToolDefinition()];
}

type RegistryOptions = Omit<NonNullable<Parameters<typeof createRegistry>[0]>, 'builtinTools'> & {
  readonly browserRuntimeStatus?: PwRuntimeStatus;
};

/** The installed package continues to compose the domain tools it ships. */
export function createCoreToolRegistry(options?: RegistryOptions) {
  return createRegistry({ ...options, builtinTools: browserTools() });
}
