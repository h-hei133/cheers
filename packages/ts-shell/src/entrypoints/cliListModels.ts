import { loadCatalog } from "../core/models/catalogStore.js";
import { fuzzyFilter } from "../presentation/tui/text/search.js";

/**
 * Formats available models for `--list-models [pattern]` (adopted from Pi `list-models.ts`).
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

export function formatCliModelList(pattern?: string): string {
  const all = loadCatalog().flatMap((provider) =>
    provider.models.map((model) => ({
      provider: provider.id,
      id: model.id,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      reasoning: model.reasoning === false ? "no" : "yes",
      images: model.vision === true ? "yes" : "no",
    })),
  );

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
