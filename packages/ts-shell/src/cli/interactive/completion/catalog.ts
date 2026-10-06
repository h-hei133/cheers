import { navigationCatalog, type SessionCatalog } from "./navigation.js";
import { serverCatalog } from "./servers.js";
import { grantCatalog, type GrantCatalog } from "./grants.js";
import { connectionCatalog } from "./connections.js";
import { memoryCatalog, observeMemoryCatalog } from "./memory.js";
import { pathCatalog } from "./paths.js";
import { observeDirectory } from "./watch.js";
import { catalogSources } from "./sources.js";
import { modelCatalog } from "./models.js";
import { workflowCatalog } from "./workflows.js";
import { listThemes } from "../../../presentation/themes/index.js";
import { createSkillCatalog } from "./skills.js";
import { createCatalogObservation } from "./observation.js";
import { toolPoolFor } from "../../runtime/tools.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";
import type { CatalogKind } from "./request.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import { listWorkspaceFiles } from "../../../runtime/execution/fileWalk.js";

export function catalogIdentity(context: ShellRuntimeContext, themePaths: readonly string[] = []): string {
  return JSON.stringify([context.cwd, context.projectRoot, context.session.id, context.skillOptions,
    themePaths, context.configuration.current.revision, context.runtimeConfig.enableMcpTools, context.runtimeConfig.allowedTools, context.runtimeConfig.disabledTools, context.runtimeConfig.hiddenToolPrefixes]);
}

/** Trust and directory-link changes can change which automatic roots are eligible. */
function observeThemes(context: ShellRuntimeContext, themePaths: readonly string[], changed: () => void): () => void {
  let stopped = false;
  let close: Array<() => void> = [];
  const attach = () => {
    close.forEach(stop => stop());
    close = catalogSources('theme', { cwd: context.cwd, projectRoot: context.projectRoot, themePaths })
      .map(target => observeDirectory(target, () => {
        if (stopped) return;
        attach(); changed();
      }));
  };
  attach();
  return () => { stopped = true; close.forEach(stop => stop()); close = []; };
}

async function readCatalog(kind: CatalogKind, context: ShellRuntimeContext, gateway: CliMcpGateway,
  themePaths: readonly string[], manager?: SessionCatalog, policy?: GrantCatalog, onSource?: (target: string) => void): Promise<readonly Suggestion[]> {
  if (kind === "mcp") return serverCatalog(context.cwd);
  if (kind === "connection") return connectionCatalog();
  if (kind === "model" || kind === "provider") return modelCatalog(kind, context.configuration.current.catalog);
  if (kind === "workflow") return workflowCatalog(context.cwd);
  if (kind === "record" || kind === "invalidatable" || kind === "candidate" || kind === "approvable" || kind === "approved") return memoryCatalog(kind, context);
  if (kind === "grant") {
    if (!policy) throw new Error("Grant catalog unavailable");
    return grantCatalog(context.projectRoot, policy);
  }
  if (kind === "session" || kind === "entry" || kind === "tree" || kind === "thread") {
    if (!manager) throw new Error("Session catalog unavailable");
    return navigationCatalog(kind, context, manager, onSource);
  }
  if (kind === "theme") return [...new Set(["auto", ...listThemes(context.cwd, themePaths)])].map(value => ({ value, label: value, detail: "Select theme" }));
  const snapshot = context.runtimeConfig.enableMcpTools ? gateway.peekSnapshot?.() : undefined;
  if (context.runtimeConfig.enableMcpTools && !snapshot) throw new Error("Tool catalog unavailable");
  if (snapshot?.clients.some(client => client.type !== "connected")) throw new Error("Tool catalog unavailable");
  const tools = await toolPoolFor(context, snapshot ? { snapshot: async () => snapshot } : gateway)();
  return [...tools.values()].map(tool => ({ value: tool.name, label: tool.name, detail: tool.description.split("\n")[0]?.slice(0, 160) }));
}

/** Generic reads share pending work; file/path requests propagate cancellation to their owners. */
export function createCatalogLoader(context: () => ShellRuntimeContext, gateway: CliMcpGateway, themePaths: readonly string[], manager?: SessionCatalog, policy?: GrantCatalog) {
  let pending: { key: string; task: Promise<readonly Suggestion[]> } | undefined;
  const skills = createSkillCatalog();
  const navigation = new Map<CatalogKind, ReturnType<typeof createCatalogObservation>>(
    (["session", "entry", "tree", "thread"] as const).map(kind => [kind, createCatalogObservation()]));
  const load = async (kind: CatalogKind, signal: AbortSignal, query?: string): Promise<readonly Suggestion[]> => {
    signal.throwIfAborted();
    const current = context();
    if (kind === "reference") {
      const files = await listWorkspaceFiles(current.projectRoot, { abortSignal: signal });
      signal.throwIfAborted();
      return files.slice(0, 5000).map(value => ({ value, label: value }));
    }
    if (kind === "file" || kind === "directory") return pathCatalog(current.cwd, query ?? "", kind === "directory", signal);
    const key = catalogIdentity(current, themePaths) + kind;
    if (!pending || pending.key !== key) {
      const observer = navigation.get(kind);
      const task = kind === "skill" ? Promise.resolve(skills.read(current))
        : observer ? observer.read(track => readCatalog(kind, current, gateway, themePaths, manager, policy, track))
        : readCatalog(kind, current, gateway, themePaths, manager, policy);
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
      if (kind === "skill") return skills.observe(changed);
      const observer = navigation.get(kind);
      if (observer) return observer.observe(changed);
      const current = context();
      if (kind === "theme") return observeThemes(current, themePaths, changed);
      if (kind === "candidate" || kind === "approvable" || kind === "approved") return observeMemoryCatalog(current.session.id, changed);
      const targets = catalogSources(kind, { cwd: current.cwd, projectRoot: current.projectRoot, themePaths, grantPath: policy?.sourcePath }, query);
      const close = targets.map(target => observeDirectory(target, changed));
      if (kind === "tools") {
        const unsubscribe = gateway.subscribe?.(changed);
        if (unsubscribe) close.push(unsubscribe);
      }
      if (!close.length) return undefined;
      return () => close.forEach(stop => stop());
    },
  });
}
