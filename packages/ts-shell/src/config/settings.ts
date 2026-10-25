import type { AnySchemaObject } from 'ajv';
import { CONFIG_FIELDS, type RuntimeConfigFile } from './runtimeConfig.js';
import { tuiFields, type ConfigField } from './fields.js';
import { STATUS_ITEMS } from '../presentation/tui/chrome/items.js';

export type SettingsScope = 'user' | 'project';
export interface SettingDefinition {
  readonly key: string;
  readonly group: string;
  readonly section: string;
  readonly label: string;
  readonly description: string;
  readonly path: readonly [keyof RuntimeConfigFile, string?];
  readonly policy: ConfigField;
  readonly schema: AnySchemaObject;
  readonly choices?: readonly unknown[];
}

const descriptions = {
  attentionOnIdle: ['Session', 'Attention on idle', 'Bell and notification sequence after long operations; desktop display depends on the terminal'],
  offline: ['Session', 'Offline', 'Skip self-initiated requests; prompts and requested tools remain available'],
  maxTurns: ['Request', 'Maximum turns', 'Maximum turns in an operation'],
  temperature: ['Request', 'Temperature', 'Sampling temperature; support depends on the selected model'],
  topP: ['Request', 'Top P', 'Sampling probability threshold from 0 to 1'],
  maxOutputTokens: ['Request', 'Output token limit', 'Requested output token budget; model limits still apply'],
  contextWindow: ['Context', 'Context window', 'Override model window resolution; unset to use the model catalogue'],
  reserveTokens: ['Context', 'Reserved tokens', 'Tokens reserved outside the usable input budget'],
  modelTokenBudgets: ['Context', 'Model token budgets', 'JSON object mapping provider/model identifiers to reserveTokens and keepRecentTokens'],
  instructionBudgetBytes: ['Context', 'Instruction bytes', 'Project instruction byte budget; 0 disables loading'],
  cacheWarming: ['Session', 'Cache warming', 'Idle warming can incur charges without a new prompt'],
  agentMode: ['Session', 'Default agent mode', 'Initial mode preference; explicit session mode selection takes precedence'],
  steeringMode: ['Session', 'Steering delivery', 'Deliver queued steering messages one at a time or together'],
  followUpMode: ['Session', 'Follow-up delivery', 'Deliver queued follow-up messages one at a time or together'],
  retryEnabled: ['Retries', 'Enable turn retries', 'Retry eligible failed model calls'],
  retryMaxRetries: ['Retries', 'Turn retry count', 'Maximum retries at the turn layer'],
  providerRetryMaxRetries: ['Retries', 'Provider retry count', 'Maximum retries at the provider layer'],
  retryBaseDelayMs: ['Retries', 'Base delay in ms', 'Initial retry delay in milliseconds'],
  retryMaxDelayMs: ['Retries', 'Maximum delay in ms', 'Maximum retry delay in milliseconds'],
  providerConnectTimeoutMs: ['Network', 'Connect timeout in ms', 'Connection establishment timeout'],
  providerHeadersTimeoutMs: ['Network', 'Headers timeout in ms', 'Response header wait timeout'],
  providerBodyTimeoutMs: ['Network', 'Body timeout in ms', 'Response body wait timeout'],
  allowedTools: ['Tools', 'Allowed tools', 'JSON list; intersects other restrictions. Empty permits no tools; unset adds no allowlist'],
  allowedModels: ['Request', 'Allowed models', 'JSON list of provider/model identifiers; intersects other restrictions. Empty permits no model requests; unset adds no allowlist'],
  pathRules: ['Request', 'Path rules', 'JSON list of {path, settings} rules; only registered operation fields apply, and safety restrictions accumulate'],
  disabledTools: ['Tools', 'Disabled tools', 'JSON list; combines with other disabled tool lists'],
  hiddenToolPrefixes: ['Tools', 'Hidden tool prefixes', 'JSON list; combines with other hidden prefixes'],
  denyRules: ['Tools', 'Deny rules', 'JSON list of tool/pattern constraints; combines with other deny rules'],
  enableMcpTools: ['Tools', 'Enable MCP tools', 'Any configured false disables MCP tools; approvals still apply'],
  toolDiscovery: ['Tools', 'Tool discovery', 'dynamic starts with pinned tools and loads the rest on request; full sends every schema'],
  theme: ['Display', 'Theme', 'Theme name, including custom themes and auto'],
  vimMode: ['Display', 'Vim mode', 'Normal/Insert/Visual/Visual-Line/Replace editing in the prompt; starts in Insert'],
  backgroundFollowUp: ['Session', 'Background follow-up', 'Send a finished background task as a model follow-up; off means a local notice only'],
  tuiMode: ['Display', 'Terminal mode', 'Regular or fullscreen; changes require restart'],
  'tui.composerShape': ['Display', 'Input shape', 'Input appearance; project leaves take precedence. Unset uses default'],
  'tui.statusItems': ['Display', 'Status items', 'Supported status item names; project leaves take precedence. Empty uses the default band'],
  'tui.diagrams': ['Display', 'Diagrams', 'Diagram presentation; project leaves take precedence'],
} as const;

