import { Ajv, type AnySchemaObject, type ValidateFunction } from 'ajv';
import { booleanSchema, connectionSchema, countSchema, credentialSchema, delaySchema, enumSchema, listSchema, nameSchema, objectSchema, positiveSchema, textSchema, tuiSchemas } from './schema.js';

export type ConfigSource = 'project' | 'user' | 'environment' | 'override';
export type MergePolicy = 'replace' | 'intersect' | 'union' | 'deny' | 'disable' | 'tui';
export interface ConfigField {
  readonly schema: AnySchemaObject;
  readonly validate: ValidateFunction;
  readonly sources: readonly ConfigSource[];
  readonly merge: MergePolicy;
  readonly security: boolean;
}
export type ConfigFields = Readonly<Record<string, ConfigField>>;
const ajv = new Ajv({ allErrors: false, strict: true });
ajv.addKeyword({ keyword: 'environment', schemaType: 'boolean', valid: true });

function field(schema: AnySchemaObject, sources: readonly ConfigSource[] = ['project', 'user'], merge: MergePolicy = 'replace', security = false): ConfigField {
  return { schema, validate: ajv.compile(schema), sources, merge, security };
}

/** Every accepted input has one schema and source/merge policy, including CLI-only input. */
export function createConfigFields(providers: readonly string[]) {
  const personal: ConfigSource[] = ['user'];
  const withOverride: ConfigSource[] = ['project', 'user', 'override'];
  return {
    schemaVersion: field({ const: 1 }),
    provider: field(enumSchema(providers), personal),
    providerCredentials: field(objectSchema(Object.fromEntries(providers.map(provider => [provider, credentialSchema]))), personal),
    providerConnections: field(listSchema(connectionSchema(providers)), personal),
    activeProviderConnectionId: field(textSchema, personal),
    maxTurns: field(positiveSchema, ['project', 'user', 'environment']),
    allowedTools: field(listSchema(nameSchema), withOverride, 'intersect', true),
    disabledTools: field(listSchema(nameSchema), undefined, 'union', true),
    hiddenToolPrefixes: field(listSchema(nameSchema), undefined, 'union', true),
    denyRules: field(listSchema(objectSchema({ tool: nameSchema, pattern: textSchema }, ['tool'])), undefined, 'deny', true),
    enableMcpTools: field(booleanSchema, undefined, 'disable', true),
    temperature: field({ type: 'number' }),
    topP: field({ type: 'number', minimum: 0, maximum: 1 }),
    maxOutputTokens: field(positiveSchema),
    contextWindow: field(positiveSchema),
    reserveTokens: field(countSchema),
    modelTokenBudgets: field({ type: 'object', propertyNames: nameSchema, additionalProperties: objectSchema({ reserveTokens: countSchema, keepRecentTokens: countSchema }) }),
    instructionBudgetBytes: field(countSchema, withOverride),
    offline: field(booleanSchema, withOverride),
    allowUntrustedHooks: field(booleanSchema, ['override'], 'replace', true),
    // Idle warming can spend money without a new prompt; only a personal choice enables it.
    cacheWarming: field(enumSchema(['off', 'streaming', 'idle']), personal),
    agentMode: field(enumSchema(['plan', 'build'])),
    theme: field(nameSchema),
    tuiMode: field(enumSchema(['regular', 'fullscreen'])),
    tui: field(objectSchema(tuiSchemas), undefined, 'tui'),
    retryEnabled: field(booleanSchema),
    retryMaxRetries: field(countSchema),
    providerRetryMaxRetries: field(countSchema),
    retryBaseDelayMs: field(delaySchema),
    retryMaxDelayMs: field(delaySchema),
    steeringMode: field(enumSchema(['one-at-a-time', 'all'])),
    followUpMode: field(enumSchema(['one-at-a-time', 'all'])),
    providerConnectTimeoutMs: field({ ...delaySchema, minimum: 1 }),
    providerHeadersTimeoutMs: field({ ...delaySchema, minimum: 1 }),
    providerBodyTimeoutMs: field({ ...delaySchema, minimum: 1 }),
  };
}

export const tuiFields = Object.fromEntries(Object.entries(tuiSchemas).map(([key, schema]) => [key, field(schema)]));
