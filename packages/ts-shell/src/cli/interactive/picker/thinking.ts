import { effortCapability } from '../../../core/models/capability.js';
import { loadCatalog } from '../../../core/models/catalogStore.js';
import { currentModelPreference } from '../../../core/commands/model/preference.js';
import { runThinkingCommand } from '../../../core/commands/thinkingCommandRuntime.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import type { ThinkingPreference } from '../../../core/models/effort.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker, PickerOutcome } from '../overlay.js';

const LEVELS = ['auto', 'low', 'medium', 'high'] as const;

/**
 * Reasoning-effort chooser.
 *
 * The catalogue decides what each level means for the selected model: a level
 * the model cannot honour is shown disabled with the reason, and an unknown
 * capability is reported as unverified rather than treated as zero or as
 * supported. Selecting a level goes through the ordinary `/thinking` command,
 * so the same session/connection precedence applies.
 */
export function thinkingPicker(context: CommandContext): Picker {
  const preference = (): { readonly model?: string; readonly thinkingEffort: ThinkingPreference | null } => {
    const config = context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
    const current = currentModelPreference(config, context.projectRoot ?? context.cwd);
    return { ...(current.model ? { model: current.model } : {}), thinkingEffort: current.thinkingEffort };
  };
  return {
    title: 'Thinking effort',
    form: 'panel',
    empty: 'No effort levels are available for the selected model.',
    async load(): Promise<readonly Option[]> {
      const current = preference();
      const publication = context.readConfiguration?.();
      const catalog = publication?.catalog ?? loadCatalog();
      const target = context.resolveConfigTarget?.(publication?.config ?? context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd));
      const provider = target?.provider ?? 'openai';
      const model = target?.model ?? current.model;
      return LEVELS.map(level => {
        const effort = level === 'auto' ? null : level;
        const capability = effortCapability(catalog, provider, model, effort);
        const active = current.thinkingEffort === effort;
        return {
          id: level,
          label: level === 'auto' ? 'auto (provider decides)' : level,
          detail: level === 'auto' ? 'No explicit effort is sent.' : `Request ${level} reasoning effort.`,
          note: active ? 'active' : capability,
          disabled: capability === 'unsupported',
        };
      });
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const level = ids[0];
      if (!level || !(LEVELS as readonly string[]).includes(level)) return undefined;
      const result = await runThinkingCommand([level === 'auto' ? 'off' : level], context);
      return result.kind === 'local' ? { note: result.output } : undefined;
    },
  };
}
