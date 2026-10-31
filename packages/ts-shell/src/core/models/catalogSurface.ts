import type { CatalogProvider } from "./catalog.js";
import { availabilityLabel, endpointLabel, type CatalogAvailability } from "./availability.js";

/**
 * Rendering the catalogue.
 *
 * Grouped by provider, because a model name on its own does not identify
 * anything: the same name is served by several providers at different endpoints,
 * and a flat list makes the two indistinguishable. Each group says how it
 * authenticates, so "why can I not use this one" is answerable from the list.
 */

export interface CatalogView {
  readonly providers: readonly CatalogProvider[];
  /** Local configuration facts; nothing here implies a live request was made. */
  readonly availability: readonly CatalogAvailability[];
  /** Where a user adds their own providers. */
  readonly configPath: string;
  readonly diagnostics?: readonly string[];
}

const AUTH_NOTE: Record<CatalogProvider["auth"], string> = {
  "api-key": "needs a key",
  oauth: "sign-in",
  none: "no key",
};

export function renderCatalog(view: CatalogView): string {
  const lines = ["### Providers and models", ...(view.diagnostics ?? []), ""];
  for (const provider of view.providers) {
    lines.push(...renderProvider(provider, view));
  }
  lines.push(
    "",
    "- `/model use <provider>/<model>` picks one; `/model use <model>` keeps the current provider.",
    "- `/connect` sets a provider up.",
    `- \`/model config\` opens \`${view.configPath}\`, where your own providers go.`,
    '- models.json is a user-profile catalogue; config.json stores settings and global model defaults; auth.json stores connections and credentials.',
    "- `/model refresh` replaces the shipped catalogue with a current one.",
  );
  return lines.join("\n");
}

function renderProvider(provider: CatalogProvider, view: CatalogView): string[] {
  const entry = view.availability.find(candidate => candidate.id === provider.id);
  const state = entry ? availabilityLabel(entry.state) : AUTH_NOTE[provider.auth];
  const marks = [
    provider.custom ? "yours" : undefined,
    entry?.active ? "active" : undefined,
    state,
  ].filter(Boolean);
  const head = `**${provider.label}** \`${provider.id}\` — ${marks.join(" · ")}`;
  if (provider.models.length === 0) {
    return [head, "", "- no models listed; name one yourself with `/model use`", ""];
  }
  const lines = [head, ""];
  for (const model of provider.models) {
    const active = entry?.active && model.id === entry.activeModel;
    const window = model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : "";
    lines.push(`- \`${model.id}\`${window}${active ? " ← active" : ""}`);
  }
  lines.push("");
  return lines;
}

/** One line per provider, for a chooser that shows models on the next level. */
export function summariseProvider(provider: CatalogProvider, connected: boolean): string {
  const parts = [connected ? "connected" : AUTH_NOTE[provider.auth]];
  const endpoint = endpointLabel(provider.baseUrl);
  if (endpoint) parts.push(endpoint);
  if (provider.models.length > 0) parts.push(`${provider.models.length} models`);
  return parts.join(" · ");
}
