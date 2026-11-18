import { compileValidator } from '../../../core/validation/compiler.js';
import { RUNTIME_PROVIDERS } from '../../runtimeConfig.js';
import { booleanSchema, enumSchema, listSchema, nameSchema, objectSchema, positiveSchema, textSchema } from '../../schema.js';
import { nonsecretUrl } from './config.js';
import { THINKING_LEVELS } from '../../../core/models/effort.js';
import { captureCostSchedule, MAX_COST_TIERS } from '../../../core/models/pricing.js';

const number = { type: 'number', minimum: 0 };
const rateFields = { promptPerMTok: number, completionPerMTok: number, cacheReadPerMTok: number, cacheWritePerMTok: number };
const tiers = { ...listSchema(objectSchema({ inputTokensAbove: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
  ...rateFields }, ['inputTokensAbove'])), maxItems: MAX_COST_TIERS };
const modalityList = listSchema(enumSchema(['text', 'image']));
const imageResize = objectSchema({ maxWidth: positiveSchema, maxHeight: positiveSchema, maxBytes: positiveSchema, jpegQuality: { type: 'integer', minimum: 1, maximum: 100 } });
const inputLimits = objectSchema({ maxRequestBytes: positiveSchema, images: objectSchema({ resize: imageResize, maxPerMessage: positiveSchema, maxPerRequest: positiveSchema }) });
const model = objectSchema({
  id: nameSchema, modelType: enumSchema(['chat', 'image', 'classifier']), contextWindow: positiveSchema, inputLimit: positiveSchema, maxTokens: positiveSchema, reasoning: booleanSchema, vision: booleanSchema,
  input: modalityList, output: modalityList, inputLimits,
  serviceTiers: listSchema(nameSchema),
  tokenizer: { enum: ['cl100k_base', 'o200k_base', false] },
  cost: objectSchema({ ...rateFields, tiers }),
  promptCache: objectSchema({ short: positiveSchema, long: positiveSchema }),
  thinkingLevelMap: objectSchema(Object.fromEntries(THINKING_LEVELS.map(key => [key, { type: ['string', 'null'] }]))),
  compat: objectSchema({ endpoint: nameSchema, systemRole: enumSchema(['system', 'developer']), maxTokensField: enumSchema(['max_tokens', 'max_completion_tokens']),
    reasoningEffort: booleanSchema, reasoningSummary: booleanSchema, assistantAfterToolResult: booleanSchema, allowEmptySignature: booleanSchema, supportsTemperature: booleanSchema }),
}, ['id']);
const provider = objectSchema({ label: textSchema, runtime: enumSchema(RUNTIME_PROVIDERS), auth: enumSchema(['api-key', 'oauth', 'none']),
  baseUrl: nameSchema, endpoint: nameSchema, envVar: { type: 'string', pattern: '^[A-Za-z_][A-Za-z0-9_]*$' }, models: listSchema(model) });
const catalogSchema = objectSchema({
  providers: { type: 'object', propertyNames: { type: 'string', pattern: '^[A-Za-z0-9_.-]{1,128}$' }, additionalProperties: provider },
}, ['providers']);
const validate = compileValidator(catalogSchema, { formats: false });

/** Imported undeclared fields are removed by the import owner before validation. */
function declared(value: unknown, schema: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    const items = schema.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) return value;
    const itemSchema = items as Record<string, unknown>;
    return value.map(child => declared(child, itemSchema));
  }
  if (!value || typeof value !== 'object') return value;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const additional = schema.additionalProperties;
  const fallback = additional && typeof additional === 'object' ? additional as Record<string, unknown> : undefined;
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const next = properties && Object.hasOwn(properties, key) ? properties[key] : fallback;
    return next ? [[key, declared(child, next)]] : additional === false ? [] : [[key, child]];
  }));
}

/** Copy declared catalog data only; arbitrary nested credential containers are discarded. */
export function importCatalog(text: string): string {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error('Imported catalog requires valid JSON.'); }
  value = declared(value, catalogSchema);
  if (!validate(value)) throw new Error('Imported catalog contains invalid declared data.');
  const providers = (value as { providers: Record<string, { baseUrl?: string; models?: { id: string; cost?: unknown }[] }> }).providers;
  for (const patch of Object.values(providers)) {
    if (patch.baseUrl !== undefined) nonsecretUrl(patch.baseUrl);
    if (patch.models && new Set(patch.models.map(item => item.id)).size !== patch.models.length) throw new Error('Imported model identities are ambiguous.');
    for (const model of patch.models ?? []) if (model.cost !== undefined) captureCostSchedule(model.cost);
  }
  return JSON.stringify(value, null, 2) + '\n';
}