/** UI metadata joins the same schema/source/merge/application policy used by the loader. */
export const CONFIG_SETTINGS: readonly SettingDefinition[] = Object.entries(descriptions).map(([key, [group, label, description]]) => {
  const [root, leaf] = key.split('.') as [keyof RuntimeConfigFile, string?];
  const rootPolicy = CONFIG_FIELDS[root];
  const policy = leaf ? { ...rootPolicy, application: tuiFields[leaf].application } : rootPolicy;
  const schema = leaf ? tuiFields[leaf].schema : policy.schema;
  const navigation = settingNavigation(key, group);
  return { key, ...navigation, label, description, path: [root, leaf] as const, policy, schema,
    choices: schema.type === 'boolean' ? [true, false] : schema.enum };
}).sort((left, right) => left.group.localeCompare(right.group));

function settingNavigation(key: string, group: string): { group: string; section: string } {
  if (key === 'theme') return { group: 'Appearance', section: 'Theme' };
  if (key.startsWith('tui.') || key === 'tuiMode') return { group: 'Appearance', section: key.includes('status') ? 'Status line' : key.includes('composer') ? 'Composer' : 'Display' };
  if (key === 'vimMode') return { group: 'Interaction', section: 'Input' };
  if (key === 'attentionOnIdle') return { group: 'Interaction', section: 'Notifications' };
  if (key === 'offline') return { group: 'Interaction', section: 'Requests' };
  if (key === 'pathRules') return { group: 'Files', section: 'Path policies' };
  if (group === 'Session') return { group: 'Tasks', section: key === 'cacheWarming' ? 'Background requests' : 'Delivery' };
  if (group === 'Request') return { group: 'Model', section: key === 'temperature' || key === 'topP' ? 'Sampling' : 'Limits' };
  if (group === 'Context') return { group, section: key === 'instructionBudgetBytes' ? 'Instructions' : 'Budgets' };
  if (group === 'Retries' || group === 'Network') return { group: 'Providers', section: group === 'Retries' ? 'Retries' : 'Timeouts' };
  return { group, section: key === 'toolDiscovery' || key === 'enableMcpTools' ? 'Discovery' : 'Access' };
}

export function settingDefinition(key: string): SettingDefinition | undefined {
  return CONFIG_SETTINGS.find(item => item.key === key);
}

export function settingValue(config: object, setting: SettingDefinition): unknown {
  const [root, leaf] = setting.path;
  const value = (config as Record<string, unknown>)[root];
  return leaf ? (value as Record<string, unknown> | undefined)?.[leaf] : value;
}

/** Only the selected leaf changes; the persistence owner merges against this explicit baseline. */
export function settingPatch(baseline: RuntimeConfigFile, setting: SettingDefinition, value: unknown): RuntimeConfigFile {
  const [root, leaf] = setting.path;
  return { [root]: leaf ? { ...(baseline[root] as object | undefined), [leaf]: value } : value };
}

