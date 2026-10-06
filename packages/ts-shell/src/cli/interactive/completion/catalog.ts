import { navigationCatalog, type SessionCatalog } from "./navigation.js";
import { serverCatalog } from "./servers.js";
import { grantCatalog, type GrantCatalog } from "./grants.js";
import { connectionCatalog } from "./connections.js";
import { memoryCatalog } from "./memory.js";
import { pathCatalog } from "./paths.js";
import { observeDirectory } from "./watch.js";
import { catalogSources } from "./sources.js";
import { modelCatalog } from "./models.js";
import { workflowCatalog } from "./workflows.js";
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
  themePaths: readonly string[], manager?: SessionCatalog, policy?: GrantCatalog): Promise<readonly Suggestion[]> {
  if (kind === "mcp") return serverCatalog(context.cwd);
  if (kind === "connection") return connectionCatalog();
  if (kind === "model" || kind === "provider") return modelCatalog(kind);
  if (kind === "workflow") return workflowCatalog(context.cwd);
  if (kind === "record" || kind === "invalidatable" || kind === "candidate" || kind === "approvable" || kind === "approved") return memoryCatalog(kind, context);
  if (kind === "grant") {
    if (!policy) throw new Error("Grant catalog unavailable");
    return grantCatalog(context.projectRoot, policy);
  }
  if (kind === "session" || kind === "entry" || kind === "tree" || kind === "thread") {
    if (!manager) throw new Error("Session catalog unavailable");
    return navigationCatalog(kind, context, manager);
  }
  if (kind === "theme") return [...new Set(["auto", ...listThemes(context.cwd, themePaths)])].map(value => ({ value, label: value, detail: "Select theme" }));
  if (kind === "skill") {
    const skills = resolveSkillCatalog({ workspaceRoot: context.cwd, ...context.skillOptions }).skills;
    return [...skills.values()].map(skill => ({ value: skill.name, label: skill.name, detail: skill.description }));
  }
  const snapshot = context.runtimeConfig.enableMcpTools ? gateway.peekSnapshot?.() : undefined;
  if (context.runtimeConfig.enableMcpTools && !snapshot) throw new Error("Tool catalog unavailable");
  if (snapshot?.clients.some(client => client.type !== "connected")) throw new Error("Tool catalog unavailable");
  const tools = await toolPoolFor(context, snapshot ? { snapshot: async () => snapshot } : gateway)();
  return [...tools.values()].map(tool => ({ value: tool.name, label: tool.name, detail: tool.description.split("\n")[0]?.slice(0, 160) }));
}

/** Reuse a pending catalog read across changing prefixes; cancellation only detaches the waiter. */
export function createCatalogLoader(context: () => ShellRuntimeContext, gateway: CliMcpGateway, themePaths: readonly string[], manager?: SessionCatalog, policy?: GrantCatalog) {
  let pending: { key: string; task: Promise<readonly Suggestion[]> } | undefined;
  const load = async (kind: CatalogKind, signal: AbortSignal, query?: string): Promise<readonly Suggestion[]> => {
    signal.throwIfAborted();
    const current = context();
    if (kind === "file" || kind === "directory") return pathCatalog(current.cwd, query ?? "", kind === "directory", signal);
    const key = catalogIdentity(current, themePaths) + kind;
    if (!pending || pending.key !== key) {
      const task = readCatalog(kind, current, gateway, themePaths, manager, policy);
      pending = { key, task };
      void task.finally(() => { if (pending?.task === task) pending = undefined; }).catch(() => {});
    }
    const items = await pending.task;
    signal.throwIfAborted();
    return items;
  };
  return Object.assign(load, {
    invalidate: () => { pending = undefined; },
    observe: (kind: CatalogKind, query: string | undefined, changed: () => void) => {
      const targets = catalogSources(kind, context().cwd, query);
      if (!targets.length) return undefined;
      const close = targets.map(target => observeDirectory(target, changed));
      return () => close.forEach(stop => stop());
    },
  });
}
