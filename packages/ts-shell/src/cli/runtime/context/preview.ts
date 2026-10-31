import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { CliMcpGateway } from '../../../entrypoints/cliMcpModule.js';
import { configurationOperation } from '../../../core/shell/scope.js';
import { readPromptPreview } from '../../../session/context/preview.js';
import { resolveSkillCatalog } from '../../../core/skills/skillCatalog.js';
import { catalogContributions } from '../../../core/catalog/contributions.js';
import { promptTokens } from '../../../core/prompts/tokens.js';
import { needsComposition } from '../../../core/commands/composition.js';
import { compositionPlan } from '../../../core/commands/composition/plan.js';
import { prepareComposition } from '../../../core/commands/composition/prepare.js';
import { preparePromptRequest } from '../../../core/prompts/request.js';
import { foregroundTools, promptWithContext } from '../prompt.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../../../core/auth/account/target.js';
import { DEFAULT_ENDPOINT_KIND, endpointShape, endpointTurnBody } from '../../../provider/endpoints/index.js';
import { selectModelContext } from '../../../session/context/selection.js';
import { openingMessage } from '../../../turn/opening.js';
import { getSessionUsage } from '../../../observability/usageTelemetry.js';
import { estimatePrompt } from '../../../context/request/estimate.js';
import { historyDigest, requestIdentity } from '../../../context/request/identity.js';
import { capturePromptSources } from '../../../context/request/sources.js';
import { assertContextBounds, contextEntryPathWithinRoot } from '../../../context/attachment/entry.js';
import { verifyContextEntries } from '../../../context/attachment/verify.js';
import { sourceAccessFor, sourceReaderForAsync } from '../../data/access.js';
import type { PromptAttachments } from '../../../core/shell/sessionRuntime.js';
import { resolveProviderCredential } from '../../../core/shell/providerCredentials.js';
import {
  finalStepMessages,
  hasToolHistory,
  outgoingMessages,
  TOOL_HISTORY_UNSUPPORTED_MESSAGE,
} from '../../../turn/messages.js';
import { resolveRequestShape } from '../../../core/models/requestShape.js';
import { catalogProvider } from '../../../core/models/catalog.js';
import { captureUsageAttribution } from '../../../observability/usage/identity.js';
import { estimateWirePrompt } from '../../../context/request/wire.js';
import { createCommandRegistry } from '../../../core/commands/registry.js';
import { parseCommandSource, resolveCommandInvocation } from '../../../core/commands/invocation.js';
import { decodeHandoffs } from '../../../workflow/handoff/codec.js';
import { decodeDirectors } from '../../../workflow/director/codec.js';
import { requestReplayBinding } from '../../../provider/request/replay.js';
import { captureThinkingPreference } from '../../../core/models/preference.js';
import { toolSchemas } from '../../../turn/tools.js';
import { projectStatePath } from '../../../core/state/projectState.js';
import { configuredOutputLimit } from '../../../provider/request/output.js';
import { configuredServiceTier, serviceTierCapability } from '../../../core/models/serviceTier.js';
import { tokenizeCommandArgs } from '../../../core/commands/arguments.js';
import { parseResearchArgs } from '../../../core/commands/research/syntax.js';
import { researchEntryRequest, researchTurnPrompt } from '../../../research/run/entry.js';
import { researchPreviewTools } from '../../../research/run/tools.js';
import { clearResearchPreview, prepareResearchPreview } from './research.js';
import { clearReviewPreview, clearStaleReviewPreview, prepareReviewPreview } from './review.js';
import { systemPromptSnapshot } from '../../../turn/prompt.js';
import { providerRequestTarget } from '../../provider/requestTarget.js';

