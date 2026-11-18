import { isSchema } from './capture.js';
import { invalidSchema, type CompileOptions, type Dialect, type Schema } from './contract.js';
import { dialectOf, validateGrammar } from './dialects.js';
import { knownFormat } from './formats.js';
import { admitApplicability } from './applicability.js';

const commonKeywords = new Set([
  '$schema', '$id', '$defs', '$vocabulary', '$comment', 'definitions', 'id', '$ref',
  'maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'multipleOf',
  'maxLength', 'minLength', 'pattern', 'maxProperties', 'minProperties', 'required',
  'maxItems', 'minItems', 'uniqueItems', 'type', 'nullable', 'const', 'enum',
  'not', 'anyOf', 'oneOf', 'allOf', 'if', 'then', 'else', 'propertyNames',
  'additionalProperties', 'dependencies', 'properties', 'patternProperties',
  'items', 'contains', 'format', 'title', 'description', 'default', 'deprecated',
  'readOnly', 'writeOnly', 'examples', 'contentMediaType', 'contentEncoding', 'contentSchema',
]);

const modernKeywords = new Set([
  '$anchor', '$dynamicAnchor', '$dynamicRef', '$recursiveAnchor', '$recursiveRef',
  'dependentRequired', 'dependentSchemas', 'maxContains', 'minContains',
  'unevaluatedProperties', 'unevaluatedItems',
]);

const singleSchemas = ['not', 'if', 'then', 'else', 'propertyNames', 'additionalProperties',
  'additionalItems', 'contains', 'unevaluatedProperties', 'unevaluatedItems', 'contentSchema'];
const schemaMaps = ['$defs', 'definitions', 'properties', 'patternProperties', 'dependentSchemas'];
const schemaArrays = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];

export interface SchemaEntry {
  readonly schema: Schema;
  readonly dialect: Dialect;
  readonly pointer: string;
  readonly parent?: SchemaEntry;
}

export function schemaPointer(parent: string, key: string | number): string {
  return parent + '/' + String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

function admitKeywords(schema: Record<string, unknown>, dialect: Dialect, options: CompileOptions): void {
  for (const key of Object.keys(schema)) {
    if (options.allowExtensionAnnotations && key.startsWith('x-')) {
      // Remove wire annotations from the private compiler copy before binding references.
      delete schema[key];
      continue;
    }
    if (options.annotations?.includes(key)) continue;
    const supported = commonKeywords.has(key)
      || dialect !== 'draft-07' && modernKeywords.has(key)
      || dialect === 'draft-2020-12' && key === 'prefixItems'
      || dialect !== 'draft-2020-12' && key === 'additionalItems';
    if (!supported) invalidSchema();
  }
  if (Object.hasOwn(schema, '$async') || Object.hasOwn(schema, 'id')) invalidSchema();
  if (Object.hasOwn(schema, 'format') && options.formats !== false && !knownFormat(schema.format)) invalidSchema();
  if (Object.hasOwn(schema, 'environment') && options.annotations?.includes('environment') && typeof schema.environment !== 'boolean') invalidSchema();
  if (Object.hasOwn(schema, '$dynamicRef') && dialect !== 'draft-2020-12'
    || Object.hasOwn(schema, '$dynamicAnchor') && dialect !== 'draft-2020-12'
    || Object.hasOwn(schema, '$recursiveRef') && dialect !== 'draft-2019-09'
    || Object.hasOwn(schema, '$recursiveAnchor') && dialect !== 'draft-2019-09') invalidSchema();
  if (Object.hasOwn(schema, '$vocabulary')) {
    const vocabulary = schema.$vocabulary;
    if (!vocabulary || typeof vocabulary !== 'object' || Array.isArray(vocabulary)) invalidSchema();
    // Custom required vocabularies cannot silently become annotations.
    for (const [id, required] of Object.entries(vocabulary as Record<string, unknown>)) {
      if (typeof required !== 'boolean' || required && !/^https:\/\/json-schema\.org\/draft\/(?:2019-09|2020-12)\/vocab\/(?:core|applicator|validation|meta-data|format|format-annotation|format-assertion|content|unevaluated)$/.test(id)) invalidSchema();
    }
  }
  if (Object.hasOwn(schema, 'nullable')) {
    if (typeof schema.nullable !== 'boolean' || !Object.hasOwn(schema, 'type')) invalidSchema();
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.nullable === false && types.includes('null')) invalidSchema();
  }
  if (typeof schema.pattern === 'string') {
    try { new RegExp(schema.pattern, 'u'); } catch { invalidSchema(); }
  }
}

