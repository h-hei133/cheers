import type { RuntimeConfig } from "../../config/runtimeConfig.js";
import type { ToolDefinition } from "../../tools/types.js";
import type { CoreMcpGateway } from "../mcp/gateway.js";
import type { McpToolDescriptor } from "../mcp/types.js";
import type { Skill } from "../skills/skillLoader.js";
import { resolveSkillCatalog } from "../skills/skillCatalog.js";
import { createComponentLogger } from "../../observability/structuredLogger.js";
import { createCoreToolRegistry } from "./registry.js";
import { filterVisibleToolNames } from "./prefilter.js";
import { assertAdmission, type Admission } from '../network/admission.js';
import { catalogContributions } from '../catalog/contributions.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';
import { sameValue } from '../../config/values.js';
import { createToolDiscovery, type ToolDiscovery } from './discovery/state.js';
import { discoveryTools } from './discovery/tools.js';

export interface ToolCatalogInput {
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
  readonly runtimeConfig?: RuntimeConfig;
  /** Model runs start small; command inspection keeps the full pool. */
  readonly discover?: boolean;
  readonly initialTools?: readonly string[];
  readonly mcpGateway?: Pick<CoreMcpGateway, "snapshot"> & Partial<Pick<CoreMcpGateway, "invokeTool">>;
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

/** Build the same current tool pool for a model run and for command inspection. */
export async function loadToolCatalog(input: ToolCatalogInput, override?: () => ReadonlyMap<string, ToolDefinition>): Promise<{
  readonly skills: ReadonlyMap<string, Skill>;
  readonly tools: ReadonlyMap<string, ToolDefinition>;
  readonly discovery?: ToolDiscovery;
}> {
  assertAdmission(input.admission);
  const { skills, tools: contributed } = input.catalogContent ?? await captureCatalogContent(input);
  const mcp = await mcpToolsForRun(input);
  assertAdmission(input.admission);
  const registry = override?.() ?? createCoreToolRegistry({ skills,
    ...(input.onCommandSettled ? { executionService: createDefaultExecutionService(input.onCommandSettled) } : {}),
    ...(mcp ? { mcpTools: mcp.tools, mcpGateway: mcp.gateway } : {}),
  });
  const combined = new Map(registry);
  for (const tool of [...input.featureTools ?? [], ...contributed]) {
    if (combined.has(tool.name)) throw new Error('Feature tool registration collides with an existing tool.');
    combined.set(tool.name, tool);
  }
  const restricted = input.runtimeConfig ? restrictToolPool(combined, input.runtimeConfig) : combined;
  if (!input.discover) return { skills, tools: restricted };
  // Feature tools are the run's explicit capability, not general catalogue
  // entries: a director's worker controls or a research probe must be present
  // in the first request, so they join the initial set alongside pinned tools.
  const initial = [...(input.initialTools ?? []), ...(input.featureTools ?? []).map(tool => tool.name)];
  const discovery = createToolDiscovery({ catalog: restricted, ...(initial.length ? { initial } : {}) });
  discovery.attachMeta(discoveryTools(discovery));
  return { skills, tools: discovery.snapshot(), discovery };
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

/**
 * The MCP tools this run may offer, with the gateway that serves them.
 *
 * Nothing when the user has not enabled MCP tools: the servers are not
 * connected, and connecting them costs a process spawn per stdio server that a
 * run which never calls one should not pay.
 *
 * A snapshot that fails also yields nothing — the failure is reported to the
 * user by the command surface (`/mcp status` names the server and the reason),
 * and the run proceeds without tools the model cannot use. Registering a
 * server's tools from its config entry instead of its answer would advertise
 * tools that may not exist.
 */
async function mcpToolsForRun(
  request: ToolCatalogInput,
): Promise<{ tools: readonly McpToolDescriptor[]; gateway: Pick<CoreMcpGateway, "invokeTool"> | undefined } | undefined> {
  if (request.runtimeConfig?.enableMcpTools !== true) return undefined;
  const gateway = request.mcpGateway;
  if (!gateway) return undefined;
  try {
    const snapshot = await gateway.snapshot(request.admission);
    // Servers that failed to connect are named here for the same reason a skill
    // that loaded nothing is: the run continues without their tools, and without
    // a line saying so, a server the user configured looks exactly like one the
    // model chose not to use. Individual failures are not fatal — the other
    // servers' tools still reach the pool — so this warns rather than stops.
    const unavailable = snapshot.clients.filter((client) => client.type !== "connected");
    if (unavailable.length > 0) {
      createComponentLogger("mcp").warn(
        `MCP tools unavailable this run: ${unavailable.map((client) => `${client.name} (${client.type})`).join(", ")}.`,
      );
    }
    const tools = request.catalogContent ? snapshot.tools.filter(tool => request.catalogContent!.mcpTools?.some(captured => sameValue(captured, tool))) : snapshot.tools;
    if (tools.length === 0) return undefined;
    return { tools, gateway: gateway.invokeTool ? {
      invokeTool: (server, tool, args, _admission, options) => gateway.invokeTool!(server, tool, args, request.admission, options),
    } : undefined };
  } catch (error) {
    // A snapshot that threw registers nothing, so the model is told nothing
    // exists rather than being handed tools that fail. Said out loud, because
    // the alternative is a run that silently has fewer tools than configured.
    createComponentLogger("mcp").warn(
      `MCP tool discovery failed, so this run has no MCP tools: ${error instanceof Error ? error.message : String(error)}.`,
    );
    return undefined;
  }
}

function restrictToolPool(
  registry: ReadonlyMap<string, ToolDefinition>,
  runtimeConfig: RuntimeConfig,
): ReadonlyMap<string, ToolDefinition> {
  // A name in the allowlist that matches no tool is a typo, and a typo here is
  // invisible: the run simply offers fewer tools than intended and the model
  // works around it. Reported rather than rejected, because a shared config may
  // legitimately name a tool this build does not have.
  const unknown = (runtimeConfig.allowedTools ?? []).filter((name) => !registry.has(name));
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
