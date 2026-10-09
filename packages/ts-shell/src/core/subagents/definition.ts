import type { SubagentDefinition } from './types.js';

export const DEFINITION_BYTES = 512 * 1024;
const fields = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'effort', 'enabled', 'permissionMode', 'maxTurns', 'isolation', 'memory']);
export function agentName(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error('Agent name must contain 1–64 letters, digits, underscores or hyphens.');
  return value;
}
function scalar(value: string): unknown {
  if (value.startsWith('[') || value.startsWith('"')) {
    try { return JSON.parse(value); } catch {
      if (value.startsWith('"')) throw new Error('Invalid quoted metadata.');
      if (!value.endsWith(']')) throw new Error('Invalid tool list.');
      return value.slice(1, -1).split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
  }
  if (value === 'true' || value === 'false') return value === 'true';
  if (/^\d+$/.test(value)) return Number(value);
  return value.replace(/^'|'$/g, '');
}
function list(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const result = typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : value;
  if (!Array.isArray(result) || result.length > 64 || result.some(item => typeof item !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(item))) throw new Error('Tool lists must contain at most 64 valid tool names.');
  return [...new Set(result)];
}
function enumeration<T extends string>(meta: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  if (meta[key] === undefined) return undefined;
  if (!allowed.includes(meta[key] as T)) throw new Error(`Invalid ${key}.`);
  return meta[key] as T;
}
export function parseDefinition(raw: string, source: SubagentDefinition['source'], filePath?: string, strict = true): SubagentDefinition {
  if (Buffer.byteLength(raw) > DEFINITION_BYTES || raw.includes('\0')) throw new Error('Agent definition exceeds the bounded text limit or contains NUL.');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Agent definition requires Markdown frontmatter.');
  if (match[1]!.length > 16 * 1024) throw new Error('Agent metadata exceeds 16 KiB.');
  const meta: Record<string, unknown> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const entry = line.match(/^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/);
    if (!entry || Object.hasOwn(meta, entry[1]!)) throw new Error('Invalid or duplicate agent metadata field.');
    if (!fields.has(entry[1]!)) { if (strict) throw new Error('Unknown agent metadata field.'); continue; }
    meta[entry[1]!] = scalar(entry[2]!);
  }
  if (typeof meta.name !== 'string' || typeof meta.description !== 'string' || !meta.description.trim() || meta.description.length > 2048) throw new Error('Agent name and bounded description are required.');
  const name = agentName(meta.name);
  if (meta.model !== undefined && (typeof meta.model !== 'string' || !meta.model || meta.model.length > 512 || /[\s\x00-\x1f\x7f]/.test(meta.model))) throw new Error('Invalid model target.');
  if (meta.maxTurns !== undefined && (!Number.isInteger(meta.maxTurns) || Number(meta.maxTurns) < 1 || Number(meta.maxTurns) > 1000)) throw new Error('maxTurns must be an integer from 1 to 1000.');
  if (meta.enabled !== undefined && typeof meta.enabled !== 'boolean') throw new Error('enabled must be true or false.');
  const effort = enumeration(meta, 'effort', ['low', 'medium', 'high', 'auto'] as const);
  return { name, description: meta.description.trim(), systemPrompt: match[2]!.trim() || `You are ${name}, an autonomous subagent for: ${meta.description.trim()}`,
    source, ...(filePath ? { filePath } : {}), tools: list(meta.tools), disallowedTools: list(meta.disallowedTools),
    model: meta.model as string | undefined, enabled: meta.enabled as boolean | undefined,
    ...(effort !== undefined ? { effort: effort === 'auto' ? null : effort } : {}),
    maxTurns: meta.maxTurns as number | undefined,
    permissionMode: enumeration(meta, 'permissionMode', ['default', 'plan', 'auto', 'acceptEdits', 'bypassPermissions']),
    isolation: enumeration(meta, 'isolation', ['worktree', 'none']), memory: enumeration(meta, 'memory', ['user', 'project', 'local']) };
}
export function formatDefinition(definition: SubagentDefinition): string {
  const meta: Record<string, unknown> = { name: definition.name, description: definition.description };
  for (const field of fields) {
    if (field === 'name' || field === 'description') continue;
    const value = definition[field as keyof SubagentDefinition];
    if (value !== undefined) meta[field] = field === 'effort' && value === null ? 'auto' : value;
  }
  return `---\n${Object.entries(meta).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n${definition.systemPrompt}\n`;
}
