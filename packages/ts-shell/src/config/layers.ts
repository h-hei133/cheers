import { CONFIG_MAX_BYTES, ConfigDocumentError, inspectConfigDocument } from './syntax.js';
import { readConfigDocument } from './document.js';
import { type ConfigFields, type ConfigSource, type MergePolicy, tuiFields } from './fields.js';
import { ConfigReferenceError, resolveConfigReferences } from './references.js';
import { type ConfigOrigin, origin, rejectOrigin, replaceOrigin, traceValue } from './provenance/model.js';
import { mergeOrigin } from './provenance/merge.js';
import { configTrustRejection } from './trust.js';
import type { TrustDecision } from '../core/security/trust/model.js';

export interface ConfigLayer {
  readonly values: Record<string, unknown>;
  readonly diagnostics: string[];
  readonly origins: Record<string, ConfigOrigin>;
  blocked: boolean;
  valid: boolean;
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

function validateTui(value: unknown, source: ConfigSource, layer: ConfigLayer, trust: TrustDecision): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const field = Object.hasOwn(tuiFields, key) ? tuiFields[key] : undefined;
    if (!field) layer.diagnostics.push(diagnostic(source, 'tui', 'unknown-field'));
    else if (!field.validate(child)) {
      layer.valid = false;
      layer.origins.tui = rejectOrigin(layer.origins.tui, source, `invalid-${key}`);
      layer.diagnostics.push(diagnostic(source, `tui.${key}`, 'invalid-value'));
    }
    else {
      const reason = source === 'project' ? configTrustRejection(field, child, trust) : undefined;
      if (reason) {
        const previous = layer.origins.tui ?? origin('default');
        layer.origins.tui = { ...previous, children: { ...previous.children, [key]: rejectOrigin(previous.children?.[key], source, reason) } };
        layer.diagnostics.push(diagnostic(source, `tui.${key}`, reason));
      } else result[key] = child;
    }
  }
  return result;
}

/** Source rejection precedes all environment access; only validated data is merged. */
export function applyConfigLayer(layer: ConfigLayer, raw: Record<string, unknown>, source: ConfigSource, fields: ConfigFields, trust: TrustDecision): void {
  const budget = { bytes: 0 };
  for (const [key, rawValue] of Object.entries(raw)) {
    if (rawValue === undefined) continue;
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!field) { layer.diagnostics.push(diagnostic(source, '(unknown)', 'unknown-field')); continue; }
    if (!field.sources.includes(source)) {
      layer.origins[key] = rejectOrigin(layer.origins[key], source, 'source-not-allowed');
      layer.diagnostics.push(diagnostic(source, key, 'source-not-allowed')); continue;
    }
    let value: unknown = rawValue;
    if (field.merge === 'tui') value = validateTui(value, source, layer, trust);
    if (!field.validate(value)) {
      layer.valid = false;
      layer.blocked ||= field.security;
      layer.origins[key] = rejectOrigin(layer.origins[key], source, 'invalid-value');
      layer.diagnostics.push(diagnostic(source, key, 'invalid-value', field.security));
      continue;
    }
    const trustRejection = source === 'project' ? configTrustRejection(field, value, trust) : undefined;
    if (trustRejection) {
      layer.origins[key] = rejectOrigin(layer.origins[key], source, trustRejection);
      layer.diagnostics.push(diagnostic(source, key, trustRejection));
      continue;
    }
    const incoming = traceValue(value, field.schema, source);
    if (source === 'user') {
      try { value = resolveConfigReferences(value, field.schema, budget); }
      catch (error) {
        layer.valid = false;
        const code = error instanceof ConfigReferenceError ? error.code : 'invalid-value';
        layer.origins[key] = rejectOrigin(layer.origins[key], source, code);
        layer.diagnostics.push(diagnostic(source, key, code));
        continue;
      }
      if (!field.validate(value)) { layer.valid = false; layer.origins[key] = rejectOrigin(layer.origins[key], source, 'invalid-value'); layer.diagnostics.push(diagnostic(source, key, 'invalid-value')); continue; }
    }
    const before = layer.values[key];
    layer.values[key] = mergeValue(before, value, field.merge);
    layer.origins[key] = mergeOrigin(before, value, layer.values[key], layer.origins[key], incoming, field.merge);
  }
}

export function loadConfigLayers(paths: readonly { path: string; source: 'project' | 'user' }[], overrides: unknown, fields: ConfigFields, trust: TrustDecision): ConfigLayer & { sources: string[] } {
  const layer: ConfigLayer & { sources: string[] } = { values: {}, origins: {}, diagnostics: [], blocked: false, valid: true, sources: [] };
  for (const candidate of paths) {
    try {
      const document = readConfigDocument(candidate.path);
      if (document === undefined) continue;
      applyConfigLayer(layer, document, candidate.source, fields, trust);
      layer.sources.push(candidate.path);
    } catch (error) {
      layer.valid = false;
      layer.blocked = true;
      const code = error instanceof ConfigDocumentError ? error.message : 'unreadable';
      const safePath = candidate.path.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
      layer.diagnostics.push(`Invalid config at ${safePath}: ${candidate.source} ${code}; tools blocked.`);
    }
  }
  const rawMaxTurns = process.env.CHEERS_MAX_TURNS;
  if (rawMaxTurns) applyConfigLayer(layer, { maxTurns: Number(rawMaxTurns) }, 'environment', fields, trust);
  if (overrides !== undefined) {
    try {
      inspectConfigDocument(overrides);
      applyConfigLayer(layer, overrides, 'override', fields, trust);
    } catch {
      layer.valid = false;
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
    for (const key of ['allowedTools', 'denyRules', 'enableMcpTools', 'allowUntrustedHooks']) {
      layer.origins[key] = replaceOrigin(layer.origins[key], traceValue(layer.values[key], fields[key].schema, 'safety'));
    }
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
