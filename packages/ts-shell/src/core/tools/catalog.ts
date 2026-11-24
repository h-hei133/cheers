import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { TaskWorktreeFactory } from "../../tools/worktree.js";
import type { McpToolDescriptor } from "../mcp/types.js";
import { MCP_TOOL_PREFIX } from '../mcp/projection.js';
import type { Skill } from "../skills/skillLoader.js";
import { resolveSkillCatalog } from "../skills/skillCatalog.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import { createCoreToolRegistry } from "./registry.js";
import { filterVisibleToolNames } from "./prefilter.js";
import { assertAdmission, type Admission } from '../network/admission.js';
import { catalogContributions } from '../catalog/contributions.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { createToolDiscovery, DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL, type ToolDiscovery } from './discovery/state.js';
import { discoveryTools } from './discovery/tools.js';
import { deferredMcpTools, mcpCatalogFilter, mcpToolsForRun, type ToolMcpGateway } from './mcp.js';

const DISCOVERY_NAMES = [DISCOVERY_SEARCH_TOOL, DISCOVERY_LOAD_TOOL] as const;

export interface ToolCatalogInput {
  readonly worktrees?: TaskWorktreeFactory;
  readonly builtinTools?: readonly ToolDefinition[];
  /** Fixed content for an independently approved run; executable contributions remain owner-bound. */
  readonly catalogContent?: CatalogContent;
  readonly onCommandSettled?: Parameters<typeof createDefaultExecutionService>[0];
  /** Native feature composition; visibility restrictions apply after merging. */
  readonly featureTools?: readonly ToolDefinition[];
  readonly admission?: Admission;
  readonly signal?: AbortSignal;
  readonly workspaceRoot: string;
  readonly sessionId?: string;
  readonly skillOptions?: { readonly skillPaths?: readonly string[]; readonly noSkills?: boolean };
  readonly sdkSkills?: ReadonlyMap<string, Skill>;
  readonly runtimeConfig?: RuntimeConfig;
  /** Model runs start small; command inspection keeps the full pool. */
  readonly discover?: boolean;
  readonly initialTools?: readonly string[];
  readonly retainedTools?: readonly string[];
  readonly forcedTool?: string;
  readonly mcpGateway?: ToolMcpGateway;
}

export interface CatalogContent {
  readonly skills: ReadonlyMap<string, Skill>;
  readonly tools: readonly ToolDefinition[];
  /** Child runs inherit only previously discovered descriptors, including their permission hints. */
  readonly mcpTools?: readonly McpToolDescriptor[];
}

export async function captureCatalogContent(input: ToolCatalogInput): Promise<CatalogContent> {
  assertAdmission(input.admission);
  input.signal?.throwIfAborted();
  const skills = await discoverSkills(input);
  input.signal?.throwIfAborted();
  assertAdmission(input.admission);
  return { skills, tools: catalogContributions(input.workspaceRoot, input.sessionId).flatMap(entry => entry.tools) };
}

export function defersMcpDiscovery(input: Pick<ToolCatalogInput, 'discover' | 'runtimeConfig' | 'forcedTool' | 'initialTools' | 'catalogContent'>): boolean {
  const config = input.runtimeConfig;
  return input.discover === true && config?.enableMcpTools === true && config.allowedTools === undefined
    && !input.forcedTool && !input.catalogContent
    && !input.initialTools?.some(name => name === 'codemode' || name.startsWith(MCP_TOOL_PREFIX))
    && filterVisibleToolNames(DISCOVERY_NAMES, config).length === DISCOVERY_NAMES.length
    && mcpCatalogFilter(config) !== false;
}

/** Build the same current tool pool for a model run and for command inspection. */
export async function loadToolCatalog(input: ToolCatalogInput, override?: () => ReadonlyMap<string, ToolDefinition>): Promise<{
  readonly skills: ReadonlyMap<string, Skill>;
  readonly tools: ReadonlyMap<string, ToolDefinition>;
  readonly discovery?: ToolDiscovery;
}> {
  assertAdmission(input.admission);
  const { skills, tools: contributed } = input.catalogContent ?? await captureCatalogContent(input);
  const deferred = !override && input.mcpGateway !== undefined && defersMcpDiscovery(input);
  const mcp = deferred ? undefined : await mcpToolsForRun(input);
  input.signal?.throwIfAborted();
  assertAdmission(input.admission);
  const registry = override?.() ?? createCoreToolRegistry({ skills, worktrees: input.worktrees, builtinTools: input.builtinTools,
    ...(input.onCommandSettled ? { executionService: createDefaultExecutionService(input.onCommandSettled) } : {}),
    ...(mcp ? { mcpTools: mcp.tools, mcpGateway: mcp.gateway } : {}),
  });
  const combined = new Map(registry);
  for (const tool of [...input.featureTools ?? [], ...contributed]) {
    if (combined.has(tool.name)) throw new Error('Feature tool registration collides with an existing tool.');
    combined.set(tool.name, tool);
  }
  const discoveryNames = input.discover ? DISCOVERY_NAMES : [];
  const restricted = input.runtimeConfig ? restrictToolPool(combined, input.runtimeConfig, discoveryNames, input.forcedTool) : combined;
  // Generated entry points obey the same visibility contract as ordinary tools.
  // Without the complete discovery pair, offer admitted tools directly so an
  // explicitly allowed deferred tool remains callable without a forbidden load.
  const discover = input.discover && restricted.size > 0 && (!input.runtimeConfig
    || filterVisibleToolNames(discoveryNames, input.runtimeConfig).length === discoveryNames.length);
  if (!discover) {
    const tools: ReadonlyMap<string, ToolDefinition> = bindNestedCatalog(restricted, () => tools);
    return { skills, tools };
  }
  // Feature tools are the run's explicit capability, not general catalogue
  // entries: a director's worker controls or a research probe must be present
  // in the first request, so they join the initial set alongside pinned tools.
  const initial = [...(input.initialTools ?? []), ...(input.featureTools ?? []).map(tool => tool.name)];
  const nested = new Map(bindNestedCatalog(restricted, () => discovery.snapshot(true)));
  const discovery: ToolDiscovery = createToolDiscovery({ catalog: nested, initial, retained: input.retainedTools });
  discovery.attachMeta(discoveryTools(discovery, deferred ? deferredMcpTools(input, nested) : undefined));
  return { skills, tools: discovery.snapshot(), discovery };
}

