import { expect, it } from 'vitest';
import { ConfigState } from '../../config/state.js';
import { DEFAULT_CONFIG, type RuntimeConfig } from '../../config/runtimeConfig.js';
import {
  configurationRefusal,
  configurationRefusalCauses,
  ConfigurationRefusalError,
} from './configuration.js';
import { configurationOperation } from './scope.js';

/**
 * A refused configuration has to reach the user as the reason it was refused.
 *
 * It used to arrive as `throw new Error(refused)` and nothing on the startup
 * path caught it, so the only thing printed was the stack that led to the
 * throw. The cause — which the publication already held as a diagnostic — was
 * lost, and the message told the user to "reload a valid configuration" when
 * reloading could not change a value that was invalid on disk.
 */

function blockedConfig(diagnostics: readonly string[]): RuntimeConfig {
  return {
    ...DEFAULT_CONFIG,
    configValidation: { valid: false, securityBlocked: false, constraintsBlocked: true },
    configDiagnostics: diagnostics,
  } as RuntimeConfig;
}

function stateOf(config: RuntimeConfig): ConfigState {
  return new ConfigState(config, {
    workspaceRoot: '/workspace',
    sessionId: 'sess_test',
    trustRevision: 'rev',
    overrides: {},
  });
}

const context = (config: RuntimeConfig) => ({
  configuration: stateOf(config),
  projectRoot: '/workspace',
  cwd: '/workspace',
  session: { id: 'sess_test' },
});

it('names the constraint that blocked the configuration', () => {
  const config = blockedConfig(['Config constraint: retryBaseDelayMs must not exceed retryMaxDelayMs.']);
  expect(configurationRefusalCauses({ diagnostics: config.configDiagnostics } as never))
    .toEqual(['Config constraint: retryBaseDelayMs must not exceed retryMaxDelayMs.']);
  expect(configurationRefusal({ diagnostics: config.configDiagnostics } as never))
    .toContain('retryBaseDelayMs must not exceed retryMaxDelayMs.');
});

it('does not list a field the loader merely ignored', () => {
  // "value ignored" means what remains is valid without it; it is not why
  // requests cannot be sent, and listing it sends the user to the wrong file.
  const diagnostics = [
    'Config user allowUntrustedHooks: source-not-allowed; value ignored.',
    'Config constraint: retryBaseDelayMs must not exceed retryMaxDelayMs.',
  ];
  expect(configurationRefusalCauses({ diagnostics } as never))
    .toEqual(['Config constraint: retryBaseDelayMs must not exceed retryMaxDelayMs.']);
});

it('lists a security field that blocked tools', () => {
  const diagnostics = ['Config user denyRules: invalid-value; tools blocked.'];
  expect(configurationRefusalCauses({ diagnostics } as never)).toEqual(diagnostics);
});

it('does not claim a cause when the publication names none', () => {
  const text = configurationRefusal({ diagnostics: [] } as never);
  expect(text).toContain('Inspect /settings');
  expect(text).not.toContain('  - ');
});

it('raises a typed refusal that carries the causes, not a bare error', () => {
  let raised: unknown;
  try { configurationOperation(context(blockedConfig(['Config constraint: reserveTokens must leave input space.']))) as unknown; }
  catch (error) { raised = error; }
  expect(raised).toBeInstanceOf(ConfigurationRefusalError);
  expect((raised as ConfigurationRefusalError).causes)
    .toEqual(['Config constraint: reserveTokens must leave input space.']);
  expect((raised as Error).message).toContain('reserveTokens must leave input space.');
});

it('keeps an ordinary admission refusal as a plain error', () => {
  // The same publication, not blocked: this path answers "the workspace moved",
  // which is a retryable state rather than an invalid file.
  const config = { ...DEFAULT_CONFIG, configValidation: { valid: true, securityBlocked: false } } as RuntimeConfig;
  const moved = { ...context(config), workspaceRevision: 1 };
  const state = stateOf(config);
  const subject = { ...moved, configuration: state, workspaceAdmission: () => 'Workspace roots changed; start a new operation.' };
  let raised: unknown;
  try { configurationOperation(subject) as unknown; } catch (error) { raised = error; }
  expect(raised).toBeInstanceOf(Error);
  expect(raised).not.toBeInstanceOf(ConfigurationRefusalError);
});
