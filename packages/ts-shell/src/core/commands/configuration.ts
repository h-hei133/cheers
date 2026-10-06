import type { CommandContext } from './types.js';

/** Persistence and publication are separate outcomes, including for command saves. */
export function configurationApplicationNotice(context: CommandContext): string | undefined {
  if (!context.refreshRuntimeConfig) return undefined;
  try {
    const result = context.refreshRuntimeConfig();
    if (result.status === 'applied') return undefined;
    return `Configuration was not applied (${result.status}).${result.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`;
  } catch {
    return 'Configuration application outcome is unverified.';
  }
}
