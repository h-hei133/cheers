import type {ShellRuntimeContext} from '../../core/shell/runtimeContext.js';
import {getRuntimeConfig, type RuntimeConfigOverrides} from '../../config/runtimeConfig.js';
import type {ResourceSnapshot} from '../resourceLoader.js';
import {boundedSdkToolPolicy, type SdkToolPolicy} from './policy.js';

/** Publish SDK resource policy through the existing configuration owner. */
export function applySdkResources(context: ShellRuntimeContext, resources: ResourceSnapshot,
  policy: SdkToolPolicy, callerOverrides: RuntimeConfigOverrides, contextBudget: {readonly value?: number; readonly override?: number; disabled: boolean},
  admission: () => void): typeof context.configuration.current {
  const state = context.configuration, prior = state.current;
  const currentOuter = getRuntimeConfig(context.cwd, callerOverrides, prior.config.configInputs);
  if (currentOuter.configValidation.securityBlocked) throw new Error('SDK resource tool authority is unavailable.');
  admission();
  const outerTools = currentOuter.allowedTools;
  const previouslyDisabled = contextBudget.disabled;
  const toolPolicy = boundedSdkToolPolicy(policy, resources.extensions,
    {...callerOverrides, ...(outerTools !== undefined ? {allowedTools:outerTools} : {})});
  const overrides = {...prior.binding.overrides, ...(toolPolicy.allowedTools !== undefined ? {allowedTools:toolPolicy.allowedTools} : {})};
  if (resources.noContextFiles) overrides.instructionBudgetBytes = 0;
  else if (previouslyDisabled) {
    if (contextBudget.override !== undefined) overrides.instructionBudgetBytes = contextBudget.override;
    else delete overrides.instructionBudgetBytes;
  }
  const requested = {...prior.requested, ...(toolPolicy.allowedTools !== undefined ? {allowedTools:toolPolicy.allowedTools} : {}),
    instructionBudgetBytes:resources.noContextFiles ? 0 : previouslyDisabled ? contextBudget.value : prior.requested.instructionBudgetBytes,
    ...(toolPolicy.disabledTools ? {disabledTools:[...new Set([...prior.requested.disabledTools, ...toolPolicy.disabledTools])]} : {})};
  const binding = {...prior.binding, overrides};
  const result = state.publish(state.begin(binding), requested, binding, () => {
    if (state.current !== prior) throw new Error('SDK configuration publication changed.');
    admission();
    if (state.current !== prior || context.configuration !== state) throw new Error('SDK configuration publication changed.');
  });
  if (result.status !== 'applied' || result.admissionBlocked || state.current.requested !== requested
    || state.current.revision !== prior.revision + 1) throw new Error('SDK resource policy was not applied.');
  context.systemPrompt = resources.systemPrompt;
  context.appendSystemPrompt = resources.appendSystemPrompt;
  context.sdkSkills = new Map(resources.skills.skills.map(skill => [skill.name, skill]));
  context.skillOptions = {skillPaths:resources.skillPaths, noSkills:resources.noSkills};
  context.themePaths = resources.themePaths;
  context.promptIdentity = undefined;
  contextBudget.disabled = resources.noContextFiles;
  return state.current;
}
