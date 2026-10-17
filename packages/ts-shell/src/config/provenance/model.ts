import type { AnySchemaObject } from 'ajv';
import type { ConfigSource } from '../fields.js';
import { contributeFiles, replaceFiles, rejectFile, type ConfigFileOrigin, type ConfigFileOrigins } from './files.js';

export type OriginSource = ConfigSource | 'default' | 'derived' | 'session' | 'runtime' | 'safety';
export interface ConfigOrigin extends ConfigFileOrigins {
  readonly sources: readonly OriginSource[];
  readonly shadowed: readonly OriginSource[];
  readonly rejected: readonly { readonly source: ConfigSource; readonly reason: string }[];
  readonly children?: Readonly<Record<string, ConfigOrigin>>;
  readonly normalized?: boolean;
  readonly environmentReference?: boolean;
}
export type ConfigProvenance = Readonly<Record<string, ConfigOrigin>>;

export function origin(source: OriginSource, file?: ConfigFileOrigin): ConfigOrigin {
  return { sources: [source], shadowed: [], rejected: [], ...(file ? { files: [file] } : {}) };
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
export function traceValue(value: unknown, schema: AnySchemaObject, source: OriginSource, file?: ConfigFileOrigin): ConfigOrigin {
  const children = schemaChildren(value, schema);
  return { ...origin(source, file), ...(children.length ? { children: Object.fromEntries(children.map(child =>
    [child.key, traceValue(child.value, child.schema, source, file)])) } : {}),
    ...(source === 'user' && schema.environment === true && typeof value === 'string' &&
      /\$\{[A-Za-z0-9_]+\}|\$[A-Za-z0-9_]+/.test(value.replace(/\$\$/g, '')) ? { environmentReference: true } : {}),
  };
}

export function sourcesOf(nodes: readonly ConfigOrigin[]): OriginSource[] {
  return [...new Set(nodes.flatMap(node => node.sources))];
}

/** Partial projections summarize their actual children, which may span file revisions. */
export function composeOrigin(previous: ConfigOrigin, children: Record<string, ConfigOrigin>): ConfigOrigin {
  const nodes = Object.values(children);
  return { ...previous, children, sources: nodes.length ? sourcesOf(nodes) : ['default'],
    files: undefined, ...contributeFiles({ ...previous, files: undefined }, ...nodes) };
}

export function replaceOrigin(previous: ConfigOrigin | undefined, next: ConfigOrigin): ConfigOrigin {
  if (!previous) return next;
  return { ...next, shadowed: [...new Set([...previous.shadowed, ...previous.sources, ...next.shadowed])],
    rejected: [...previous.rejected, ...next.rejected], ...replaceFiles(previous, next) };
}

export function rejectOrigin(previous: ConfigOrigin | undefined, source: ConfigSource, reason: string, file?: ConfigFileOrigin): ConfigOrigin {
  const current = previous ?? origin('default');
  return { ...current, rejected: [...current.rejected, { source, reason }], ...rejectFile(current, reason, file) };
}
