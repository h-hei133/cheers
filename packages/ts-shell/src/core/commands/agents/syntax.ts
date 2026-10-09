import type { CommandSyntax } from '../syntax/model.js';
import { parseSyntax } from '../syntax/parse.js';
const text = (name: string) => ({ name, kind: 'text' as const, required: true });
const scoped = [{ ...text('scope'), values: ['user', 'project'] }, text('name')];
export const agentsSyntax: CommandSyntax = { name: 'agents', defaultAction: 'list', actions: [
  { name: 'list', summary: 'show current definitions, effective sources and diagnostics' },
  { name: 'discover', summary: 'refresh discovery and show shadowed definitions' },
  { name: 'show', summary: 'show one effective definition and its overrides', parameters: [text('name')] },
  ...['create', 'import', 'edit'].map(name => ({ name, summary: 'approve a bounded Markdown definition in an explicit scope', parameters: [...scoped, text('markdown-file')] })),
  ...['delete', 'enable', 'disable'].map(name => ({ name, summary: 'approve a scoped definition change; builtins remain read-only', parameters: scoped })),
  { name: 'model', summary: 'approve a request-local model target; inherit removes the override', parameters: [...scoped, text('target-or-inherit')] },
  { name: 'effort', summary: 'approve request-local effort without changing the main preference', parameters: [...scoped, { ...text('effort'), values: ['low', 'medium', 'high', 'auto', 'inherit'] }] },
  { name: 'export', summary: 'approve exporting one definition to a workspace file', parameters: [text('name'), text('path')] },
] };
export function parseAgentsArgs(args: readonly string[]) { return parseSyntax(agentsSyntax, args); }
