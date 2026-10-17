import type { CommandContext } from './types.js';
import { getRuntimeConfig, type RuntimeConfig } from '../../config/runtimeConfig.js';

/** Disk readbacks retain the same launch inputs and overrides as the accepted publication. */
export function readFreshConfiguration(context: Pick<CommandContext, 'cwd' | 'projectRoot' | 'readConfiguration' | 'runtimeConfig'>): RuntimeConfig {
  const publication = context.readConfiguration?.();
  const accepted = publication?.config ?? context.runtimeConfig;
  return getRuntimeConfig(context.projectRoot ?? context.cwd, publication?.binding?.overrides, accepted?.configInputs);
}

/** Persistence and publication are separate outcomes, including for command saves. */
export function configurationApplicationNotice(context: CommandContext, savedFields: readonly string[] = []): string | undefined {
  if (!context.refreshRuntimeConfig) return undefined;
  try {
    const result = context.refreshRuntimeConfig();
    if (result.status === 'applied') {
      const inputs = new Map(savedFields.flatMap(field => (result.after.configProvenance[field]?.files ?? [])
        .filter(file => file.position !== undefined).map(file => [`${file.position}:${file.path}`, file] as const)));
      if (!inputs.size) return undefined;
      return [...inputs.values()].map(file => `Explicit config input ${file.position! + 1} at ${file.path.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512)} still supplies effective settings; the save changed the primary configuration.`).join('\n');
    }
    return `Configuration was not applied (${result.status}).${result.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`;
  } catch {
    return 'Configuration application outcome is unverified.';
  }
}
