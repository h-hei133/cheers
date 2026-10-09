import { parseSyntax } from '../../../core/commands/syntax/parse.js';
import { mcpSyntax } from '../../../core/commands/mcp/syntax.js';

/** Scoped operations put the server in the second slot and input file in the third. */
export function mcpCatalogKind(before: readonly string[], after: readonly string[]): 'mcp' | 'file' | undefined {
  let placeholder = 'completion-target';
  while (before.includes(placeholder) || after.includes(placeholder)) placeholder += '-';
  const parsed = parseSyntax(mcpSyntax, [...before, placeholder, ...after], true);
  if (!parsed.ok) return undefined;
  const scoped = ['add', 'edit', 'remove', 'enable', 'disable'].includes(parsed.action.name);
  const position = parsed.args.indexOf(placeholder);
  if (scoped && position === 1 && parsed.action.name !== 'add') return 'mcp';
  if (['add', 'edit'].includes(parsed.action.name) && position === 2) return 'file';
  if (!scoped && position === 0 && parsed.action.parameters?.[0]?.name === 'server') return 'mcp';
  return undefined;
}
