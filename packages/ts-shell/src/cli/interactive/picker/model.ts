import { projectSessionModel } from "../../../session/model/projection.js";
import { runModelCommand } from "../../../core/commands/modelCommandRuntime.js";
import { readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { normalizeConnections } from "../../../core/commands/connect/preset.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { summariseProvider } from "../../../core/models/catalogSurface.js";
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
 * Connected providers come first: those are the ones a choice can take effect on
 * right away.
 */
export function modelPicker(context: CommandContext): Picker {
  return {
    title: "Model",
    form: "panel",
    empty: "No providers in the catalogue.",
    async load(): Promise<readonly Option[]> {
      const config = projectSessionModel(readUserRuntimeConfigFile(), context.sessionId);
      const connections = normalizeConnections(config);
      const connected = new Set<string>(connections.map((connection) => connection.provider));
      const activeId = config.activeProviderConnectionId?.trim();
      const active = connections.find((connection) => connection.id === activeId);
      const activeModel = active?.model?.trim();

      const rows: Option[] = [];
      for (const provider of ordered(loadCatalog(), connected)) {
        const ready = connected.has(provider.id);
        if (provider.models.length === 0) {
          rows.push({
            id: `${provider.id}/`,
            label: provider.label,
            detail: summariseProvider(provider, ready),
            note: ready ? "connected" : "not connected",
            disabled: !ready,
          });
          continue;
        }
        for (const model of provider.models) {
          rows.push({
            id: `${provider.id}/${model.id}`,
            label: model.id,
            detail: `${provider.label}${model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : ""}`,
            note:
              provider.id === active?.provider && model.id === activeModel
                ? "active"
                : ready
                  ? "connected"
                  : "not connected",
          });
        }
      }
      return rows;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const chosen = ids[0];
      if (!chosen) return undefined;
      const result = await runModelCommand(["use", chosen], context);
      return result.kind === "local" ? { note: result.output } : undefined;
    },
  };
}

/** Connected providers first; the rest keep the catalogue's own order. */
function ordered<T extends { readonly id: string }>(
  providers: readonly T[],
  connected: ReadonlySet<string>,
): T[] {
  return [
    ...providers.filter((provider) => connected.has(provider.id)),
    ...providers.filter((provider) => !connected.has(provider.id)),
  ];
}
