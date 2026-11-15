import type { CatalogProvider } from "../../../core/models/catalog.js";
import { loadCatalog } from "../../../core/models/catalogStore.js";
import { modelSyntax, parseModelArgs } from "../../../core/commands/model/syntax.js";
import { firstParameter } from "./position.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import type { VirtualModelMetadata } from '../../../core/models/virtual/contract.js';

export function modelKind(before: readonly string[], current: string, after: readonly string[]): "model" | "provider" | undefined {
  if (!before.length && modelSyntax.actions.some(action => action.name && (action.name === current.toLowerCase() || action.aliases?.includes(current.toLowerCase())))) return undefined;
  const parsed = firstParameter(parseModelArgs, before, after);
  if (!parsed) return undefined;
  return parsed.action.name === "use" ? "model" : parsed.action.name === "list" ? "provider" : undefined;
}

export function modelCatalog(kind: "model" | "provider", catalog: readonly CatalogProvider[] = loadCatalog(), virtual: readonly VirtualModelMetadata[] = []): readonly Suggestion[] {
  if (kind === "provider") return [...new Set([...catalog.map(provider => provider.id), ...virtual.map(model => model.provider)])]
    .map(value => ({ value, label: value }));
  return [...catalog.flatMap(provider => provider.models.map(model => ({
    value: `${provider.id}/${model.id}`, label: `${provider.id}/${model.id}`,
  }))), ...virtual.map(model => ({ value: `${model.provider}/${model.id}`, label: `${model.provider}/${model.id}` }))];
}
