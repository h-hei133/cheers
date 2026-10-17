import { projectSessionModel } from "../../../session/model/projection.js";
import { runModelCommand } from "../../../core/commands/modelCommandRuntime.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { availabilityLabel, availabilitySnapshot } from "../../../core/models/availability.js";
import { resolveProviderCredential } from "../../../core/shell/providerCredentials.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { applyModelPreset } from "../../../core/commands/model/preset.js";
import { readProfilePresets } from "../../../core/commands/model/presetStore.js";
import { readSessionModel } from "../../../session/model/state.js";

/**
 * Model chooser, grouped by provider.
 *
 * A model name is not an address: several providers serve the same names, at
 * different endpoints and different prices. So every row carries its provider, and
 * applying sends `<provider>/<model>` — a choice made here says exactly as much as
 * a choice typed, which is what keeps the two from diverging.
 *
 * A row is selectable only when `/model use` can actually apply it: a model of the
 * provider behind the active connection. Rows elsewhere stay visible, with the
 * reason they cannot be applied, because hiding them would make the catalogue look
 * smaller than it is.
 */
export function modelPicker(context: CommandContext): Picker {
  const details = new Map<string, readonly string[]>();
  return {
    title: "Model",
    form: "panel",
    empty: "No providers in the catalogue.",
    async load(): Promise<readonly Option[]> {
      const publication = context.readConfiguration?.();
      const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
      const catalog = publication?.catalog ?? loadCatalog();
      const active = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
      const projected = availabilitySnapshot({ config, catalog });
      const availability = { ...projected, activeProvider: active.provider,
        ...(active.model ? { activeModel: active.model } : {}) };
      const activeProvider = availability.activeProvider;
      const activeModel = availability.activeModel;
      const providers = new Map(availability.providers.map(provider => [provider.provider, provider]));

      const rows: Option[] = [];
      details.clear();
      for (const provider of ordered(catalog, providers)) {
        const entry = providers.get(provider.runtime);
        const state = entry?.state ?? 'unknown';
        const selectable = provider.runtime === activeProvider;
        const endpoint = entry?.endpoint ? ` · ${entry.endpoint}` : '';
        if (provider.models.length === 0) {
          const id = `${provider.id}/`;
          rows.push({
            id,
            label: provider.label,
            detail: `${availabilityLabel(state)}${endpoint}`,
            note: selectable ? "no models listed" : "switch connection first",
            disabled: true,
          });
          details.set(id, modelDetails(provider.label, provider.runtime, entry, state, undefined, selectable));
          continue;
        }
        for (const model of provider.models) {
          const active = provider.runtime === activeProvider && model.id === activeModel;
          const id = `${provider.id}/${model.id}`;
          rows.push({
            id,
            label: model.id,
            detail: `${provider.label}${model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : ""}${selectable ? endpoint : ""}`,
            note: active ? "active" : selectable ? availabilityLabel(state) : "switch connection first",
            ...(selectable ? {} : { disabled: true }),
          });
          details.set(id, modelDetails(provider.label, provider.runtime, entry, state, model.contextWindow, selectable));
        }
      }
      // Saved presets are separate rows: applying one resolves every role and
      // then selects its default role, rather than treating the name as a model.
      if (context.sessionId) {
        try {
          const presets = { ...readProfilePresets(), ...(readSessionModel(context.sessionId)?.presets ?? {}) };
          for (const [name, preset] of Object.entries(presets)) {
            const roles = Object.entries(preset.roles).map(([role, target]) => `${role}=${target.provider}/${target.model}`).join(", ");
            rows.push({ id: `preset:${name}`, label: `Preset: ${name}`, detail: roles, note: "saved" });
          }
        } catch {
          rows.push({ id: "preset:unavailable", label: "Model presets unavailable", detail: "The preset library could not be read; models above are unaffected.", disabled: true });
        }
      }
      return rows;
    },
    // The detail column keeps the row short while still saying which relay a
    // same-named model belongs to and why an unavailable row cannot be used.
    detail: id => (id ? details.get(id) ?? [] : []),
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (!chosen) return undefined;
      if (chosen.startsWith("preset:")) {
        if (!context.sessionId) return { note: "Presets require a bound session." };
        return { note: await applyModelPreset(context.sessionId, chosen.slice("preset:".length), "default", context) };
      }
      // A catalogue id is not always the runtime name (a custom relay is listed
      // under its own id). `/model use` reads a leading known provider id as a
      // provider switch, which is refused for a relay; a bare model keeps the
      // active connection and is what the row actually means.
      const separator = chosen.indexOf('/');
      const entry = separator > 0 ? (context.readConfiguration?.().catalog ?? loadCatalog()).find(provider => provider.id === chosen.slice(0, separator)) : undefined;
      const target = entry && entry.id !== entry.runtime ? chosen.slice(separator + 1) : chosen;
      const result = await runModelCommand(["use", target], context);
      return result.kind === "local" ? { note: result.output } : undefined;
    },
  };
}

function modelDetails(
  label: string,
  runtime: string,
  entry: { readonly endpoint?: string; readonly credential?: string; readonly connections?: readonly { readonly label?: string; readonly reason: string; readonly state: string }[] } | undefined,
  state: string,
  contextWindow: number | undefined,
  selectable: boolean,
): readonly string[] {
  const lines = [`Provider: ${label} (${runtime})`];
  if (entry?.endpoint) lines.push(`Endpoint: ${entry.endpoint}`);
  if (contextWindow) lines.push(`Context: ${Math.round(contextWindow / 1000)}k tokens`);
  lines.push(`Availability: ${availabilityLabel(state as never)}`);
  if (entry?.credential) lines.push(`Credential: ${entry.credential}`);
  const blocked = entry?.connections?.find(connection => connection.state !== 'ready');
  if (blocked) lines.push(`${blocked.label ?? blocked.state}: ${blocked.reason}`);
  if (!selectable) lines.push('Switch the active connection to select this model.');
  return lines;
}

/** Providers whose credential resolves first; the rest keep the catalogue's own order. */
function ordered<T extends { readonly runtime: string }>(
  providers: readonly T[],
  availability: ReadonlyMap<string, { readonly state: string }>,
): T[] {
  return [
    ...providers.filter((provider) => availability.get(provider.runtime)?.state === 'ready'),
    ...providers.filter((provider) => availability.get(provider.runtime)?.state !== 'ready'),
  ];
}
