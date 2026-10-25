import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import { configurationOperation } from '../../../core/shell/scope.js';
import { readPromptPreview } from '../../../session/context/preview.js';
import { resolveSkillCatalog } from '../../../core/skills/skillCatalog.js';
import { catalogContributions } from '../../../core/catalog/contributions.js';
import { expandSkills } from '../../../core/prompts/skills.js';
import { promptTokens } from '../../../core/prompts/tokens.js';
import { preparePromptRequest } from '../../../core/prompts/request.js';
import { foregroundTools, promptWithContext } from '../prompt.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../../core/auth/account/target.js';
import { DEFAULT_ENDPOINT_KIND, endpointShape, endpointTurnBody } from '../../../provider/endpoints/index.js';
import { selectModelContext } from '../../../session/context/selection.js';
import { openingMessage } from '../../../turn/opening.js';
import { getSessionUsage } from '../../../observability/usageTelemetry.js';
import { estimatePrompt } from '../../../context/request/estimate.js';
import { requestIdentity } from '../../../context/request/identity.js';
import { capturePromptSources } from '../../../context/request/sources.js';
import { assertContextBounds, contextEntryStillAuthorized } from '../../../context/attachment/entry.js';
import { sourceReaderFor } from '../../data/access.js';
import type { PromptAttachments } from '../../../core/shell/sessionRuntime.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import { finalStepMessages, outgoingMessages } from '../../../turn/messages.js';
import { resolveRequestShape } from '../../../core/models/requestShape.js';
import { captureUsageAttribution } from '../../../observability/usage/identity.js';
import { estimateWirePrompt } from '../../../context/request/wire.js';
import { createCommandRegistry } from '../../../core/commands/registry.js';
import { resolveCommandInvocation } from '../../../core/commands/invocation.js';
import { decodeHandoffs } from '../../../workflow/handoff/codec.js';
import { decodeDirectors } from '../../../workflow/director/codec.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { toolSchemas } from '../../../turn/tools.js';
import { projectStatePath } from '../../../core/state/projectState.js';
import { configuredOutputLimit } from '../../../provider/request/output.js';
import { serviceTierCapability } from '../../../core/models/serviceTier.js';

