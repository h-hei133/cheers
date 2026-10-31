import { CONFIG_MAX_BYTES, ConfigDocumentError, inspectConfigDocument } from './syntax.js';
import { type ConfigField, type ConfigFields, type ConfigSource, tuiFields } from './fields.js';
import { ConfigReferenceError, resolveConfigReferences } from './references.js';
import { type ConfigOrigin, origin, rejectOrigin, replaceOrigin, traceValue } from './provenance/model.js';
import { mergeOrigin } from './provenance/merge.js';
import { configTrustRejection } from './trust.js';
import type { TrustDecision } from '../core/security/trust/model.js';
import { mergeTui, type TuiLayers } from './tui.js';
import type { ConfigFileOrigin } from './provenance/files.js';
import { assertAccountOwner, captureConfigFiles, verifyConfigFiles } from './inputs/capture.js';
import { holdsCredentialMaterial, readableByOthers } from './secret.js';
import { ConfigInputError, type ConfigInputs } from './inputs/model.js';
import { mergeConfigValue } from './merge.js';
import { captureScopeLayer, scopeSettings } from './scope/capture.js';
import type { ScopeLayer } from './scope/model.js';
import type { PathRule } from './scope/contract.js';

export interface ConfigLayer {
  readonly values: Record<string, unknown>;
  readonly diagnostics: string[];
  readonly origins: Record<string, ConfigOrigin>;
  blocked: boolean;
  valid: boolean;
  readonly tuiLayers: TuiLayers;
  readonly scopeLayers?: ScopeLayer[];
}

function diagnostic(source: ConfigSource, field: string, code: string, blocked = false): string {
  return `Config ${source} ${field}: ${code}${blocked ? '; tools blocked' : '; value ignored'}.`;
}

/** Environment text is parsed by the field's declared schema type; anything else stays text. */
function environmentValue(field: ConfigField, raw: string): unknown {
  const text = raw.trim();
  if (field.schema.type === 'integer' || field.schema.type === 'number') return Number(text);
  if (field.schema.type === 'boolean') return text === 'true' ? true : text === 'false' ? false : text;
  return text;
}

function validateTui(value: unknown, source: ConfigSource, layer: ConfigLayer, trust: TrustDecision, file?: ConfigFileOrigin): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const field = Object.hasOwn(tuiFields, key) ? tuiFields[key] : undefined;
    if (!field) layer.diagnostics.push(diagnostic(source, 'tui', 'unknown-field'));
    else if (!field.validate(child)) {
      layer.valid = false;
      layer.origins.tui = rejectOrigin(layer.origins.tui, source, `invalid-${key}`, file);
      layer.diagnostics.push(diagnostic(source, `tui.${key}`, 'invalid-value'));
    }
    else {
      const reason = source === 'project' ? configTrustRejection(field, child, trust) : undefined;
      if (reason) {
        const previous = layer.origins.tui ?? origin('default');
        layer.origins.tui = { ...previous, children: { ...previous.children, [key]: rejectOrigin(previous.children?.[key], source, reason, file) } };
        layer.diagnostics.push(diagnostic(source, `tui.${key}`, reason));
      } else result[key] = child;
    }
  }
  return result;
}

