import { readUserRuntimeConfigFile } from "../../../config/runtimeConfig.js";
import { runConnectCommand } from "../../../core/commands/connectCommandRuntime.js";
import { CONNECT_PRESETS, normalizeConnections } from "../../../core/commands/connect/preset.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { summariseProvider } from "../../../core/models/catalogSurface.js";
import { availabilityLabel, availabilitySnapshot } from "../../../core/models/availability.js";
import type { CommandContext } from "../../../core/commands/types.js";
import type { Option } from "../../../presentation/tui/chrome/options.js";
import type { Picker, PickerOutcome } from "../overlay.js";
import { quoteCompletion } from '../completion.js';
import type { CatalogProvider } from '../../../core/models/catalog.js';

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
      const availability = availabilitySnapshot({ config, catalog: publication?.catalog ?? loadCatalog() });
      const projected = new Map(availability.providers.flatMap(provider => provider.connections.map(connection => [connection.connectionId, connection])));

      const rows: Option[] = connections.map<Option>((connection) => {
        const state = projected.get(connection.id.trim());
        return {
          id: `use:${connection.id}`,
          label: connection.label ?? connection.provider,
          detail: [connection.authType, connection.model, state?.endpoint].filter(Boolean).join(" · "),
          note: connection.id === activeId ? state && state.state !== 'ready' ? `active · ${availabilityLabel(state.state)}` : "active"
            : state ? availabilityLabel(state.state) : CONNECTED,
        };
      });

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
      return { draft: connectionDraft(provider, provider.models[0]?.id) };
    },
  };
}

/** Exact catalogue target; preparing a command never authenticates or persists. */
export function connectionDraft(provider: CatalogProvider, model?: string, endpoint = provider.baseUrl, label = provider.id): string {
  const parts = [`/connect login ${provider.runtime}`];
  let safeEndpoint: string | undefined;
  try {
    const url = new URL(endpoint ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') safeEndpoint = `${url.origin}${url.pathname}`;
  } catch { /* A missing or invalid endpoint is supplied explicitly by the user. */ }
  if (safeEndpoint) parts.push(`--base-url ${quoteCompletion(safeEndpoint, '')}`);
  if (model) parts.push(`--model ${quoteCompletion(model, '')}`);
  parts.push(`--label ${quoteCompletion(label, '')}`, '--api-key ');
  return parts.join(' ');
}

function splitChoice(choice: string): [string, string] {
  const separator = choice.indexOf(":");
  return [choice.slice(0, separator), choice.slice(separator + 1)];
}