export function validateSetting(setting: SettingDefinition, value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (setting.key === 'tui.statusItems' && Array.isArray(value) && value.some(id => !STATUS_ITEMS.some(item => item.id === id))) return 'Choose supported status items from the status picker.';
  const [root, leaf] = setting.path;
  const field = leaf ? tuiFields[leaf] : CONFIG_FIELDS[root];
  return field.validate(value) ? undefined : `Invalid value for ${setting.key}. Expected ${setting.schema.type}.`;
}

/** The editor a setting gets, derived from its schema rather than its key. */
export type SettingEditor = "boolean" | "choice" | "number" | "text" | "list" | "object" | "status-items" | "theme";

export function settingEditor(setting: SettingDefinition): SettingEditor {
  if (setting.key === "tui.statusItems") return "status-items";
  if (setting.key === "theme") return "theme";
  if (setting.schema.type === "boolean") return "boolean";
  if (setting.choices) return "choice";
  if (setting.schema.type === "integer" || setting.schema.type === "number") return "number";
  if (setting.schema.type === "array") return "list";
  if (setting.schema.type === "object") return "object";
  return "text";
}

export interface SettingInput {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
}

/**
 * Parse an editor's text without coercing unknown or obsolete values away.
 *
 * Numbers are accepted only in their own shape, lists are one item per line
 * (each line JSON when the schema's items are objects), and text stays text so
 * a hidden prefix such as `mcp.` is expressible without quoting.
 */
export function parseSettingInput(setting: SettingDefinition, text: string): SettingInput {
  const editor = settingEditor(setting);
  const decoded = decodeOuterQuotes(text);
  if (editor === "number") {
    const trimmed = decoded.trim();
    if (!trimmed) return { ok: false, error: "Enter a number." };
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return { ok: false, error: "Enter a finite number." };
    if (setting.schema.type === "integer" && !Number.isInteger(value)) return { ok: false, error: "Enter a whole number." };
    const invalid = validateSetting(setting, value);
    return invalid ? { ok: false, error: invalid } : { ok: true, value };
  }
  if (editor === "list") {
    const trimmed = decoded.trim();
    if (trimmed.startsWith("[")) {
      try {
        const value: unknown = JSON.parse(trimmed);
        const invalid = validateSetting(setting, value);
        return invalid ? { ok: false, error: invalid } : { ok: true, value };
      } catch {
        return { ok: false, error: "Enter a JSON array or one item per line." };
      }
    }
    const objectItems = (setting.schema.items as { type?: string } | undefined)?.type === "object";
    const lines = decoded.split("\n").map(line => line.trim()).filter(Boolean);
    const items: unknown[] = [];
    for (const line of lines) {
      if (!objectItems) { items.push(line); continue; }
      try { items.push(JSON.parse(line)); }
      catch { return { ok: false, error: "Each line must be a JSON object." }; }
    }
    const invalid = validateSetting(setting, items);
    return invalid ? { ok: false, error: invalid } : { ok: true, value: items };
  }
  if (editor === "text" || editor === "theme") {
    const invalid = validateSetting(setting, decoded);
    return invalid ? { ok: false, error: invalid } : { ok: true, value: decoded };
  }
  try {
    const value: unknown = JSON.parse(decoded);
    const invalid = validateSetting(setting, value);
    return invalid ? { ok: false, error: invalid } : { ok: true, value };
  } catch {
    return { ok: false, error: "Enter a valid JSON value." };
  }
}

function decodeOuterQuotes(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 2) return text;
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if (first === '"' && last === '"') {
    try {
      const decoded: unknown = JSON.parse(trimmed);
      if (typeof decoded === "string") return decoded;
    } catch {
      // Fall through to the single-quote/shell-token handling below.
    }
  }
  if (first === "'" && last === "'") return trimmed.slice(1, -1);
  return text;
}

export function formatSetting(value: unknown): string {
  return value === undefined ? 'unset' : JSON.stringify(value).replace(/[\x7f-\x9f]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
