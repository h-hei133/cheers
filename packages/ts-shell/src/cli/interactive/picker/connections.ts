import { readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { runConnectCommand } from "../../../core/commands/connectCommandRuntime.js";
import { CONNECT_PRESETS, normalizeConnections } from "../../../core/commands/connect/preset.js";
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
      const config = readUserRuntimeConfigFile();
      const connections = normalizeConnections(config);
      const activeId = config.activeProviderConnectionId?.trim();
      const known = new Set(connections.map((connection) => connection.provider));

      const rows: Option[] = connections.map<Option>((connection) => ({
        id: `use:${connection.id}`,
        label: connection.label ?? connection.provider,
        detail: `${connection.authType}${connection.model ? ` · ${connection.model}` : ""}`,
        note: connection.id === activeId ? "active" : CONNECTED,
      }));

      for (const preset of CONNECT_PRESETS) {
        if (known.has(preset.provider)) continue;
        rows.push({
          id: `login:${preset.id}`,
          label: preset.label,
          detail: preset.defaultModel ?? "needs an API key",
          note: "not connected",
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
      return { draft: `/connect login ${target} --api-key ` };
    },
  };
}

function splitChoice(choice: string): [string, string] {
  const separator = choice.indexOf(":");
  return [choice.slice(0, separator), choice.slice(separator + 1)];
}
