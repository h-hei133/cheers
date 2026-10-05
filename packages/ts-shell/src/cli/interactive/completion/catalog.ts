import { listThemes } from "../../../presentation/themes/index.js";
import { resolveSkillCatalog } from "../../../core/skills/skillCatalog.js";
import { toolPoolFor } from "../../runtime/tools.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { CatalogKind } from "./request.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export function catalogIdentity(context: ShellRuntimeContext, themePaths: readonly string[] = []): string {
  return JSON.stringify([context.cwd, context.projectRoot, context.session.id, context.skillOptions,
    themePaths, context.runtimeConfig.enableMcpTools, context.runtimeConfig.allowedTools, context.runtimeConfig.disabledTools, context.runtimeConfig.hiddenToolPrefixes]);
}

async function readCatalog(kind: CatalogKind, context: ShellRuntimeContext, gateway: CliMcpGateway,
  themePaths: readonly string[]): Promise<readonly Suggestion[]> {
  if (kind === "theme") return [...new Set(["auto", ...listThemes(context.cwd, themePaths)])].map(value => ({ value, label: value, detail: "Select theme" }));
  if (kind === "skill") {
    const skills = resolveSkillCatalog({ workspaceRoot: context.cwd, ...context.skillOptions }).skills;
    return [...skills.values()].map(skill => ({ value: skill.name, label: skill.name, detail: skill.description }));
  }
  const snapshot = context.runtimeConfig.enableMcpTools ? await gateway.snapshot() : undefined;
  if (snapshot?.clients.some(client => client.type !== "connected")) throw new Error("Tool catalog unavailable");
  const tools = await toolPoolFor(context, snapshot ? { snapshot: async () => snapshot } : gateway)();
  return [...tools.values()].map(tool => ({ value: tool.name, label: tool.name, detail: tool.description.split("\n")[0]?.slice(0, 160) }));
}

/** Reuse a pending catalog read across changing prefixes; cancellation only detaches the waiter. */
export function createCatalogLoader(context: () => ShellRuntimeContext, gateway: CliMcpGateway, themePaths: readonly string[]) {
  let pending: { key: string; task: Promise<readonly Suggestion[]> } | undefined;
  const load = async (kind: CatalogKind, signal: AbortSignal): Promise<readonly Suggestion[]> => {
    signal.throwIfAborted();
    const current = context();
    const key = catalogIdentity(current, themePaths) + kind;
    if (!pending || pending.key !== key) {
      const task = readCatalog(kind, current, gateway, themePaths);
      pending = { key, task };
      void task.finally(() => { if (pending?.task === task) pending = undefined; }).catch(() => {});
    }
    const items = await pending.task;
    signal.throwIfAborted();
    return items;
  };
  return Object.assign(load, { invalidate: () => { pending = undefined; } });
}