/** Source rejection precedes all environment access; only validated data is merged. */
export function applyConfigLayer(layer: ConfigLayer, raw: Record<string, unknown>, source: ConfigSource, fields: ConfigFields, trust: TrustDecision, file?: ConfigFileOrigin, workspace?: string): void {
  const budget = { bytes: 0 };
  const accepted: Record<string, unknown> = {};
  const acceptedOrigins: Record<string, ConfigOrigin> = {};
  for (const [key, rawValue] of Object.entries(raw)) {
    if (rawValue === undefined) continue;
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!field) { layer.diagnostics.push(diagnostic(source, '(unknown)', 'unknown-field')); continue; }
    if (!field.sources.includes(source)) {
      layer.origins[key] = rejectOrigin(layer.origins[key], source, 'source-not-allowed', file);
      layer.diagnostics.push(diagnostic(source, key, 'source-not-allowed')); continue;
    }
    let value: unknown = rawValue;
    if (field.merge === 'tui') value = validateTui(value, source, layer, trust, file);
    if (!field.validate(value)) {
      layer.valid = false;
      layer.blocked ||= field.security;
      layer.origins[key] = rejectOrigin(layer.origins[key], source, 'invalid-value', file);
      layer.diagnostics.push(diagnostic(source, key, 'invalid-value', field.security));
      continue;
    }
    const trustRejection = source === 'project' ? configTrustRejection(field, value, trust) : undefined;
    if (trustRejection) {
      layer.origins[key] = rejectOrigin(layer.origins[key], source, trustRejection, file);
      layer.diagnostics.push(diagnostic(source, key, trustRejection));
      continue;
    }
    const incoming = traceValue(value, field.schema, source, file);
    if (source === 'user') {
      try { value = resolveConfigReferences(value, field.schema, budget); }
      catch (error) {
        layer.valid = false;
        const code = error instanceof ConfigReferenceError ? error.code : 'invalid-value';
        layer.origins[key] = rejectOrigin(layer.origins[key], source, code, file);
        layer.diagnostics.push(diagnostic(source, key, code));
        continue;
      }
      if (!field.validate(value)) { layer.valid = false; layer.origins[key] = rejectOrigin(layer.origins[key], source, 'invalid-value', file); layer.diagnostics.push(diagnostic(source, key, 'invalid-value')); continue; }
    }
    if (field.merge === 'tui') {
      const merged = mergeTui(layer.tuiLayers, value as Record<string, unknown>, incoming, source, layer.origins[key]);
      layer.values[key] = merged.values; layer.origins[key] = merged.trace;
      continue;
    }
    const before = layer.values[key];
    accepted[key] = value; acceptedOrigins[key] = incoming;
    layer.values[key] = mergeConfigValue(before, value, field.merge);
    layer.origins[key] = mergeOrigin(before, value, layer.values[key], layer.origins[key], incoming, field.merge);
  }
  if (layer.scopeLayers) layer.scopeLayers.push(captureScopeLayer(scopeSettings(accepted), acceptedOrigins,
    (accepted.pathRules ?? []) as PathRule[], source, file, workspace!, (settings, ruleFile) => {
      const candidate: ConfigLayer = { values: {}, origins: {}, diagnostics: [], valid: true, blocked: false, tuiLayers: {} };
      applyConfigLayer(candidate, settings as Record<string, unknown>, source, fields, trust, ruleFile);
      layer.diagnostics.push(...candidate.diagnostics); layer.valid &&= candidate.valid; layer.blocked ||= candidate.blocked;
      return { settings: scopeSettings(candidate.values), origins: candidate.origins };
    }));
}

export function loadConfigLayers(paths: readonly { path: string; source: 'project' | 'user' }[], overrides: unknown, fields: ConfigFields, trust: TrustDecision, inputs?: ConfigInputs, workspace?: string): ConfigLayer & { sources: string[]; verify: () => void } {
  const captured = captureConfigFiles(paths, inputs);
  const layer: ConfigLayer & { sources: string[]; verify: () => void } = { values: {}, origins: {}, diagnostics: [], blocked: false, valid: true, sources: [], tuiLayers: {}, scopeLayers: [],
    verify: () => verifyConfigFiles(captured, inputs) };
  for (const candidate of captured) {
    if (candidate.error) {
      layer.valid = false;
      layer.blocked = true;
      const safePath = candidate.path.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
      layer.diagnostics.push(`Invalid config at ${safePath}: ${candidate.source} ${candidate.error.message}; tools blocked.`);
      continue;
    }
    if (!candidate.snapshot) continue;
    assertAccountOwner(candidate, paths.find(file => file.source === 'user')!.path);
    // A credential file another account can read is a leaked key. Writes narrow
    // it, but a file that is never written would stay readable, so the load
    // reports it. Only the fact is stated: the file and its mode, never a value.
    if (candidate.source === 'user' && holdsCredentialMaterial(candidate.snapshot.values)
      && readableByOthers(candidate.canonical ?? candidate.path)) {
      const safePath = candidate.path.replace(/[\x00-\x1f\x7f-\x9f]/g, '?').slice(0, 512);
      layer.diagnostics.push(`Config ${safePath} holds credentials and is readable by other accounts; run a save to narrow it.`);
    }
    const file: ConfigFileOrigin = { path: candidate.canonical!, revision: candidate.snapshot.revision, source: candidate.source,
      ...(candidate.input ? { position: candidate.input.position } : {}) };
    const documentLayer = { ...layer, valid: true, blocked: false };
    applyConfigLayer(documentLayer, candidate.snapshot.values, candidate.source, fields, trust, file, workspace);
    if (candidate.input && !documentLayer.valid) throw new ConfigInputError('invalid-value', candidate.path, documentLayer.blocked);
    layer.valid &&= documentLayer.valid; layer.blocked ||= documentLayer.blocked;
    layer.sources.push(candidate.canonical!);
  }
  for (const [key, field] of Object.entries(fields)) {
    const variable = field.environment;
    if (!variable) continue;
    const raw = process.env[variable];
    // An empty variable is the same statement as an unset one; only a value is validated.
    if (raw === undefined || raw.trim() === '') continue;
    applyConfigLayer(layer, { [key]: environmentValue(field, raw) }, 'environment', fields, trust, undefined, workspace);
  }
  if (overrides !== undefined) {
    try {
      inspectConfigDocument(overrides);
      applyConfigLayer(layer, overrides, 'override', fields, trust, undefined, workspace);
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
  verifyConfigFiles(captured, inputs);
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
