import type { ToolDefinition } from '../../../tools/types.js'

const MAX_REF_EXPANSIONS = 32
const DEFAULT_SCHEMA_MAX_CHARS = 16_000
const IDENTIFIER_FALLBACK = 'tool'
const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'await', 'yield',
])

export function toCodemodeIdentifier(name: string): string {
  let clean = name.replace(/[^a-zA-Z0-9_$]/g, '_')
  if (!clean || /^[0-9]/.test(clean)) clean = `_${clean}`
  if (JS_KEYWORDS.has(clean)) clean = `${clean}_`
  return clean || IDENTIFIER_FALLBACK
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(root: Record<string, unknown>, ref: string): Record<string, unknown> | boolean | undefined {
  if (ref === '#') return root
  if (!ref.startsWith('#/')) return undefined
  let cursor: unknown = root
  for (const segment of ref.slice(2).split('/')) {
    let key: string
    try {
      key = decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~')
    } catch {
      return undefined
    }
    if (!isObject(cursor) || !(key in cursor)) return undefined
    cursor = cursor[key]
  }
  return isObject(cursor) || typeof cursor === 'boolean' ? cursor : undefined
}

function collectConstraintTags(schema: Record<string, unknown>): string[] {
  const tags: string[] = []
  if (schema.type === 'integer') tags.push('@integer')
  for (const key of ['minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems'] as const) {
    if (schema[key] !== undefined) tags.push(`@${key} ${JSON.stringify(schema[key])}`)
  }
  if (schema.uniqueItems === true) tags.push('@uniqueItems')
  if (schema.default !== undefined) tags.push(`@default ${JSON.stringify(schema.default)}`)
  if (schema.deprecated === true) tags.push('@deprecated')
  return tags.map(tag => tag.replace(/[\r\n\u2028\u2029]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`))
}

function renderObjectType(
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
  ctx: { readonly includeTags: boolean; refs: number; readonly active: Set<string> },
  indent: string,
): string {
  const props = isObject(schema.properties) ? schema.properties : undefined
  const required = Array.isArray(schema.required) ? new Set(schema.required.map(String)) : new Set<string>()
  const lines: string[] = []
  if (props) {
    for (const key of Object.keys(props).sort()) {
      const propSchema = props[key]
      const propType = toType(propSchema, root, ctx, `${indent}  `)
      const optional = required.has(key) ? '' : '?'
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
      const tags = ctx.includeTags && isObject(propSchema) ? collectConstraintTags(propSchema) : []
      const comment = tags.length ? ` // ${tags.join(' ')}` : ''
      lines.push(`${indent}  ${safeKey}${optional}: ${propType};${comment}`)
    }
  }
  if (schema.additionalProperties === true || isObject(schema.additionalProperties)) {
    const extraType = schema.additionalProperties === true ? 'unknown' : toType(schema.additionalProperties, root, ctx, `${indent}  `)
    lines.push(`${indent}  [key: string]: ${extraType};`)
  }
  if (lines.length === 0) {
    return props || schema.additionalProperties === false ? '{}' : 'Record<string, unknown>'
  }
  return `{\n${lines.join('\n')}\n${indent}}`
}

function renderArrayType(
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
  ctx: { readonly includeTags: boolean; refs: number; readonly active: Set<string> },
  indent: string,
): string {
  const modernTuple = Array.isArray(schema.prefixItems)
  const tuple = modernTuple ? schema.prefixItems as unknown[] : Array.isArray(schema.items) ? schema.items : undefined
  if (!tuple) return `Array<${schema.items === undefined ? 'unknown' : toType(schema.items, root, ctx, indent)}>`
  const minimum = typeof schema.minItems === 'number' && Number.isInteger(schema.minItems) && schema.minItems >= 0
    ? schema.minItems : 0
  const maximum = typeof schema.maxItems === 'number' && Number.isInteger(schema.maxItems) && schema.maxItems >= 0
    ? schema.maxItems : undefined
  const remainder = modernTuple ? schema.items : schema.additionalItems
  if ((maximum !== undefined && minimum > maximum) || (remainder === false && minimum > tuple.length)) return 'never'
  const prefix = maximum === undefined ? tuple : tuple.slice(0, maximum)
  const members = prefix.map((item, index) => {
    const type = toType(item, root, ctx, indent)
    return index < minimum ? type : `(${type})?`
  })
  if (remainder !== false && (maximum === undefined || maximum > tuple.length)) {
    members.push(`...Array<${remainder === undefined ? 'unknown' : toType(remainder, root, ctx, indent)}>`)
  }
  return `[${members.join(', ')}]`
}

function toType(
  raw: unknown,
  root: Record<string, unknown>,
  ctx: { readonly includeTags: boolean; refs: number; readonly active: Set<string> },
  indent = '',
): string {
  if (raw === false) return 'never'
  if (!isObject(raw)) return 'unknown'
  if (typeof raw.$ref === 'string') {
    if (ctx.active.has(raw.$ref) || ctx.refs >= MAX_REF_EXPANSIONS) return 'unknown'
    const resolved = resolveRef(root, raw.$ref)
    if (resolved === undefined) return 'unknown'
    ctx.refs += 1
    ctx.active.add(raw.$ref)
    try {
      return toType(resolved, root, ctx, indent)
    } finally {
      ctx.active.delete(raw.$ref)
    }
  }
  if ('const' in raw) return JSON.stringify(raw.const) ?? 'unknown'
  if (Array.isArray(raw.enum)) return raw.enum.map(item => JSON.stringify(item) ?? 'unknown').join(' | ') || 'never'
  if (Array.isArray(raw.anyOf)) return raw.anyOf.map(item => toType(item, root, ctx, indent)).join(' | ') || 'unknown'
  if (Array.isArray(raw.oneOf)) return raw.oneOf.map(item => toType(item, root, ctx, indent)).join(' | ') || 'unknown'
  // Intersection binds more tightly than union in TypeScript. Preserve each
  // schema member as a whole, including unions reached through local refs.
  if (Array.isArray(raw.allOf)) return raw.allOf.map(item => `(${toType(item, root, ctx, indent)})`).join(' & ') || 'unknown'
  if (Array.isArray(raw.type)) {
    return raw.type.map(kind => toType({ ...raw, type: kind }, root, ctx, indent)).join(' | ') || 'unknown'
  }
  if (raw.type === 'string') return 'string'
  if (raw.type === 'number' || raw.type === 'integer') return 'number'
  if (raw.type === 'boolean') return 'boolean'
  if (raw.type === 'null') return 'null'
  if (raw.type === 'array') return renderArrayType(raw, root, ctx, indent)
  if (raw.type === 'object' || isObject(raw.properties) || raw.additionalProperties !== undefined) {
    return renderObjectType(raw, root, ctx, indent)
  }
  return 'unknown'
}

export function schemaToType(schema: unknown, opts?: { readonly maxChars?: number }): string {
  const maxChars = opts?.maxChars ?? DEFAULT_SCHEMA_MAX_CHARS
  if (schema === false) return 'never'
  if (!isObject(schema)) return 'unknown'
  const withTags = toType(schema, schema, { includeTags: true, refs: 0, active: new Set() })
  if (withTags.length <= maxChars) return withTags
  const plain = toType(schema, schema, { includeTags: false, refs: 0, active: new Set() })
  return plain.length <= maxChars ? plain : 'unknown'
}

export function renderToolSample(tool: ToolDefinition, expression = `tools.${toCodemodeIdentifier(tool.name)}`): string {
  const inputType = schemaToType(tool.argsSchema)
  const summary = tool.description.trim()
  // Every nested tool shares the same text-or-media result contract.
  const outputType = 'string | { readonly output: string; readonly images: readonly { readonly type: "image"; readonly data: string; readonly mimeType: string }[] }'
  return [summary, `${expression}(args: ${inputType}): Promise<${outputType}>;`].filter(Boolean).join('\n\n')
}

export function toolNamespace(name: string): string {
  if (name.startsWith('mcp__')) {
    const separator = name.indexOf('__', 'mcp__'.length)
    if (separator > 'mcp__'.length) return name.slice(0, separator)
  }
  if (name.startsWith('ext_')) {
    const parts = name.split('_')
    return parts.length >= 3 ? `${parts[0]}_${parts[1]}` : 'extensions'
  }
  const colon = name.indexOf(':')
  if (colon > 0) return name.slice(0, colon)
  const under = name.indexOf('_')
  return under > 0 ? name.slice(0, under) : 'core'
}
