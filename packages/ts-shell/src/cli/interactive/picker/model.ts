import { projectSessionModel } from "../../../session/model/projection.js";
import { runModelCommand } from "../../../core/commands/modelCommandRuntime.js";
import { getRuntimeConfig } from "../../../config/runtimeConfig.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { availabilityLabel, availabilitySnapshot } from "../../../core/models/availability.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

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
  return {
    title: "Model",
    form: "panel",
    empty: "No providers in the catalogue.",
    async load(): Promise<readonly Option[]> {
      const publication = context.readConfiguration?.();
      const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(getRuntimeConfig(context.projectRoot ?? context.cwd), context.sessionId);
      const catalog = publication?.catalog ?? loadCatalog();
      const availability = availabilitySnapshot({ config, catalog });
      const activeProvider = availability.activeProvider;
      const activeModel = availability.activeModel;
      const providers = new Map(availability.providers.map(provider => [provider.provider, provider]));

      const rows: Option[] = [];
      for (const provider of ordered(catalog, providers)) {
        const entry = providers.get(provider.runtime);
        const state = entry?.state ?? 'unknown';
        const selectable = provider.runtime === activeProvider;
        const endpoint = entry?.endpoint ? ` · ${entry.endpoint}` : '';
        if (provider.models.length === 0) {
          rows.push({
            id: `${provider.id}/`,
            label: provider.label,
            detail: `${availabilityLabel(state)}${endpoint}`,
            note: selectable ? "no models listed" : "switch connection first",
            disabled: true,
          });
          continue;
        }
        for (const model of provider.models) {
          const active = provider.runtime === activeProvider && model.id === activeModel;
          rows.push({
            id: `${provider.id}/${model.id}`,
            label: model.id,
            detail: `${provider.label}${model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : ""}${selectable ? endpoint : ""}`,
            note: active ? "active" : selectable ? availabilityLabel(state) : "switch connection first",
            ...(selectable ? {} : { disabled: true }),
          });
        }
      }
      return rows;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (!chosen) return undefined;
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
