import type { JsonError, JsonSchemaValidatorParams, Keyword, SchemaNode } from 'json-schema-library';

function hasValue(data: unknown, name: string): data is Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    && Object.hasOwn(data, name) && (data as Record<string, unknown>)[name] !== undefined;
}

function validateDependencies(
  options: JsonSchemaValidatorParams, required: Record<string, string[]> | undefined,
  schemas: Record<string, SchemaNode | boolean> | undefined,
): JsonError[] {
  const { node, data, pointer, path } = options;
  const errors: JsonError[] = [];
  for (const [name, values] of Object.entries(required ?? {})) {
    if (hasValue(data, name) && values.some(value => !hasValue(data, value))) {
      errors.push(node.createError('missing-dependency-error', { pointer, schema: node.schema, value: undefined }, 'Dependency constraint failed.'));
    }
  }
  for (const [name, child] of Object.entries(schemas ?? {})) {
    if (!hasValue(data, name) || child === true) continue;
    if (child === false) errors.push(node.createError('missing-dependency-error', { pointer, schema: node.schema, value: undefined }, 'Dependency constraint failed.'));
    else {
      const result = child.validate(data, pointer, [...path]);
      if (result.errorsAsync.length) throw new Error('Asynchronous validation is unsupported.');
      errors.push(...result.errors);
    }
  }
  return errors;
}

function reached<T>(entries: Record<string, T> | undefined, data: unknown): Record<string, T> | undefined {
  if (!entries) return;
  return Object.fromEntries(Object.entries(entries).filter(([name]) => hasValue(data, name)));
}

function reductionData(data: unknown, names: readonly string[]): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return data;
  const descriptors = Object.getOwnPropertyDescriptors(data);
  let copied = false;
  for (const name of names) {
    if (hasValue(data, name) && descriptors[name]?.enumerable === false) {
      descriptors[name] = { ...descriptors[name], enumerable: true };
      copied = true;
    }
  }
  return copied ? Object.defineProperties(Object.create(null), descriptors) : data;
}

/** Keep each authored dependency map distinct, with defined own-property triggers. */
export function dependencyPolicy(keyword: Keyword): Keyword | undefined {
  if (!['dependencies', 'dependentRequired', 'dependentSchemas'].includes(keyword.keyword) || !keyword.parse) return;
  const parse = keyword.parse, reduce = keyword.reduce;
  return { ...keyword, validate: undefined, reduce: undefined,
    parse: node => {
      // The dependency parser remaps legacy maps onto modern fields. Isolate
      // these fields so two adjacent keywords cannot overwrite one another.
      const parsed: SchemaNode = { ...node, dependentRequired: undefined, dependentSchemas: undefined };
      const errors = parse(parsed);
      node.validators.push(options => validateDependencies(options, parsed.dependentRequired, parsed.dependentSchemas));
      if (reduce) node.reducers.push(options => {
        const required = reached(parsed.dependentRequired, options.data), schemas = reached(parsed.dependentSchemas, options.data);
        if (!Object.keys(required ?? {}).length && !Object.keys(schemas ?? {}).length) return options.node;
        return reduce({ ...options, node: { ...options.node, dependentRequired: required, dependentSchemas: schemas },
          data: reductionData(options.data, [...Object.keys(required ?? {}), ...Object.keys(schemas ?? {})]) });
      });
      return errors;
    } };
}
