import { readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { runConnectCommand } from "../../../core/commands/connectCommandRuntime.js";
import { CONNECT_PRESETS, normalizeConnections } from "../../../core/commands/connect/preset.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { summariseProvider } from "../../../core/models/catalogSurface.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";

/**
 * Provider chooser.
 *
 * One list, three kinds of row: connections that already exist, curated
 * providers with sensible defaults, and whatever else the model registry knows
 * about. Choosing an existing connection activates it. Choosing a provider that
 * is not connected yet cannot be completed here — it needs an API key, and a
 * picker is the wrong place to be handling a secret — so it hands the prompt the
 * exact login line with the caret after it.
 */

const CONNECTED = "connected";

export function connectionPicker(context: CommandContext): Picker {
  return {
    title: "Provider",
    form: "panel",
    empty: "No providers available.",
    async load(): Promise<readonly Option[]> {
      const publication = context.readConfiguration?.();
      const config = publication?.config ?? context.runtimeConfig ?? readUserRuntimeConfigFile();
      const connections = normalizeConnections(config);
      const activeId = config.activeProviderConnectionId?.trim();
      const known = new Set<string>(connections.map((connection) => connection.provider));

      const rows: Option[] = connections.map<Option>((connection) => ({
        id: `use:${connection.id}`,
        label: connection.label ?? connection.provider,
        detail: `${connection.authType}${connection.model ? ` · ${connection.model}` : ""}`,
        note: connection.id === activeId ? "active" : CONNECTED,
      }));

      // Presets first — those have a login path wired end to end — then every
      // other provider in the catalogue, which is reachable the same way once a
      // base URL and a key are given.
      for (const preset of CONNECT_PRESETS) {
        if (known.has(preset.provider)) continue;
        rows.push({
          id: `login:${preset.id}`,
          label: preset.label,
          detail: preset.defaultModel ?? "needs an API key",
          note: "not connected",
        });
      }
      const offered = new Set<string>(CONNECT_PRESETS.map((preset) => preset.id));
      for (const provider of publication?.catalog ?? loadCatalog()) {
        if (offered.has(provider.id)) continue;
        rows.push({
          id: `login:${provider.id}`,
          label: provider.label,
          detail: summariseProvider(provider, false),
          note: provider.auth === "none" ? "no key needed" : "not connected",
        });
      }
      return rows;
    },
    async apply(ids: readonly string[]): Promise<PickerOutcome | undefined> {
      const choice = ids[0];
      if (!choice) return undefined;
      const [action, target] = splitChoice(choice);
      if (action === "use") {
        const result = await runConnectCommand(["use", target], context);
        return result.kind === "local" ? { note: result.output } : undefined;
      }
      const preset = CONNECT_PRESETS.find((candidate) => candidate.id === target);
      if (preset) return { draft: `/connect login ${target} --api-key ` };
      // A catalogue provider has no preset, but everything a login needs is in the
      // catalogue: the request shape, the endpoint, and a model to start on.
      const provider = (context.readConfiguration?.().catalog ?? loadCatalog()).find((candidate) => candidate.id === target);
      if (!provider) return undefined;
      const parts = [`/connect login ${provider.runtime}`];
      if (provider.baseUrl) parts.push(`--base-url ${provider.baseUrl}`);
      if (provider.models[0]) parts.push(`--model ${provider.models[0].id}`);
      parts.push(`--label ${provider.id}`, "--api-key ");
      return { draft: parts.join(" ") };
    },
  };
}

function splitChoice(choice: string): [string, string] {
  const separator = choice.indexOf(":");
  return [choice.slice(0, separator), choice.slice(separator + 1)];
}
