import path from 'node:path';
import type { CommandContext } from '../types.js';
import { configurationApplicationNotice } from '../configuration.js';
import { captureModelChoice } from './choice.js';
import { validateModelPreset } from './preset.js';
import { resolveProviderCredential } from '../../shell/providerCredentials.js';
import { readSessionModel, writeSessionModel } from '../../../session/model/state.js';
import type { SessionModelPolicy, SessionModelRole, SessionModelSelection } from '../../../session/model/contract.js';
import { sameValue } from '../../../config/values.js';
import { SessionModelWriteError } from '../../../session/model/outcome.js';
import { selectedModelMatches, selectionRequest } from './target.js';
import { projectModelSelection } from '../../../session/model/projection.js';
import { catalogModel } from '../../models/catalog.js';
import { effortCapability } from '../../models/capability.js';
import { isThinkingPreference, THINKING_LEVELS, type ThinkingPreference } from '../../models/effort.js';

export type AutomaticModelRole = keyof SessionModelPolicy;
export interface RoleResult { readonly output: string; readonly saved: boolean }

/** Change one automatic consumer through the existing session selection transaction. */
export function prepareModelRole(context: CommandContext, role: AutomaticModelRole) {
  const choice = captureModelChoice(context);
  const baseline = choice.baseline;
  const active = context.resolveConfigTarget?.(choice.config) ?? resolveProviderCredential({ runtimeConfig: choice.config });
  const tier = choice.config.providerConnections.find(connection => connection.id === active.credential?.connectionId)?.serviceTier
    ?? choice.config.providerCredentials[active.provider]?.serviceTier;
  const selection: SessionModelSelection | undefined = baseline?.selection ?? (active.model && active.credential && !active.blocked
    ? { ...(active.credential.connectionId ? { connectionScope: 'session' as const, connectionId: active.credential.connectionId }
      : { connectionScope: 'provider' as const }), provider: active.provider, model: active.model,
      ...(active.thinkingEffort !== undefined ? { thinkingEffort: active.thinkingEffort } : {}),
      ...(tier !== undefined ? { serviceTier: tier } : {}),
      ...(choice.config.contextWindow !== undefined ? { contextWindow: choice.config.contextWindow } : {}),
      roles: choice.config.sessionModelRoles ?? {} }
    : undefined);
  const commit = (target: SessionModelRole | undefined): RoleResult => {
    if (!['subagent', 'summary', 'advisor'].includes(role) || !context.sessionId || !baseline?.projectRoot || !selection
      || path.resolve(baseline.projectRoot) !== path.resolve(context.projectRoot ?? context.cwd)) {
      return { saved: false, output: 'Role assignment requires a current session and a concrete default model.' };
    }
    const admission = choice.admission();
    if (admission) return { saved: false, output: admission };
    if (baseline.selection && (!selectedModelMatches(choice.config, baseline.selection)
      || !sameValue(selectionRequest(context, choice.config, baseline.selection), active))) {
      return { saved: false, output: 'The saved default differs from the current request. Select the current model before editing roles.' };
    }
    const failure = target ? validateModelPreset({ [role]: target }, choice.config, choice.catalog) : undefined;
    if (failure) return { saved: false, output: failure };
    const roles = { ...(selection.roles ?? choice.config.sessionModelRoles) };
    if (target) roles[role] = target;
    else delete roles[role];
    const next = { ...selection, roles };
    try {
      writeSessionModel(context.sessionId, next, baseline, () => !choice.admission());
      if (!sameValue(readSessionModel(context.sessionId), next)) {
        return { saved: false, output: 'Role assignment write outcome is unverified. Reopen the model panel.' };
      }
      const notice = configurationApplicationNotice(context);
      return { saved: true, output: notice
        ? `Role assignment saved for this session.\n${notice}`
        : `${role} ${target ? `uses ${target.provider}/${target.model} on connection ${target.connectionId}; reasoning effort: ${target.thinkingEffort ?? 'provider decides'}`
          : 'follows the default model'} for this session.` };
    } catch (error) {
      return { saved: false, output: error instanceof SessionModelWriteError ? error.message
        : 'Role assignment outcome is unverified. Inspect the saved session before retrying.' };
    }
  };
  const current = (selection?.roles ?? choice.config.sessionModelRoles)?.[role];
  const resolution = current ? resolveProviderCredential({ runtimeConfig: projectModelSelection(choice.config,
    { ...current, connectionScope: 'session' }), env: {} }) : undefined;
  const model = current ? catalogModel(choice.catalog, current.provider, current.model, resolution?.baseUrl) : undefined;
  const levels = current && model?.reasoning !== false ? THINKING_LEVELS.filter(level =>
    effortCapability(choice.catalog, current.provider, current.model, level, resolution?.baseUrl) === 'supported') : [];
  const efforts: readonly ThinkingPreference[] = levels.length ? [null, ...levels] : [];
  return { assign: commit, current, efforts, setEffort: (effort: ThinkingPreference): RoleResult => {
    if (!current || !isThinkingPreference(effort) || !efforts.includes(effort)) {
      return { saved: false, output: 'This role has no available setting for that reasoning effort.' };
    }
    return commit({ ...current, thinkingEffort: effort });
  } };
}
