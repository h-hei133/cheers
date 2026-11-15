import path from 'node:path';
import type { CommandContext } from '../types.js';
import type { SessionModelSelection, SessionVirtualModelSelection } from '../../../session/model/contract.js';
import { decodeVirtualModel, readSessionModelStrict, readSessionModelEdit, writeSessionModel, type SessionModelEdit } from '../../../session/model/state.js';
import { SessionModelWriteError } from '../../../session/model/outcome.js';
import { projectLogicalModel } from '../../../session/model/logical.js';
import { captureModelChoice } from './choice.js';
import { modelRequest } from './target.js';
import { sessionVirtualModels } from '../../catalog/models.js';
import type { CapturedVirtualModelDefinition } from '../../models/virtual/contract.js';
import { defaultHookDispatcher } from '../../hooks/hookDispatcher.js';
import { configurationApplicationNotice } from '../configuration.js';
import { sameValue } from '../../../config/values.js';
import { invalidatePromptMeasurement } from '../../../observability/usageTelemetry.js';
import { isThinkingPreference } from '../../models/effort.js';
import { snapshotData } from '../../values/data.js';

/** Logical selection uses the existing session CAS and never resolves a route. */
export async function setVirtualModel(target: SessionVirtualModelSelection, context: CommandContext,
  options: { readonly baseline?: SessionModelEdit; readonly definition?: CapturedVirtualModelDefinition } = {}): Promise<string> {
  const sessionId = context.sessionId;
  if (!sessionId) return 'Model switch blocked: an active session is required.';
  try {
    const captured = decodeVirtualModel(snapshotData(target, { bytes: 4096, nodes: 8, depth: 2 }));
    if (!captured) return 'Model switch blocked: virtual selection data is invalid; no setting was changed.';
    target = captured;
  } catch { return 'Model switch blocked: virtual selection data is invalid; no setting was changed.'; }
  try {
    if (context.logicalModelAdmission) context = { ...context, admission: context.logicalModelAdmission };
    const root = context.projectRoot ?? context.cwd;
    const choice = captureModelChoice(context);
    const baseline = options.baseline ?? choice.baseline ?? readSessionModelEdit(sessionId);
    if (!baseline.projectRoot || path.resolve(baseline.projectRoot) !== path.resolve(root)) {
      return 'Model switch blocked: the saved session workspace differs from the current workspace.';
    }
    const definitions = sessionVirtualModels(context.cwd, sessionId);
    const definition = options.definition ?? definitions.find(item => item.provider === target.provider && item.id === target.model);
    if (!definition || !definitions.includes(definition) || definition.provider !== target.provider || definition.id !== target.model) {
      return 'Model switch blocked: the selected virtual model is unavailable. Reload its extension or choose another model.';
    }
    if (target.thinkingEffort !== undefined && (!isThinkingPreference(target.thinkingEffort)
      || (target.thinkingEffort !== null && definition.thinkingLevels !== undefined && !definition.thinkingLevels.includes(target.thinkingEffort)))) {
      return 'Model switch blocked: this virtual model does not support the selected reasoning effort.';
    }
    const current = (): boolean => {
      if (context.signal?.aborted || !sessionVirtualModels(context.cwd, sessionId).includes(definition)) return false;
      const refusal = choice.admission();
      return !refusal && !context.signal?.aborted && sessionVirtualModels(context.cwd, sessionId).includes(definition);
    };
    if (!current()) return 'Model switch blocked: session, configuration or virtual model registration changed.';
    const physical = baseline.selection ?? captureAuthority(context, choice.config);
    const next: SessionModelSelection = { ...physical, virtualModel: { ...target } };
    const previous = projectLogicalModel(baseline.selection);
    const fromModel = previous ? `${previous.provider}/${previous.model}` : 'default';
    const toModel = `${target.provider}/${target.model}`;
    const hook = await defaultHookDispatcher.dispatch({ eventName: 'PreModelSwitch', sessionId,
      workspaceRoot: root, timestamp: new Date().toISOString(), fromModel, toModel });
    if (hook?.decision === 'block') return 'Model switch blocked by hook policy.';
    if (!current()) return 'Model switch blocked: session, configuration or virtual model registration changed.';
    writeSessionModel(sessionId, next, baseline, current);
    if (!sameValue(readSessionModelStrict(sessionId), next)) return 'Model selection publication is unverified; inspect the saved session before retrying.';
    invalidatePromptMeasurement(sessionId);
    const application = configurationApplicationNotice(context);
    if (application) return `Model preference saved for ${toModel}; reasoning effort: ${target.thinkingEffort ?? 'auto'}.\n${application}`;
    try {
      await defaultHookDispatcher.dispatch({ eventName: 'PostModelSwitch', sessionId,
        workspaceRoot: root, timestamp: new Date().toISOString(), fromModel, toModel });
    } catch { return `Model preference saved for ${toModel}. Post-switch hook outcome is unverified.`; }
    return `Model switched to ${toModel}.\nReasoning effort: ${target.thinkingEffort ?? 'auto'}.\nScope: current session (saved for resume).`;
  } catch (error) {
    return error instanceof SessionModelWriteError ? `Model switch failed: ${error.message}`
      : 'Model selection outcome is unverified. Inspect saved session preferences before retrying.';
  }
}

/** Preserve real configured authority without demanding a ready dormant model or credential. */
function captureAuthority(context: CommandContext, config: ReturnType<typeof captureModelChoice>['config']) {
  const request = modelRequest(context, config);
  const binding = config.sessionConnection;
  const connectionId = binding && binding.scope !== 'provider' ? binding.id
    : config.activeProviderConnectionId ?? request.credential?.connectionId;
  const connection = config.providerConnections.find(item => item.id === connectionId);
  const provider = binding?.provider ?? connection?.provider ?? request.provider;
  return { ...(connectionId ? { connectionId, connectionScope: 'session' as const } : { connectionScope: 'provider' as const }),
    provider, ...(request.model !== undefined ? { model: request.model } : {}),
    ...(request.thinkingEffort !== undefined ? { thinkingEffort: request.thinkingEffort } : {}),
    ...(config.sessionModelRoles ? { roles: config.sessionModelRoles } : {}) };
}
