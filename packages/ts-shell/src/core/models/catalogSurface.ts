import type { CatalogProvider } from "./catalog.js";

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
  /** Provider ids with a stored connection. */
  readonly connected: ReadonlySet<string>;
  /** The provider and model this session is using, if any. */
  readonly activeProvider?: string;
  readonly activeModel?: string;
  /** Where a user adds their own providers. */
  readonly configPath: string;
}

const AUTH_NOTE: Record<CatalogProvider["auth"], string> = {
  "api-key": "needs a key",
  oauth: "sign-in",
  none: "no key",
};

export function renderCatalog(view: CatalogView): string {
  const lines = ["### Providers and models", ""];
  for (const provider of view.providers) {
    lines.push(...renderProvider(provider, view));
  }
  lines.push(
    "",
    "- `/model use <provider>/<model>` picks one; `/model use <model>` keeps the current provider.",
    "- `/connect` sets a provider up.",
    `- \`/model config\` opens \`${view.configPath}\`, where your own providers go.`,
    "- `/model refresh` replaces the shipped catalogue with a current one.",
  );
  return lines.join("\n");
}

function renderProvider(provider: CatalogProvider, view: CatalogView): string[] {
  const state = view.connected.has(provider.id) ? "connected" : AUTH_NOTE[provider.auth];
  const marks = [
    provider.custom ? "yours" : undefined,
    provider.id === view.activeProvider ? "active" : undefined,
    state,
  ].filter(Boolean);
  const head = `**${provider.label}** \`${provider.id}\` — ${marks.join(" · ")}`;
  if (provider.models.length === 0) {
    return [head, "", "- no models listed; name one yourself with `/model use`", ""];
  }
  const lines = [head, ""];
  for (const model of provider.models) {
    const active = provider.id === view.activeProvider && model.id === view.activeModel;
    const window = model.contextWindow ? ` · ${Math.round(model.contextWindow / 1000)}k` : "";
    lines.push(`- \`${model.id}\`${window}${active ? " ← active" : ""}`);
  }
  lines.push("");
  return lines;
}

/** One line per provider, for a chooser that shows models on the next level. */
export function summariseProvider(provider: CatalogProvider, connected: boolean): string {
  const parts = [connected ? "connected" : AUTH_NOTE[provider.auth]];
  if (provider.baseUrl) parts.push(provider.baseUrl);
  if (provider.models.length > 0) parts.push(`${provider.models.length} models`);
  return parts.join(" · ");
}
