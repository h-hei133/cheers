import { effortCapability } from '../../../core/models/capability.js';
import { loadCatalog } from '../../../core/models/catalogStore.js';
import { captureModelChoice } from '../../../core/commands/model/choice.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { catalogProvider } from '../../../core/models/catalog.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { runThinkingCommand } from '../../../core/commands/thinkingCommandRuntime.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker, PickerOutcome } from '../overlay.js';
import { modelBrowserOwned } from './model/owner.js';
import { providerCredentialBaseUrl } from '../../../core/auth/account/target.js';

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
export function thinkingPicker(context: CommandContext, back?: (notice?: string) => Picker): Picker {
  let choice: ReturnType<typeof captureModelChoice> | undefined;
  let initial: string | undefined;
  let generation = 0, offered = false, retired = false;
  let pending: number | undefined;
  return {
    title: 'Thinking effort',
    form: 'panel',
    acceptsOwnership: true,
    get initialSelection() { return initial; },
    onOpen() { generation++; offered = false; retired = false; pending = undefined; choice = undefined; },
    previewEnd() { generation++; offered = false; retired = true; pending = undefined; },
    ...(back ? { back, footer: 'Enter saves for the current session · Esc returns to settings' } : {}),
    empty: 'No effort levels are available for the selected model.',
    async load(): Promise<readonly Option[]> {
      if (retired) return [];
      generation++; offered = false; pending = undefined;
      try { choice = captureModelChoice(context); } catch { choice = undefined; }
      const publication = context.readConfiguration?.();
      const config = choice?.config ?? publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
      const catalog = choice?.catalog ?? publication?.catalog ?? loadCatalog();
      const target = context.resolveConfigTarget?.(config, context.sessionId)
        ?? resolveProviderCredential({ runtimeConfig: config, ...(context.sessionId ? { pool: { sessionId: context.sessionId } } : {}) });
      const { provider, model } = target;
      const baseUrl = providerCredentialBaseUrl(catalog, target);
      const current = captureThinkingPreference(context.projectRoot ?? context.cwd, target.thinkingEffort);
      initial = current.thinkingEffort ?? 'auto';
      const ambiguous = catalogProvider(catalog, provider, baseUrl).ambiguous;
      offered = choice !== undefined;
      return LEVELS.map(level => {
        const effort = level === 'auto' ? null : level;
        const capability = effortCapability(catalog, provider, model, effort, baseUrl);
        const active = current.thinkingEffort === effort;
        return {
          id: level,
          label: level === 'auto' ? 'auto (provider decides)' : level,
          detail: level === 'auto' ? 'No explicit effort is sent.' : `Request ${level} reasoning effort.`,
          note: ambiguous ? 'model catalogue endpoint is ambiguous' : active ? 'active' : capability,
          disabled: ambiguous || capability === 'unsupported',
          ...(active && (ambiguous || capability === 'unsupported') ? { focusable: true } : {}),
        };
      });
    },
    async apply(ids: readonly string[], stillOwned?: () => boolean): Promise<PickerOutcome | undefined> {
      if (!offered || retired || !choice || context.signal?.aborted || pending !== undefined || ids.length !== 1) return undefined;
      const level = ids[0];
      if (!level || !(LEVELS as readonly string[]).includes(level)) return undefined;
      const captured = choice, revision = generation;
      const current = () => {
        if (!offered || retired || generation !== revision) return false;
        if (context.signal?.aborted || (stillOwned && !stillOwned())) { offered = false; retired = true; }
        return offered && !retired;
      };
      const admission = () => {
        if (!current()) return 'Thinking selection cancelled. Reopen the picker.';
        const refusal = captured.admission();
        return current() ? refusal : 'Thinking selection cancelled. Reopen the picker.';
      };
      const expired = admission();
      if (!current()) return undefined;
      if (expired) {
        const returning = back && modelBrowserOwned(context);
        if (!current()) return undefined;
        offered = false; retired = true;
        return { note: expired, ...(returning ? { next: back(expired) } : {}) };
      }
      pending = revision;
      try {
        const result = await runThinkingCommand([level === 'auto' ? 'off' : level], { ...context, admission });
        const returning = current() && back && modelBrowserOwned(context);
        const owned = current();
        if (generation === revision) { offered = false; retired = true; }
        // A completed write keeps its result even if its accepted host has closed.
        return result.kind === 'local' ? { note: result.output, ...(owned && returning ? { next: back(result.output) } : {}) } : undefined;
      } finally { if (pending === revision) pending = undefined; }
    },
  };
}
