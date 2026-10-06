import { ConfigState } from '../config/state.js';
import { getRuntimeConfig } from '../config/runtimeConfig.js';
import { loadCatalog } from '../core/models/catalogStore.js';
import type { ShellRuntimeContext } from '../core/shell/runtimeContext.js';

/** Attach a real publication to a deliberately minimal presentation fixture. */
export function withConfiguration(context: ShellRuntimeContext): ShellRuntimeContext {
  const root = context.projectRoot ?? context.cwd;
  const config = structuredClone({ ...getRuntimeConfig(root), ...context.runtimeConfig });
  return Object.assign(context, { configuration: new ConfigState(config, {
    workspaceRoot: root, sessionId: context.session.id, trustRevision: 'fixture', overrides: {},
  }, loadCatalog()) });
}