function descendants(entry: SchemaEntry): { schema: unknown; pointer: string }[] {
  if (typeof entry.schema === 'boolean') return [];
  const schema = entry.schema;
  const result: { schema: unknown; pointer: string }[] = [];
  for (const key of singleSchemas) {
    if (Object.hasOwn(schema, key)) result.push({ schema: schema[key], pointer: schemaPointer(entry.pointer, key) });
  }
  for (const key of schemaMaps) {
    if (!Object.hasOwn(schema, key)) continue;
    const map = schema[key];
    if (!map || typeof map !== 'object' || Array.isArray(map)) invalidSchema();
    for (const [name, child] of Object.entries(map)) result.push({ schema: child, pointer: schemaPointer(schemaPointer(entry.pointer, key), name) });
  }
  for (const key of schemaArrays) {
    if (!Object.hasOwn(schema, key)) continue;
    const array = schema[key];
    if (!Array.isArray(array)) invalidSchema();
    for (let index = 0; index < array.length; index++) result.push({ schema: array[index], pointer: schemaPointer(schemaPointer(entry.pointer, key), index) });
  }
  if (Object.hasOwn(schema, 'items')) {
    const items = schema.items;
    if (Array.isArray(items)) {
      for (let index = 0; index < items.length; index++) result.push({ schema: items[index], pointer: schemaPointer(schemaPointer(entry.pointer, 'items'), index) });
    } else result.push({ schema: items, pointer: schemaPointer(entry.pointer, 'items') });
  }
  if (Object.hasOwn(schema, 'dependencies')) {
    const dependencies = schema.dependencies;
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) invalidSchema();
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (!Array.isArray(dependency)) result.push({ schema: dependency, pointer: schemaPointer(schemaPointer(entry.pointer, 'dependencies'), name) });
    }
  }
  return result;
}

/** Admit one reached schema position and its ordinary schema children. */
export function admitTarget(
  schema: unknown, pointer: string, parent: SchemaEntry | undefined, options: CompileOptions,
  entries: SchemaEntry[], positions: Map<string, SchemaEntry>,
): SchemaEntry {
  const previous = positions.get(pointer);
  if (previous) {
    if (previous.schema !== schema) return invalidSchema();
    return previous;
  }
  if (!isSchema(schema)) return invalidSchema();
  const dialect = dialectOf(schema, parent?.dialect);
  // The compiled context has one dialect. A nested switch must fail admission.
  if (parent && dialect !== parent.dialect) return invalidSchema();
  const entry: SchemaEntry = { schema, dialect, pointer, parent };
  positions.set(pointer, entry);
  entries.push(entry);
  if (typeof schema !== 'boolean') admitKeywords(schema, dialect, options);
  if (typeof schema !== 'boolean') admitApplicability(schema, dialect);
  // Checking each schema position catches grammar missed through extension aliases.
  validateGrammar(schema, dialect);
  for (const child of descendants(entry)) admitTarget(child.schema, child.pointer, entry, options, entries, positions);
  return entry;
}

export function admitSchema(root: Schema, options: CompileOptions): SchemaEntry[] {
  const entries: SchemaEntry[] = [];
  admitTarget(root, '', undefined, options, entries, new Map());
  return entries;
}

export function normalizeSchema(entries: readonly SchemaEntry[], options: CompileOptions): void {
  for (const { schema } of entries) {
    if (typeof schema === 'boolean') continue;
    for (const annotation of options.annotations ?? []) {
      // Owner metadata must not activate library extensions such as oneOfProperty.
      if (!commonKeywords.has(annotation) && !modernKeywords.has(annotation)
        && annotation !== 'prefixItems' && annotation !== 'additionalItems') delete schema[annotation];
    }
    if (schema.nullable !== true) continue;
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.includes('null')) schema.type = [...types, 'null'];
  }
}
