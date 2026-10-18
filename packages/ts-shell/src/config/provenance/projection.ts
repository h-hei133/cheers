import type { AnySchemaObject } from 'ajv';
import type { ConfigFields } from '../fields.js';
import { sameValue } from '../values.js';
import { type ConfigOrigin, type ConfigProvenance, composeOrigin, origin, replaceOrigin, schemaChildren, traceValue } from './model.js';

function normalizedOrigin(before: unknown, after: unknown, schema: AnySchemaObject, trace: ConfigOrigin): ConfigOrigin {
  if (sameValue(before, after)) return trace;
  if (before === undefined || (typeof before === 'string' && !before.trim())) return replaceOrigin(trace, traceValue(after, schema, 'derived'));
  const beforeChildren = new Map(schemaChildren(before, schema).map(child => [child.key, child.value]));
  const children = Object.fromEntries(schemaChildren(after, schema).map(child => [child.key,
    normalizedOrigin(beforeChildren.get(child.key), child.value, child.schema, trace.children?.[child.key] ?? origin('derived'))]));
  return { ...trace, normalized: true, ...(Object.keys(children).length ? { children } : { children: undefined }) };
}

/** Project origins through domain normalization without retaining either input values or arbitrary keys. */
export function projectConfigOrigins(raw: Record<string, unknown>, effective: object, traces: ConfigProvenance, fields: ConfigFields): ConfigProvenance {
  const values = effective as Record<string, unknown>;
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const trace = traces[key];
    if (raw[key] === undefined) {
      const fallback = traceValue(values[key], field.schema, 'default');
      return [key, trace ? { ...fallback, rejected: trace.rejected, shadowed: trace.shadowed,
        ...(trace.rejectedFiles ? { rejectedFiles: trace.rejectedFiles } : {}), ...(trace.shadowedFiles ? { shadowedFiles: trace.shadowedFiles } : {}) } : fallback];
    }
    return [key, normalizedOrigin(raw[key], values[key], field.schema, trace ?? origin('derived'))];
  }));
}

/** Session model attribution names only fixed provider slots and numeric connection positions. */
export function sessionModelOrigins(provenance: ConfigProvenance, connectionIndex: number | undefined, provider: string, hasEffort = false, hasConnection = false): ConfigProvenance {
  const result = { ...provenance };
  if (hasConnection) {
    result.provider = replaceOrigin(result.provider, origin('session'));
    result.activeProviderConnectionId = replaceOrigin(result.activeProviderConnectionId, origin('session'));
  }
  for (const [key, childKey] of [...(connectionIndex !== undefined ? [['providerConnections', String(connectionIndex)]] : []), ['providerCredentials', provider]]) {
    const parent = result[key] ?? origin('default'); const child = parent.children?.[childKey] ?? origin('default');
    const model = replaceOrigin(child.children?.model, origin('session'));
    const children = { ...child.children, model, ...(hasEffort ? { thinkingEffort: replaceOrigin(child.children?.thinkingEffort, origin('session')) } : {}) };
    const updated = composeOrigin(child, children);
    const siblings = { ...parent.children, [childKey]: updated };
    result[key] = composeOrigin(parent, siblings);
  }
  return result;
}

/** Display installation is independent of accepted preferences. Preserve unchanged leaf origins. */
export function displayOrigins(previous: object, applied: object, provenance: ConfigProvenance, fields: ConfigFields): ConfigProvenance {
  const result = { ...provenance };
  for (const [key, value] of Object.entries(applied)) {
    if (!Object.hasOwn(fields, key) || sameValue((previous as Record<string, unknown>)[key], value)) continue;
    const trace = traceValue(value, fields[key].schema, 'runtime');
    const children = Object.fromEntries(Object.entries(trace.children ?? {}).map(([child, node]) => [child,
      sameValue(((previous as Record<string, unknown>)[key] as Record<string, unknown> | undefined)?.[child], (value as Record<string, unknown>)[child])
        ? provenance[key]?.children?.[child] ?? node : replaceOrigin(provenance[key]?.children?.[child], node)]));
    const updated = replaceOrigin(provenance[key], trace);
    result[key] = Object.keys(children).length ? composeOrigin(updated, children) : updated;
  }
  return result;
}
