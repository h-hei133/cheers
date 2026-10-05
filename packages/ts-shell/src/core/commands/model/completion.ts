import { RUNTIME_PROVIDERS } from "../../../config/runtimeConfig.js";
import { loadCatalog } from "../../models/catalogStore.js";
import { scanCommandArgs } from "../arguments.js";
import { syntaxCompletions } from "../syntax/projection.js";
import { parseFlags } from "../syntax/flags.js";
import type { CommandArgumentCompletion } from "../types.js";
import { modelSyntax } from "./syntax.js";

/** Model identifiers are offered only in the single target position. */
export function modelArgumentCompletions(prefix: string): readonly CommandArgumentCompletion[] | null {
  const tokens = scanCommandArgs(prefix, true);
  const current = /\s$/.test(prefix) ? undefined : tokens.at(-1);
  const before = current ? tokens.slice(0, -1) : tokens;
  const query = (current?.value ?? "").toLowerCase();
  const first = before[0]?.value.toLowerCase();
  const action = modelSyntax.actions.find(item => item.name === first || item.aliases?.includes(first ?? ""));
  const fixed = syntaxCompletions(modelSyntax, !action && before.length ? `use ${prefix}` : prefix);
  if (action && action.name !== "use" && action.name !== "list") return fixed;
  const args = action ? before.slice(1).map(token => token.value) : before.map(token => token.value);
  const flags = modelSyntax.actions.find(item => item.name === (action?.name ?? "use"))!.flags!;
  const parsed = parseFlags(flags, args);
  if (!parsed.ok || parsed.args.length > 0 || query.startsWith("-")) return fixed;
  const catalog = loadCatalog();
  const values = action?.name === "list" ? catalog.map(provider => provider.id).filter(id => RUNTIME_PROVIDERS.some(provider => provider === id))
    : catalog.flatMap(provider => provider.models.map(model => `${provider.id}/${model.id}`));
  const entities = values.filter(value => value.toLowerCase().startsWith(query)).slice(0, 50)
    .map(value => ({ value, label: value }));
  const result = [...(fixed ?? []), ...entities];
  return result.length ? result : null;
}
