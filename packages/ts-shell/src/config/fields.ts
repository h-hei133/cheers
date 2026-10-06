import { Ajv, type AnySchemaObject, type ValidateFunction } from 'ajv';
import { booleanSchema, connectionSchema, countSchema, credentialSchema, delaySchema, enumSchema, listSchema, nameSchema, objectSchema, positiveSchema, textSchema, tuiSchemas } from './schema.js';

export type ConfigSource = 'project' | 'user' | 'environment' | 'override';
export type MergePolicy = 'replace' | 'intersect' | 'union' | 'deny' | 'disable' | 'tui';
export type ConfigApplication = 'next operation' | 'immediate' | 'restart' | 'metadata';
export interface ConfigField {
  readonly schema: AnySchemaObject;
  readonly validate: ValidateFunction;
  readonly sources: readonly ConfigSource[];
  readonly merge: MergePolicy;
  readonly security: boolean;
  readonly application: ConfigApplication;
  readonly sensitivity: 'public' | 'personal';
  readonly projectTrust: 'safe' | 'required' | readonly (string | number | boolean)[];
}
export type ConfigFields = Readonly<Record<string, ConfigField>>;
const ajv = new Ajv({ allErrors: false, strict: true });
ajv.addKeyword({ keyword: 'environment', schemaType: 'boolean', valid: true });

function field(schema: AnySchemaObject, sources: readonly ConfigSource[] = ['project', 'user'], merge: MergePolicy = 'replace', security = false, metadata: Partial<Pick<ConfigField, 'application' | 'sensitivity' | 'projectTrust'>> = {}): ConfigField {
  return { schema, validate: ajv.compile(schema), sources, merge, security,
    application: metadata.application ?? 'next operation', sensitivity: metadata.sensitivity ?? 'public', projectTrust: metadata.projectTrust ?? 'required' };
}

/** Every accepted input has one schema and source/merge policy, including CLI-only input. */
export function createConfigFields(providers: readonly string[]) {
  const personal: ConfigSource[] = ['user'];
  const withOverride: ConfigSource[] = ['project', 'user', 'override'];
  const safe = { projectTrust: 'safe' } as const;
  return {
    schemaVersion: field({ const: 1 }, undefined, 'replace', false, { ...safe, application: 'metadata' }),
    provider: field(enumSchema(providers), personal, 'replace', false, { sensitivity: 'personal' }),
    providerCredentials: field(objectSchema(Object.fromEntries(providers.map(provider => [provider, credentialSchema]))), personal, 'replace', false, { sensitivity: 'personal' }),
    providerConnections: field(listSchema(connectionSchema(providers)), personal, 'replace', false, { sensitivity: 'personal' }),
    activeProviderConnectionId: field(textSchema, personal, 'replace', false, { sensitivity: 'personal' }),
    maxTurns: field(positiveSchema, ['project', 'user', 'environment']),
    allowedTools: field(listSchema(nameSchema), withOverride, 'intersect', true, safe),
    disabledTools: field(listSchema(nameSchema), undefined, 'union', true, safe),
    hiddenToolPrefixes: field(listSchema(nameSchema), undefined, 'union', true, safe),
    denyRules: field(listSchema(objectSchema({ tool: nameSchema, pattern: textSchema }, ['tool'])), undefined, 'deny', true, safe),
    enableMcpTools: field(booleanSchema, undefined, 'disable', true, safe),
    temperature: field({ type: 'number' }),
    topP: field({ type: 'number', minimum: 0, maximum: 1 }),
    maxOutputTokens: field(positiveSchema),
    contextWindow: field(positiveSchema),
    reserveTokens: field(countSchema),
    modelTokenBudgets: field({ type: 'object', propertyNames: nameSchema, additionalProperties: objectSchema({ reserveTokens: countSchema, keepRecentTokens: countSchema }) }),
    instructionBudgetBytes: field(countSchema, withOverride, 'replace', false, { projectTrust: [0] }),
    offline: field(booleanSchema, withOverride, 'replace', false, { projectTrust: [true] }),
    attentionOnIdle: field(booleanSchema, withOverride, 'replace', false, safe),
    allowUntrustedHooks: field(booleanSchema, ['override'], 'replace', true),
    // Idle warming can spend money without a new prompt; only a personal choice enables it.
    cacheWarming: field(enumSchema(['off', 'streaming', 'idle']), personal),
    agentMode: field(enumSchema(['plan', 'build']), undefined, 'replace', false, { projectTrust: ['plan'] }),
    theme: field(nameSchema, withOverride, 'replace', false, { application: 'immediate' }),
    tuiMode: field(enumSchema(['regular', 'fullscreen']), undefined, 'replace', false, { ...safe, application: 'restart' }),
    tui: field(objectSchema(tuiSchemas), undefined, 'tui', false, { ...safe, application: 'restart' }),
    retryEnabled: field(booleanSchema, undefined, 'replace', false, { projectTrust: [false] }),
    retryMaxRetries: field(countSchema, undefined, 'replace', false, { projectTrust: [0] }),
    providerRetryMaxRetries: field(countSchema, undefined, 'replace', false, { projectTrust: [0] }),
    retryBaseDelayMs: field(delaySchema),
    retryMaxDelayMs: field(delaySchema),
    steeringMode: field(enumSchema(['one-at-a-time', 'all'])),
    followUpMode: field(enumSchema(['one-at-a-time', 'all'])),
    providerConnectTimeoutMs: field({ ...delaySchema, minimum: 1 }),
    providerHeadersTimeoutMs: field({ ...delaySchema, minimum: 1 }),
    providerBodyTimeoutMs: field({ ...delaySchema, minimum: 1 }),
  };
}

export const tuiFields = Object.fromEntries(Object.entries(tuiSchemas).map(([key, schema]) => [key, field(schema, undefined, 'replace', false, { projectTrust: 'safe' })]));