/** A local estimate never connects MCP, accepts an injection or starts a driver. */
export async function previewContext(context: ShellRuntimeContext, manager: SessionManager, gateway: CliMcpGateway,
  draft: string, attachments: PromptAttachments | undefined, agentMode: 'plan' | 'build', permissionScope: import('../../approval/permissionScope.js').PermissionScope,
  signal: AbortSignal) {
  signal.throwIfAborted();
  clearReviewPreview(context);
  clearResearchPreview(context);
  const operation = configurationOperation(context);
  const { config, publication, admission } = operation;
  const expected = context.session; const cwd = context.cwd;
  const sources = capturePromptSources();
  const contributions = catalogContributions(cwd, expected.id);
  const source = parseCommandSource(draft);
  const sourceName = source?.name && /^[A-Za-z0-9:._?-]+$/.test(source.name) ? source.name.toLowerCase() : undefined;
  const commandTokens = promptTokens(draft).filter(token => !token.literal && /^\/[A-Za-z0-9:._?-]+$/.test(token.raw));
  const templateNames = new Set(commandTokens.filter(token => !token.raw.startsWith('/skill:'))
    .map(token => token.raw.slice(1).toLowerCase()));
  if (sourceName && !sourceName.startsWith('skill:')) templateNames.add(sourceName);
  const needsCommands = commandTokens.some(token => token.from === 0 || !token.raw.startsWith('/skill:'))
    || (sourceName !== undefined && !sourceName.startsWith('skill:'));
  const commands = needsCommands ? [...createCommandRegistry(cwd, config, sources.track, {
    templates: { names: templateNames, signal },
  }).values(),
    ...contributions.flatMap(entry => entry.commands)] : [];
  signal.throwIfAborted();
  const opening = /^\/([^\s/]+)(?:\s|$)/.exec(draft)?.[1];
  const first = opening ? resolveCommandInvocation(commands, opening) : undefined;
  const composed = (!first || !!first.composition) && needsComposition(draft, commands);
  const plan = compositionPlan(draft, commands);
  const standalone = !composed && source ? resolveCommandInvocation(commands, source.name) : undefined;
  const definition = commands.find(command => command.name === standalone?.commandName);
  const pureStandalone = definition?.kind === 'prompt' && definition.enabled !== false && definition.availability !== 'hidden'
    ? standalone?.preparePrompt : undefined;
  const researchStandalone = definition?.name === 'deep-research' && definition.enabled !== false && definition.availability !== 'hidden';
  const reviewStandalone = definition?.name === 'review' && definition.enabled !== false && definition.availability !== 'hidden';
  // Match dispatch eligibility without invoking standalone handlers or workflow drivers.
  if ((!composed && !pureStandalone && !researchStandalone && !reviewStandalone && draft.startsWith('/') && !/^\/[^\s]*[\/\\]/.test(draft))
    || (composed && plan.methods.some(method => method.invocation.composition?.kind === 'driver'
      && method.definition.name !== 'deep-research' && method.definition.name !== 'review'))) {
    throw new Error('Command request preparation is pending.');
  }
  const snapshot = config.enableMcpTools ? gateway.peekSnapshot?.() : undefined;
  if (config.enableMcpTools && (!snapshot || snapshot.clients.some(client => client.type !== 'connected'))) {
    throw new Error('MCP catalogue is not ready for a complete estimate.');
  }
  const skills = await resolveSkillCatalog({ workspaceRoot: cwd, sessionId: expected.id, ...context.skillOptions, abortSignal: signal }, sources.track);
  const composition = composed ? prepareComposition(draft, plan, skills.skills) : undefined;
  if (composition?.error !== undefined) throw new Error(composition.error);
  let effectivePrompt = composition?.prompt ?? (pureStandalone && source ? pureStandalone(source.argsText) : draft);
  const review = reviewStandalone ? await prepareReviewPreview(context, source?.argsText ? [source.argsText] : [], undefined, signal)
    : composition?.driver?.method.definition.name === 'review' ? await prepareReviewPreview(context, composition.driver.args, {
      originalInput: draft, prose: plan.prose, skills: composition.expanded.instructions, modifiers: composition.modifiers,
    }, signal) : undefined;
  if (review) effectivePrompt = review.prompt;
  const session = await readPromptPreview(manager, expected, cwd, effectivePrompt, signal, sources.track);
  const researchArgs = composition?.driver?.method.definition.name === 'deep-research' ? composition.driver.args
    : researchStandalone && source ? tokenizeCommandArgs(source.argsText) : undefined;
  const parsedResearch = researchArgs ? parseResearchArgs(researchArgs) : undefined;
  if (parsedResearch && !parsedResearch.ok) throw new Error('Research command request preparation is pending.');
  const research = parsedResearch?.ok ? prepareResearchPreview(context, session, researchEntryRequest(parsedResearch,
    composition?.driver ? { originalInput: draft, prose: plan.prose, skills: composition.expanded.instructions, modifiers: composition.modifiers } : undefined), attachments) : undefined;
  if (research) effectivePrompt = researchTurnPrompt(research.run);
  // These modes rewrite the run configuration or context at admission.
  if (decodeHandoffs(session.state.handoffs, session.scope).cycles.some(row => !row.retired && ['armed', 'running', 'switched', 'unknown'].includes(row.phase))
    || decodeDirectors(session.state.directors, session.scope).cycles.some(row => !row.retired && row.phase !== 'disabled')) {
    throw new Error('Workflow request preparation is pending.');
  }
  if (!context.preparePromptContext) throw new Error('Session prompt preview is unavailable.');
  const injected = await context.preparePromptContext(effectivePrompt, signal);
  const entries = [...context.contextAttachments ?? [], ...context.transientContextAttachments ?? []];
  const entryIdentity = JSON.stringify([context.contextAttachments, context.transientContextAttachments]);
  assertContextBounds(entries);
  const access = sourceAccessFor(context, signal);
  for (const entry of entries) sources.track(entry.path);
  const forcedTool = context.peekForcedTool?.();
  const ordinaryFeatures = foregroundTools(context);
  const features = research ? foregroundTools(context, researchPreviewTools(research.run)) : ordinaryFeatures;
  const featureIdentity = JSON.stringify(toolSchemas(new Map(ordinaryFeatures.map(tool => [tool.name, tool]))));
  const prepared = await preparePromptRequest({ workspaceRoot: cwd, sessionId: expected.id, runtimeConfig: config, agentMode: review ? 'plan' : agentMode,
    catalogContent: { skills: skills.skills, tools: contributions.flatMap(entry => entry.tools), ...(snapshot ? { mcpTools: snapshot.tools } : {}) },
    ...(snapshot ? { mcpGateway: { snapshot: async () => snapshot } } : {}),
    featureTools: features, admission, signal, onSource: sources.track,
    ...(forcedTool ? { forcedTool, allowedTools: [forcedTool] } : {}) });
  const resolution = context.resolveConfigTarget?.(config, expected.id)
    ?? resolveProviderCredential({ runtimeConfig: config, pool: { sessionId: expected.id } });
  if (!resolution?.model || resolution.blocked) throw new Error('Model request identity is unavailable.');
  const base = providerCredentialBaseUrl(publication.catalog, resolution);
  if (!base) throw new Error('Model request destination is unavailable.');
  const endpoint = providerCredentialEndpoint(publication.catalog, resolution, base) ?? DEFAULT_ENDPOINT_KIND;
  const protocol = endpointShape(endpoint);
  const messages = [...selectModelContext(session.session), openingMessage({ workspaceRoot: cwd,
    workspaceRoots: expected.workspaceRoots, permissionScope, goalObjective: session.goalObjective, continuityContext: session.continuityContextFor(effectivePrompt),
    prompt: promptWithContext(injected.prompt, entries), attachments })];
  // Ownership also binds public text; only opaque payloads prevent local measurement.
  if (messages.some(message => message.reasoning?.signature || message.reasoning?.redacted)) {
    throw new Error('Opaque replay has no complete local token estimate.');
  }
  if (resolution.thinkingEffort === undefined) sources.track(projectStatePath(cwd));
  const preference = captureThinkingPreference(cwd, resolution.thinkingEffort);
  // A preview that cannot be sent is not a preview. The dispatch path refuses an
  // endpoint two catalogue entries claim, and an ambiguous address also makes
  // the shape fall back to a capable default, so estimating here would describe
  // a request the run will never build.
  if (catalogProvider(publication.catalog, resolution.provider, base).ambiguous) {
    throw new Error('The model catalogue has multiple entries for this endpoint. Resolve them before sending.');
  }
  const shape = resolveRequestShape(publication.catalog, resolution.provider, resolution.model, preference.thinkingEffort ?? undefined, base, endpoint);
  if (!shape.toolCalling && hasToolHistory(messages)) throw new Error(TOOL_HISTORY_UNSUPPORTED_MESSAGE);
  const schemas = shape.toolCalling ? toolSchemas(prepared.currentTools()) : [];
  // The turn owner counts the first step before dispatch; a one-step run is closing.
  const allowTools = config.maxTurns > 1 && shape.toolCalling;
  const systemPrompt = shape.toolCalling
    ? prepared.system.text
    : systemPromptSnapshot(review ? 'plan' : agentMode, prepared.promptContext, false).text;
  const overhead = { systemPrompt, tools: allowTools ? schemas : [] };
  const assembledIdentity = requestIdentity(overhead);
  const configuredOutput = configuredOutputLimit(config, endpoint);
  const serviceTier = configuredServiceTier(config, resolution);
  if (serviceTier && serviceTierCapability(publication.catalog, resolution.provider, resolution.model, serviceTier, base, endpoint) !== 'supported') {
    throw new Error('Configured service tier is unavailable.');
  }
  const output = protocol.outputControl === 'provider' ? undefined : shape.maxOutputCeiling;
  const wireMessages = finalStepMessages(
    outgoingMessages(messages, shape.assistantAfterToolResult),
    allowTools,
    schemas.length > 0,
  );
  const wireHistoryDigest = historyDigest(wireMessages);
  const targetIdentity = resolution.credential
    ? providerRequestTarget({ workspaceRoot: cwd, sessionId: expected.id, resolution, baseUrl: base, endpoint })
    : undefined;
  const replayBinding = targetIdentity?.replayBinding
    ?? requestReplayBinding({ provider: resolution.provider, endpoint, baseUrl: base });
  const body = endpointTurnBody(endpoint, { model: resolution.model, provider: resolution.provider,
    replayBinding,
    systemPrompt, messages: wireMessages,
    tools: schemas, allowTools, vision: shape.vision, temperature: config.temperature ?? 0.7,
    topP: config.topP, maxOutputTokens: configuredOutput ?? output, serviceTier,
    thinkingLevelName: shape.thinkingLevelName, thinkingBudgetTokens: shape.thinkingBudgetTokens,
    allowEmptySignature: shape.allowEmptySignature, supportsTemperature: shape.supportsTemperature,
    systemRole: shape.systemRole, reasoningEffort: shape.reasoningEffort, reasoningSummary: shape.reasoningSummary,
    reasoningReplayField: shape.reasoningReplayField,
    maxTokensField: shape.maxTokensField, assistantAfterToolResult: shape.assistantAfterToolResult,
  });
  const endpointId = captureUsageAttribution({ provider: resolution.provider, model: resolution.model, baseUrl: base }).endpointId;
  const estimate = estimatePrompt(messages, overhead, { provider: resolution.provider, model: resolution.model,
    endpoint, endpointId, ...assembledIdentity, wireHistoryDigest, wireMessageCount: wireMessages.length, replayBinding },
  getSessionUsage(expected.id), estimateWirePrompt(body, protocol.contextFields));
  let suspended = false;
  const verify = () => {
    try {
      signal.throwIfAborted(); session.verify(); sources.verify(); skills.verify?.(); research?.verify();
      for (const entry of entries) {
        if (!contextEntryPathWithinRoot(cwd, entry)) throw new Error('Context preview is stale.');
        try { access(entry.path); } catch { throw new Error('Context preview is stale.'); }
      }
      if ([...skills.skills.values()].some(skill => skill.isCurrent?.() === false)) throw new Error('Skill catalogue changed.');
      if (JSON.stringify(requestIdentity({ systemPrompt, tools: allowTools ? toolSchemas(prepared.currentTools()) : [] })) !== JSON.stringify(assembledIdentity)
        || JSON.stringify(toolSchemas(new Map(foregroundTools(context).map(tool => [tool.name, tool])))) !== featureIdentity) {
        throw new Error('Request tool schemas changed.');
      }
      if (admission() || context.configuration.current !== publication || context.session !== expected || context.cwd !== cwd
        || !injected.isCurrent() || context.peekForcedTool?.() !== forcedTool
        || JSON.stringify([context.contextAttachments, context.transientContextAttachments]) !== entryIdentity
        || catalogContributions(cwd, expected.id).some((entry, index) => entry !== contributions[index])
        || catalogContributions(cwd, expected.id).length !== contributions.length) throw new Error('Context preview is stale.');
      const selected = context.resolveConfigTarget?.(config, expected.id)
        ?? resolveProviderCredential({ runtimeConfig: config, pool: { sessionId: expected.id } });
      const selectedTarget = selected.credential
        ? providerRequestTarget({ workspaceRoot: cwd, sessionId: expected.id, resolution: selected, baseUrl: base, endpoint })
        : undefined;
      if (selected.blocked || selected.provider !== resolution.provider || selected.model !== resolution.model
        || selected.thinkingEffort !== resolution.thinkingEffort || providerCredentialBaseUrl(publication.catalog, selected) !== base
        || (providerCredentialEndpoint(publication.catalog, selected, base) ?? DEFAULT_ENDPOINT_KIND) !== endpoint
        || selectedTarget?.replayBinding !== targetIdentity?.replayBinding
        || selectedTarget?.credentialId !== targetIdentity?.credentialId
        || selectedTarget?.credentialGeneration !== targetIdentity?.credentialGeneration
        || selectedTarget?.replayOwner !== targetIdentity?.replayOwner) {
        throw new Error('Model request target changed.');
      }
      if (config.enableMcpTools && JSON.stringify(gateway.peekSnapshot?.()) !== JSON.stringify(snapshot)) throw new Error('MCP catalogue changed.');
    } catch (error) {
      if (!suspended) review?.invalidate();
      throw error;
    }
  };
  const verifyContent = async (checkingSignal: AbortSignal) => {
    try {
      checkingSignal.throwIfAborted(); verify();
      await sources.verifyContent(checkingSignal);
      await injected.verifyContent?.(checkingSignal);
      await verifyContextEntries(cwd, entries, sourceReaderForAsync(context, checkingSignal), checkingSignal);
      await review?.verifyContent(checkingSignal);
      verify();
    } catch (error) {
      if (!suspended) review?.invalidate();
      throw error;
    }
  };
  await verifyContent(signal);
  research?.publish(verifyContent);
  if (!review) clearStaleReviewPreview(context);
  const reviewExpiresAt = review?.publish(verifyContent, attachments);
  return { estimate, verify, verifyContent,
    ...(reviewExpiresAt !== undefined ? { expiresAt: reviewExpiresAt } : {}),
    suspend: () => { suspended = true; },
    resume: () => { suspended = false; },
    invalidate: () => { review?.invalidate(); research?.discard(); },
    dispose: () => { review?.discard(); research?.discard(); } };
}
