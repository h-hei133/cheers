import { CONFIG_MAX_BYTES, ConfigDocumentError, inspectConfigDocument, readConfigDocument } from './document.js';
import { type ConfigFields, type ConfigSource, type MergePolicy, tuiFields } from './fields.js';
import { ConfigReferenceError, resolveConfigReferences } from './references.js';

export interface ConfigLayer {
  readonly values: Record<string, unknown>;
  readonly diagnostics: string[];
  blocked: boolean;
}

function diagnostic(source: ConfigSource, field: string, code: string, blocked = false): string {
  return `Config ${source} ${field}: ${code}${blocked ? '; tools blocked' : '; value ignored'}.`;
}

function mergeValue(previous: unknown, value: unknown, policy: MergePolicy): unknown {
  if (previous === undefined) return value;
  switch (policy) {
    case 'intersect': {
      const allowed = new Set(value as string[]);
      return (previous as string[]).filter(item => allowed.has(item));
    }
    case 'union': return [...new Set([...(previous as string[]), ...(value as string[])])];
    case 'deny': return [...(previous as unknown[]), ...(value as unknown[])];
    case 'disable': return previous === false ? false : value;
    case 'tui': {
      // Project leaves win, but an empty project status list historically falls
      // through to the user's choice. Other ordinary fields remain user-first.
      const project = { ...(previous as Record<string, unknown>) };
      if (Array.isArray(project.statusItems) && project.statusItems.length === 0) delete project.statusItems;
      return { ...(value as Record<string, unknown>), ...project };
    }
    default: return value;
  }
}

function validateTui(value: unknown, source: ConfigSource, layer: ConfigLayer): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const field = Object.hasOwn(tuiFields, key) ? tuiFields[key] : undefined;
    if (!field) layer.diagnostics.push(diagnostic(source, 'tui', 'unknown-field'));
    else if (!field.validate(child)) layer.diagnostics.push(diagnostic(source, `tui.${key}`, 'invalid-value'));
    else result[key] = child;
  }
  return result;
}

/** Source rejection precedes all environment access; only validated data is merged. */
export function applyConfigLayer(layer: ConfigLayer, raw: Record<string, unknown>, source: ConfigSource, fields: ConfigFields): void {
  const budget = { bytes: 0 };
  for (const [key, rawValue] of Object.entries(raw)) {
    if (rawValue === undefined) continue;
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!field) { layer.diagnostics.push(diagnostic(source, '(unknown)', 'unknown-field')); continue; }
    if (!field.sources.includes(source)) { layer.diagnostics.push(diagnostic(source, key, 'source-not-allowed')); continue; }
    let value: unknown = rawValue;
    if (field.merge === 'tui') value = validateTui(value, source, layer);
    if (!field.validate(value)) {
      layer.blocked ||= field.security;
      layer.diagnostics.push(diagnostic(source, key, 'invalid-value', field.security));
      continue;
    }
    if (source === 'user') {
      try { value = resolveConfigReferences(value, field.schema, budget); }
      catch (error) {
        layer.diagnostics.push(diagnostic(source, key, error instanceof ConfigReferenceError ? error.code : 'invalid-value'));
        continue;
      }
      if (!field.validate(value)) { layer.diagnostics.push(diagnostic(source, key, 'invalid-value')); continue; }
    }
    layer.values[key] = mergeValue(layer.values[key], value, field.merge);
  }
}

export function loadConfigLayers(paths: readonly { path: string; source: 'project' | 'user' }[], overrides: unknown, fields: ConfigFields): ConfigLayer & { sources: string[] } {
  const layer: ConfigLayer & { sources: string[] } = { values: {}, diagnostics: [], blocked: false, sources: [] };
  for (const candidate of paths) {
    try {
      const document = readConfigDocument(candidate.path);
      if (document === undefined) continue;
      applyConfigLayer(layer, document, candidate.source, fields);
      layer.sources.push(candidate.path);
    } catch (error) {
      layer.blocked = true;
      const code = error instanceof ConfigDocumentError ? error.code : 'unreadable';
      const safePath = candidate.path.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
      layer.diagnostics.push(`Invalid config at ${safePath}: ${candidate.source} ${code}; tools blocked.`);
    }
  }
  const rawMaxTurns = process.env.CHEERS_MAX_TURNS;
  if (rawMaxTurns) applyConfigLayer(layer, { maxTurns: Number(rawMaxTurns) }, 'environment', fields);
  if (overrides !== undefined) {
    try {
      inspectConfigDocument(overrides);
      applyConfigLayer(layer, overrides, 'override', fields);
    } catch {
      layer.blocked = true;
      layer.diagnostics.push(diagnostic('override', '(document)', 'invalid-document', true));
    }
  }
  // Applied last: a malformed security field/document cannot be bypassed by CLI
  // allowlists. The wildcard deny also protects direct tool execution.
  if (layer.blocked) {
    layer.values.allowedTools = [];
    layer.values.denyRules = [{ tool: '*' }];
    layer.values.enableMcpTools = false;
    layer.values.allowUntrustedHooks = false;
  }
  return layer;
}

/** Check known shapes without resolving references or dropping unknown fields. */
export function validateRawConfig(value: unknown, fields: ConfigFields): void {
  inspectConfigDocument(value);
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (field && !field.validate(child)) throw new Error(`Invalid config field ${key}: invalid-value.`);
  }
  if (Buffer.byteLength(JSON.stringify(value)) > CONFIG_MAX_BYTES) throw new ConfigDocumentError('resource-limit');
}
