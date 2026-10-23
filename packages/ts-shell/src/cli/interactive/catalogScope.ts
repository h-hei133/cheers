import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { SlashCatalogScope } from '../../entrypoints/slashCommandRegistry.js';

/** The accepted runtime identity used by slash completion and picker admission. */
export function catalogScope(context: Pick<ShellRuntimeContext, 'cwd' | 'session' | 'runtimeConfig'>): SlashCatalogScope {
  return {
    root: context.cwd,
    sessionId: context.session.id,
    runtimeConfig: context.runtimeConfig,
  };
}