/** Rebind a run-owned script definition without modifying retained caller definitions. */
function bindNestedCatalog(pool: ReadonlyMap<string, ToolDefinition>, capture: () => ReadonlyMap<string, ToolDefinition>): ReadonlyMap<string, ToolDefinition> {
  const script = pool.get('codemode');
  if (!script) return pool;
  const bound = new Map(pool);
  bound.set(script.name, { ...script, nestedToolCatalog: capture });
  return bound;
}

/**
 * The skills this run may offer the model.
 *
 * Discovered once per run rather than per turn: discovery reads the filesystem,
 * and the system prompt is built once, so a per-turn scan would repeat work whose
 * result is not consulted again. The trust gate and the CLI flags are applied by
 * the catalog, which is the same rule `/skill` and `/skill:` resolve through —
 * see `resolveSkillCatalog`.
 */
async function discoverSkills(request: ToolCatalogInput): Promise<ReadonlyMap<string, Skill>> {
  if (request.sdkSkills) return request.sdkSkills;
  const { skills, collisions, diagnostics, failures } = await resolveSkillCatalog({
    workspaceRoot: request.workspaceRoot,
    sessionId: request.sessionId,
    abortSignal: request.signal,
    ...(request.skillOptions?.skillPaths ? { skillPaths: request.skillOptions.skillPaths } : {}),
    ...(request.skillOptions?.noSkills ? { noSkills: true } : {}),
  });

  // Reported because a malformed skill is otherwise invisible: a missing
  // description keeps it out of the model's list entirely, and a bad name is
  // something the author can only discover by noticing it never appears.
  for (const diagnostic of diagnostics) {
    createComponentLogger("skills").warn(`${diagnostic.filePath} ${diagnostic.message}.`);
  }

  // A `--skill` path that loaded nothing is named for the same reason. The user
  // asked for that file by name, and silence would leave a typo looking exactly
  // like a skill the model chose not to use.
  for (const failure of failures) {
    createComponentLogger("skills").warn(`${failure.filePath} ${failure.message}.`);
  }

  if (collisions.length > 0) {
    // Surfaced because the losing file is otherwise invisible: the winner
    // appears and the other never does, so nobody learns editing it has no effect.
    for (const collision of collisions) {
      createComponentLogger("skills").warn(
        `Skill name '${collision.name}' is claimed by ${collision.winnerPath} and ${collision.loserPath}; using ${collision.winnerPath}.`,
      );
    }
  }

  return skills;
}

function restrictToolPool(
  registry: ReadonlyMap<string, ToolDefinition>,
  runtimeConfig: RuntimeConfig,
  generatedNames: readonly string[],
  forcedTool?: string,
): ReadonlyMap<string, ToolDefinition> {
  // A name in the allowlist that matches no tool is a typo, and a typo here is
  // invisible: the run simply offers fewer tools than intended and the model
  // works around it. Reported rather than rejected, because a shared config may
  // legitimately name a tool this build does not have.
  const expected = filterVisibleToolNames(runtimeConfig.allowedTools ?? [], runtimeConfig);
  const unknown = expected.filter(name => !registry.has(name) && !generatedNames.includes(name) &&
    (!forcedTool || forcedTool === 'codemode' || name === forcedTool || !name.startsWith(MCP_TOOL_PREFIX)));
  if (unknown.length > 0) {
    createComponentLogger("tools").warn(
      `Ignoring ${unknown.length} name(s) in allowedTools that match no tool: ${unknown.join(", ")}.`,
    );
  }

  const visible = new Set(
    filterVisibleToolNames([...registry.keys()], runtimeConfig),
  );
  if (visible.size === registry.size) return registry;
  return new Map([...registry].filter(([name]) => visible.has(name)));
}
