import { types } from 'node:util'
import type { ToolDefinition } from '../../../tools/types.js'
import type { sessionModelCatalog } from '../../catalog/models.js'
import { THINKING_LEVELS } from '../../models/effort.js'
import { snapshotData, type JsonValue } from '../../values/data.js'

export type CodemodeModel = Readonly<Record<string, JsonValue>> & {
  readonly provider: string
  readonly id: string
}

/** Only the host's admitted media tools can serve the script model helpers. */
export const MODEL_DISPATCH_TOOL = Symbol('modelDispatchTool')
export type ModelDispatchTool = ToolDefinition & { readonly [MODEL_DISPATCH_TOOL]: true }

export function isModelDispatchTool(tool: ToolDefinition | undefined): tool is ModelDispatchTool {
  return tool !== undefined && Object.getOwnPropertyDescriptor(tool, MODEL_DISPATCH_TOOL)?.value === true
}

type FieldRule = 'string' | 'number' | 'boolean' | 'strings' | 'stringOrFalse' | 'stringOrNull'
type PublicFields = { readonly [field: string]: FieldRule | PublicFields }
// Remote catalogues ship thousands of provider/model entries (~260k nodes, ~4 MiB JSON).
// Keep structural headroom above full synced catalogues while still bounding adversarial inputs.
const METADATA_LIMITS = { bytes: 16 * 1024 * 1024, nodes: 1_000_000, depth: 16 }

const MODEL_FIELDS: PublicFields = {
  id: 'string', modelType: 'string', tokenizer: 'stringOrFalse', contextWindow: 'number', inputLimit: 'number',
  cost: { promptPerMTok: 'number', completionPerMTok: 'number', cacheReadPerMTok: 'number', cacheWritePerMTok: 'number' },
  reasoning: 'boolean', toolCalling: 'boolean',
  thinkingLevelMap: Object.fromEntries(THINKING_LEVELS.map(level => [level, 'stringOrNull'])) as PublicFields,
  maxTokens: 'number',
  compat: { endpoint: 'string', systemRole: 'string', maxTokensField: 'string', reasoningEffort: 'boolean',
    reasoningSummary: 'boolean', reasoningReplayField: 'stringOrFalse', assistantAfterToolResult: 'boolean',
    allowEmptySignature: 'boolean', supportsTemperature: 'boolean', promptCacheKey: 'boolean',
    supportsMidConvoSystemMessages: 'boolean', supportsMidConvoToolChanges: 'boolean', supportsMidConvoEffort: 'boolean' },
  promptCache: { short: 'number', long: 'number' },
  vision: 'boolean', input: 'strings', output: 'strings',
  inputLimits: { maxRequestBytes: 'number', images: { maxPerMessage: 'number', maxPerRequest: 'number',
    resize: { maxWidth: 'number', maxHeight: 'number', maxBytes: 'number', jpegQuality: 'number' } } },
  serviceTiers: 'strings',
}

const VIRTUAL_FIELDS: PublicFields = {
  provider: 'string', id: 'string', name: 'string', thinkingLevels: 'strings', contextWindow: 'number', maxTokens: 'number',
}

function dataSlot(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object' || Array.isArray(source) || types.isProxy(source)) {
    throw new Error('Model metadata requires inert records.')
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, key)
  if (descriptor && !('value' in descriptor)) throw new Error('Model metadata cannot contain accessors.')
  return descriptor?.value
}

function arrayValues(source: unknown, budget: { nodes: number }): unknown[] {
  if (!Array.isArray(source) || types.isProxy(source)) throw new Error('Model metadata requires inert arrays.')
  if (source.length > budget.nodes || Reflect.ownKeys(source).length !== source.length + 1) {
    throw new Error('Model metadata exceeds its structural limit.')
  }
  budget.nodes -= source.length
  const values: unknown[] = []
  for (let index = 0; index < source.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(source, index)
    if (!descriptor || !('value' in descriptor)) throw new Error('Model metadata arrays require data slots.')
    values.push(descriptor.value)
  }
  return values
}

function publicFields(source: unknown, fields: PublicFields, budget: { nodes: number }): Record<string, unknown> {
  const captured: Record<string, unknown> = Object.create(null)
  for (const [key, rule] of Object.entries(fields)) {
    const value = dataSlot(source, key)
    if (value === undefined) continue
    if (--budget.nodes < 0) throw new Error('Model metadata exceeds its structural limit.')
    if (typeof rule === 'object') {
      captured[key] = publicFields(value, rule, budget)
      continue
    }
    if (rule === 'strings') {
      const values = arrayValues(value, budget)
      if (values.some(item => typeof item !== 'string')) throw new Error('Model metadata arrays require text values.')
      captured[key] = values
      continue
    }
    const valid = rule === 'stringOrFalse' ? typeof value === 'string' || value === false
      : rule === 'stringOrNull' ? typeof value === 'string' || value === null : typeof value === rule
    if (!valid) throw new Error('Model metadata contains an invalid public field.')
    captured[key] = value
  }
  return captured
}

/** Publish only captured, callback-free catalogue data; absent native metadata stays absent. */
export function projectCodemodeModels(catalog?: ReturnType<typeof sessionModelCatalog>): readonly CodemodeModel[] {
  if (!catalog) return Object.freeze([])
  const budget = { nodes: METADATA_LIMITS.nodes }
  const records: Record<string, unknown>[] = []
  for (const provider of arrayValues(dataSlot(catalog, 'physical'), budget)) {
    const identity = dataSlot(provider, 'id')
    if (typeof identity !== 'string' || !identity) throw new Error('Model metadata requires a provider identity.')
    for (const model of arrayValues(dataSlot(provider, 'models'), budget)) {
      const record = publicFields(model, MODEL_FIELDS, budget)
      if (typeof record.id !== 'string' || !record.id) throw new Error('Model metadata requires a model identity.')
      record.provider = identity
      records.push(record)
    }
  }
  for (const model of arrayValues(dataSlot(catalog, 'virtual'), budget)) {
    const record = publicFields(model, VIRTUAL_FIELDS, budget)
    if (typeof record.provider !== 'string' || !record.provider || typeof record.id !== 'string' || !record.id) {
      throw new Error('Model metadata requires a virtual identity.')
    }
    records.push(record)
  }
  return snapshotData(records, METADATA_LIMITS) as readonly CodemodeModel[]
}
