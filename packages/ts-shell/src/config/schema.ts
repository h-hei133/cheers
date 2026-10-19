import type { AnySchemaObject } from 'ajv';
import { COMPOSER_SHAPES } from '../presentation/tui/composer/shapes.js';

export const textSchema: AnySchemaObject = { type: 'string' };
export const nameSchema: AnySchemaObject = { type: 'string', pattern: '\\S' };
export const booleanSchema: AnySchemaObject = { type: 'boolean' };
export const countSchema: AnySchemaObject = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const positiveSchema: AnySchemaObject = { ...countSchema, minimum: 1 };
// Node timers overflow above this value and schedule a near-immediate callback.
export const delaySchema: AnySchemaObject = { ...countSchema, maximum: 2_147_483_647 };
const referenceSchema: AnySchemaObject = { ...textSchema, environment: true };

export function objectSchema(properties: Record<string, AnySchemaObject>, required: string[] = []): AnySchemaObject {
  return { type: 'object', properties, required, additionalProperties: false };
}

export function listSchema(items: AnySchemaObject): AnySchemaObject {
  return { type: 'array', items };
}

export function enumSchema(values: readonly string[]): AnySchemaObject {
  return { type: 'string', enum: [...values] };
}

const authFields = {
  accessToken: referenceSchema, refreshToken: referenceSchema, expiresAt: positiveSchema,
};
const authRequired = ['type', 'accessToken', 'refreshToken', 'expiresAt'];
const accountAuth = objectSchema({
  openai: objectSchema({ ...authFields, type: { const: 'openai-chatgpt-account' }, accountId: referenceSchema, loginId: nameSchema }, authRequired),
  google: objectSchema({ ...authFields, type: { const: 'google-gemini-account' }, clientId: referenceSchema, accountEmail: referenceSchema }, [...authRequired, 'clientId']),
  subscription: objectSchema({ ...authFields, type: { const: 'subscription' }, baseUrl: referenceSchema }, authRequired),
});

export const credentialSchema = objectSchema({
  apiKey: referenceSchema, baseUrl: referenceSchema, model: referenceSchema, serviceTier: nameSchema, accountAuth,
  thinkingEffort: { enum: ['low', 'medium', 'high', null] },
});

export function connectionSchema(providers: readonly string[]): AnySchemaObject {
  return objectSchema({
    ...credentialSchema.properties,
    id: nameSchema, provider: enumSchema(providers), label: textSchema,
    // Missing authType/timestamps and browser-oauth are existing file formats.
    authType: enumSchema(['api-key', 'account-auth', 'browser-assisted-capture', 'browser-oauth']),
    status: enumSchema(['connected', 'pending', 'error']),
    createdAt: textSchema, updatedAt: textSchema,
  }, ['id', 'provider']);
}

export const tuiSchemas = {
  composerShape: enumSchema(Object.keys(COMPOSER_SHAPES)),
  statusItems: listSchema(textSchema),
  diagrams: enumSchema(['off', 'streaming']),
};
