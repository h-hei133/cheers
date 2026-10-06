import type { AnySchemaObject } from 'ajv';
import type { ConfigSource } from '../fields.js';

export type OriginSource = ConfigSource | 'default' | 'derived' | 'session' | 'runtime' | 'safety';
export interface ConfigOrigin {
  readonly sources: readonly OriginSource[];
  readonly shadowed: readonly OriginSource[];
  readonly rejected: readonly { readonly source: ConfigSource; readonly reason: string }[];
  readonly children?: Readonly<Record<string, ConfigOrigin>>;
  readonly normalized?: boolean;
  readonly environmentReference?: boolean;
}
export type ConfigProvenance = Readonly<Record<string, ConfigOrigin>>;

export function origin(source: OriginSource): ConfigOrigin {
  return { sources: [source], shadowed: [], rejected: [] };
}

/** Arbitrary map keys and list contents never become diagnostic path segments. */
export function schemaChildren(value: unknown, schema: AnySchemaObject): { key: string; value: unknown; schema: AnySchemaObject }[] {
  if (Array.isArray(value)) return value.map((child, index) => ({ key: String(index), value: child, schema: schema.items }));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child], index) => {
    const known = schema.properties && Object.hasOwn(schema.properties, key);
    const childSchema = known ? schema.properties[key] : schema.additionalProperties;
    return childSchema && typeof childSchema === 'object'
      ? [{ key: known ? key : String(index), value: child, schema: childSchema }] : [];
  });
}

/** A value-free tree with only schema-owned names and positional map/list entries. */
export function traceValue(value: unknown, schema: AnySchemaObject, source: OriginSource): ConfigOrigin {
  const children = schemaChildren(value, schema);
  return { ...origin(source), ...(children.length ? { children: Object.fromEntries(children.map(child =>
    [child.key, traceValue(child.value, child.schema, source)])) } : {}),
    ...(source === 'user' && schema.environment === true && typeof value === 'string' &&
      /\$\{[A-Za-z0-9_]+\}|\$[A-Za-z0-9_]+/.test(value.replace(/\$\$/g, '')) ? { environmentReference: true } : {}),
  };
}

export function sourcesOf(nodes: readonly ConfigOrigin[]): OriginSource[] {
  return [...new Set(nodes.flatMap(node => node.sources))];
}

export function replaceOrigin(previous: ConfigOrigin | undefined, next: ConfigOrigin): ConfigOrigin {
  if (!previous) return next;
  return { ...next, shadowed: [...new Set([...previous.shadowed, ...previous.sources, ...next.shadowed])],
    rejected: [...previous.rejected, ...next.rejected] };
}

export function rejectOrigin(previous: ConfigOrigin | undefined, source: ConfigSource, reason: string): ConfigOrigin {
  const current = previous ?? origin('default');
  return { ...current, rejected: [...current.rejected, { source, reason }] };
}