/** A local estimate never connects MCP, accepts an injection or starts a driver. */
export async function previewContext(context: ShellRuntimeContext, manager: SessionManager, gateway: CliMcpGateway,
  draft: string, attachments: PromptAttachments | undefined, agentMode: 'plan' | 'build', permissionScope: import('../../approval/permissionScope.js').PermissionScope,
  signal: AbortSignal) {
  const operation = configurationOperation(context);
  const { config, publication, admission } = operation;
  const expected = context.session; const cwd = context.cwd;
  const sources = capturePromptSources();
  // Stateful command preparation has not happened; its request cannot yet be predicted.
  const tokens = promptTokens(draft).filter(token => !token.literal && token.raw.startsWith('/') && !token.raw.startsWith('/skill:'));
  const commands = tokens.length ? [...createCommandRegistry(cwd, config).values(),
    ...catalogContributions(cwd, expected.id).flatMap(entry => entry.commands)] : [];
  if (tokens.some(token => !token.literal && !token.raw.startsWith('/skill:')
    && (resolveCommandInvocation(commands, token.raw) || token.from === 0 && /^\/[A-Za-z0-9:._?-]+$/.test(token.raw)))) {
    throw new Error('Command request preparation is pending.');
  }
  const snapshot = config.enableMcpTools ? gateway.peekSnapshot?.() : undefined;
  if (config.enableMcpTools && (!snapshot || snapshot.clients.some(client => client.type !== 'connected'))) {
    throw new Error('MCP catalogue is not ready for a complete estimate.');
  }
  const session = await readPromptPreview(manager, expected, cwd, draft, signal, sources.track);
  // These modes rewrite the run configuration or context at admission.
  if (decodeHandoffs(session.state.handoffs, session.scope).cycles.some(row => !row.retired && ['armed', 'running', 'switched', 'unknown'].includes(row.phase))
    || decodeDirectors(session.state.directors, session.scope).cycles.some(row => !row.retired && row.phase !== 'disabled')) {
    throw new Error('Workflow request preparation is pending.');
  }
  const contributions = catalogContributions(cwd, expected.id);
  const skills = await resolveSkillCatalog({ workspaceRoot: cwd, sessionId: expected.id, ...context.skillOptions, abortSignal: signal }, sources.track);
  const expanded = expandSkills(draft, skills.skills);
  if (expanded.unknownSkill) throw new Error('Selected skill is unavailable.');
  if (!context.preparePromptContext) throw new Error('Session prompt preview is unavailable.');
  const injected = await context.preparePromptContext(expanded.text, signal);
  const entries = [...context.contextAttachments ?? [], ...context.transientContextAttachments ?? []];
  const entryIdentity = JSON.stringify([context.contextAttachments, context.transientContextAttachments]);
  assertContextBounds(entries);
  const reader = sourceReaderFor(context, signal);
  for (const entry of entries) sources.track(entry.path);
  const forcedTool = context.peekForcedTool?.();
  const features = foregroundTools(context);
  const featureIdentity = JSON.stringify(toolSchemas(new Map(features.map(tool => [tool.name, tool]))));
  const prepared = await preparePromptRequest({ workspaceRoot: cwd, sessionId: expected.id, runtimeConfig: config, agentMode,
    catalogContent: { skills: skills.skills, tools: contributions.flatMap(entry => entry.tools), ...(snapshot ? { mcpTools: snapshot.tools } : {}) },
    ...(snapshot ? { mcpGateway: { snapshot: async () => snapshot } } : {}),
    featureTools: features, admission, signal, onSource: sources.track,
    ...(forcedTool ? { forcedTool, allowedTools: [forcedTool] } : {}) });
  const resolution = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
  if (!resolution?.model || resolution.blocked) throw new Error('Model request identity is unavailable.');
  const base = providerCredentialBaseUrl(publication.catalog, resolution);
  if (!base) throw new Error('Model request destination is unavailable.');
  const endpoint = providerCredentialEndpoint(publication.catalog, resolution, base) ?? DEFAULT_ENDPOINT_KIND;
  const protocol = endpointShape(endpoint);
  const messages = [...selectModelContext(session.session), openingMessage({ workspaceRoot: cwd,
    workspaceRoots: expected.workspaceRoots, permissionScope, goalObjective: session.goalObjective, continuityContext: session.continuityContext,
    prompt: promptWithContext(injected.prompt, entries), attachments })];
  if (messages.some(message => message.origin?.replayBinding || message.reasoning?.signature || message.reasoning?.redacted)) {
    throw new Error('Opaque replay has no complete local token estimate.');
  }
  if (resolution.thinkingEffort === undefined) sources.track(projectStatePath(cwd));
  const preference = captureThinkingPreference(cwd, resolution.thinkingEffort);
  const shape = resolveRequestShape(publication.catalog, resolution.provider, resolution.model, preference.thinkingEffort ?? undefined, base);
  const overhead = prepared.currentOverhead();
  const schemas = toolSchemas(prepared.currentTools());
  const allowTools = config.maxTurns > 0;
  const assembledIdentity = requestIdentity({ ...overhead, tools: allowTools ? schemas : [] });
  const configuredOutput = configuredOutputLimit(config, endpoint);
  const serviceTier = config.providerConnections?.find(item => item.id === resolution.credential?.connectionId)?.serviceTier
    ?? config.providerCredentials?.[resolution.provider]?.serviceTier;
  if (serviceTier && serviceTierCapability(publication.catalog, resolution.provider, resolution.model, serviceTier, base, endpoint) !== 'supported') {
    throw new Error('Configured service tier is unavailable.');
  }
  const output = protocol.outputControl === 'provider' ? undefined : shape.maxOutputCeiling;
  const body = endpointTurnBody(endpoint, { model: resolution.model, provider: resolution.provider,
    replayBinding: requestReplayBinding({ provider: resolution.provider, endpoint, baseUrl: base }),
    systemPrompt: overhead.systemPrompt ?? '', messages: finalStepMessages(outgoingMessages(messages, shape.assistantAfterToolResult), allowTools, schemas.length > 0),
    tools: schemas, allowTools, vision: shape.vision, temperature: config.temperature ?? 0.7,
    topP: config.topP, maxOutputTokens: configuredOutput ?? output, serviceTier,
    thinkingLevelName: shape.thinkingLevelName, thinkingBudgetTokens: shape.thinkingBudgetTokens,
    allowEmptySignature: shape.allowEmptySignature, supportsTemperature: shape.supportsTemperature,
    systemRole: shape.systemRole, reasoningEffort: shape.reasoningEffort,
    maxTokensField: shape.maxTokensField, assistantAfterToolResult: shape.assistantAfterToolResult,
  });
  const endpointId = captureUsageAttribution({ provider: resolution.provider, model: resolution.model, baseUrl: base }).endpointId;
  const estimate = estimatePrompt(messages, overhead, { provider: resolution.provider, model: resolution.model,
    endpoint, endpointId, ...assembledIdentity }, getSessionUsage(expected.id), estimateWirePrompt(body, protocol.contextFields));
  const verify = () => {
    signal.throwIfAborted(); session.verify(); sources.verify(); skills.verify?.();
    if ([...skills.skills.values()].some(skill => skill.isCurrent?.() === false)) throw new Error('Skill catalogue changed.');
    if (JSON.stringify(requestIdentity({ ...prepared.currentOverhead(), tools: allowTools ? toolSchemas(prepared.currentTools()) : [] })) !== JSON.stringify(assembledIdentity)
      || JSON.stringify(toolSchemas(new Map(foregroundTools(context).map(tool => [tool.name, tool])))) !== featureIdentity) {
      throw new Error('Request tool schemas changed.');
    }
    if (admission() || context.configuration.current !== publication || context.session !== expected || context.cwd !== cwd
      || !injected.isCurrent() || context.peekForcedTool?.() !== forcedTool
      || JSON.stringify([context.contextAttachments, context.transientContextAttachments]) !== entryIdentity
      || catalogContributions(cwd, expected.id).some((entry, index) => entry !== contributions[index])
      || catalogContributions(cwd, expected.id).length !== contributions.length
      || entries.some(entry => !contextEntryStillAuthorized(cwd, entry, reader))) throw new Error('Context preview is stale.');
    const selected = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
    if (selected.blocked || selected.provider !== resolution.provider || selected.model !== resolution.model
      || selected.thinkingEffort !== resolution.thinkingEffort || providerCredentialBaseUrl(publication.catalog, selected) !== base
      || (providerCredentialEndpoint(publication.catalog, selected, base) ?? DEFAULT_ENDPOINT_KIND) !== endpoint) {
      throw new Error('Model request target changed.');
    }
    if (config.enableMcpTools && JSON.stringify(gateway.peekSnapshot?.()) !== JSON.stringify(snapshot)) throw new Error('MCP catalogue changed.');
  };
  verify();
  return { estimate, verify };
}
