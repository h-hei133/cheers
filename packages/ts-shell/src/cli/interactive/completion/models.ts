import type { CatalogProvider } from "../../../core/models/catalog.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { modelSyntax, parseModelArgs } from "../../../core/commands/model/syntax.js";
import { firstParameter } from "./position.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export function modelKind(before: readonly string[], current: string, after: readonly string[]): "model" | "provider" | undefined {
  if (!before.length && modelSyntax.actions.some(action => action.name && (action.name === current.toLowerCase() || action.aliases?.includes(current.toLowerCase())))) return undefined;
  const parsed = firstParameter(parseModelArgs, before, after);
  if (!parsed) return undefined;
  return parsed.action.name === "use" ? "model" : parsed.action.name === "list" ? "provider" : undefined;
}

export function modelCatalog(kind: "model" | "provider", catalog: readonly CatalogProvider[] = loadCatalog()): readonly Suggestion[] {
  if (kind === "provider") return catalog
    .map(provider => ({ value: provider.id, label: provider.id }));
  return catalog.flatMap(provider => provider.models.map(model => ({
    value: `${provider.id}/${model.id}`, label: `${provider.id}/${model.id}`,
  })));
}
