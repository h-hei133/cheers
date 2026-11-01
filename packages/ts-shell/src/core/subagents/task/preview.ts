import type { SubagentDefinition } from '../types.js';

/** The complete request and selected role are inspectable before delegation. */
export function taskPreview(args: Record<string, unknown>, name: string, definition?: SubagentDefinition): string {
  const fields: (readonly [string, unknown])[] = [
    ['Agent', definition?.name ?? name],
    ['Source', definition?.source ?? 'dynamic'],
    ...(definition?.filePath ? [['Definition file', definition.filePath] as const] : []),
    ['Model', definition?.model ?? 'inherit'],
    ['Effort', definition?.effort === null ? 'auto' : definition?.effort ?? 'inherit'],
    ['Requested mode', args.agentMode ?? 'inherit'],
    ['Isolation', args.isolation ?? definition?.isolation ?? 'none'],
    ['Permission mode', definition?.permissionMode ?? 'default'],
    ['Turn limit', definition?.maxTurns ?? 'inherit'],
    ['Memory', definition?.memory ?? 'none'],
    ['Allowed tools', definition?.tools ?? 'inherit'],
    ['Excluded tools', definition?.disallowedTools ?? []],
    ['Description', args.description],
    ['Instructions', args.prompt],
    ['Context', args.context ?? ''],
    ...(definition ? [['Agent description', definition.description] as const, ['Agent instructions', definition.systemPrompt] as const] : []),
  ];
  return ['Task request', ...fields.map(([label, value]) => `${label}: ${literal(value)}`)].join('\n');
}

/** Quoting preserves whitespace and prevents user text from forging report fields. */
function literal(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(/[\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
