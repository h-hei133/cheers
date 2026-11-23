import { loadCatalog } from "../core/models/catalogStore.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { availabilitySnapshot, matchesCatalog } from "../core/models/availability.js";
import { isUserConfiguredModel } from "../core/models/catalog.js";
import { modelSupportsVision } from "../core/models/modalities.js";
import { fuzzyFilter } from "../presentation/tui/text/search.js";

/**
 * Formats available models for `--list-models [pattern]`.
 */
function formatTokenCount(count: number | undefined): string {
  if (!count || count <= 0) return "-";
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`;
  }
  if (count >= 1_000) {
    const k = count / 1_000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return `${count}`;
}

export function formatCliModelList(pattern?: string, workspaceRoot = process.cwd()): string {
  const catalog = loadCatalog();
  const config = getRuntimeConfig(workspaceRoot);
  const availability = availabilitySnapshot({ config, catalog });
  const all = catalog.flatMap((provider) => {
    const entry = availability.providers.find(candidate => candidate.provider === provider.runtime);
    const ready = Boolean(entry?.connections.some(connection => connection.state === 'ready'
      && matchesCatalog(provider, connection, config.providerConnections, catalog)));
    return provider.models.filter(model => ready || isUserConfiguredModel(provider, model.id)).map((model) => ({
      provider: provider.id,
      id: model.id,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      reasoning: model.reasoning === false ? "no" : "yes",
      images: modelSupportsVision(model) ? "yes" : "no",
    }));
  });

  const filtered = pattern?.trim()
    ? fuzzyFilter(all, pattern.trim(), (m) => `${m.provider} ${m.id}`)
    : all;

  if (filtered.length === 0) {
    return pattern?.trim()
      ? `No models found matching "${pattern.trim()}".`
      : "No models available.";
  }

  filtered.sort((a, b) => {
    const cmp = a.provider.localeCompare(b.provider);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  const rows = filtered.map((m) => [
    m.provider,
    m.id,
    formatTokenCount(m.contextWindow),
    formatTokenCount(m.maxTokens),
    m.reasoning,
    m.images,
  ]);

  const headers = ["provider", "model", "context", "max-out", "thinking", "images"];
  const widths = headers.map((h, col) =>
    Math.max(h.length, ...rows.map((r) => r[col]!.length)),
  );

  const formatRow = (cols: readonly string[]): string =>
    cols.map((col, idx) => col.padEnd(widths[idx]!)).join("  ").trimEnd();

  return [formatRow(headers), ...rows.map(formatRow)].join("\n");
}
