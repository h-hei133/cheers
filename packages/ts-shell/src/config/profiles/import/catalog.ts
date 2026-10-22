import { Ajv } from 'ajv';
import { RUNTIME_PROVIDERS } from '../../runtimeConfig.js';
import { booleanSchema, enumSchema, listSchema, nameSchema, objectSchema, positiveSchema, textSchema } from '../../schema.js';
import { nonsecretUrl } from './config.js';

const number = { type: 'number', minimum: 0 };
const model = objectSchema({
  id: nameSchema, contextWindow: positiveSchema, inputLimit: positiveSchema, maxTokens: positiveSchema, reasoning: booleanSchema, vision: booleanSchema,
  serviceTiers: listSchema(nameSchema),
  cost: objectSchema({ promptPerMTok: number, completionPerMTok: number, cacheReadPerMTok: number, cacheWritePerMTok: number }, ['promptPerMTok', 'completionPerMTok']),
  promptCache: objectSchema({ short: positiveSchema, long: positiveSchema }),
  thinkingLevelMap: objectSchema(Object.fromEntries(['low', 'medium', 'high'].map(key => [key, { type: ['string', 'null'] }]))),
  compat: objectSchema({ systemRole: enumSchema(['system', 'developer']), maxTokensField: enumSchema(['max_tokens', 'max_completion_tokens']),
    reasoningEffort: booleanSchema, assistantAfterToolResult: booleanSchema, allowEmptySignature: booleanSchema, supportsTemperature: booleanSchema }),
}, ['id']);
const provider = objectSchema({ label: textSchema, runtime: enumSchema(RUNTIME_PROVIDERS), auth: enumSchema(['api-key', 'oauth', 'none']),
  baseUrl: nameSchema, endpoint: nameSchema, envVar: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, models: listSchema(model) });
const validate = new Ajv({ strict: true, removeAdditional: true }).compile(objectSchema({
  providers: { type: 'object', propertyNames: { type: 'string', pattern: '^[A-Za-z0-9_.-]{1,128}$' }, additionalProperties: provider },
}, ['providers']));

/** Copy declared catalog data only; arbitrary nested credential containers are discarded. */
export function importCatalog(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Imported catalog requires valid JSON.'); }
  if (!validate(value)) throw new Error('Imported catalog contains invalid declared data.');
  const providers = (value as { providers: Record<string, { baseUrl?: string; models?: { id: string }[] }> }).providers;
  for (const patch of Object.values(providers)) {
    if (patch.baseUrl !== undefined) nonsecretUrl(patch.baseUrl);
    if (patch.models && new Set(patch.models.map(item => item.id)).size !== patch.models.length) throw new Error('Imported model identities are ambiguous.');
  }
  return JSON.stringify(value, null, 2) + '\n';
}
