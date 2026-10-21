import { mcpServerName, parseMcpDefinition } from '../../../../core/mcp/config/definition.js';
import { neutraliseForDisplay } from '../../../../core/text/safety.js';
import { redactReportText } from '../../../../core/security/redaction.js';

export type McpAddDefinition = { readonly command: string; readonly args: readonly string[] } | { readonly url: string };
const plain = (text: string) => !/[\x00-\x1f\x7f-\x9f]/.test(text);
const safe = (text: string) => neutraliseForDisplay(redactReportText(text, 2048));

function definitionIssue(definition: McpAddDefinition): string | undefined {
  try { parseMcpDefinition(JSON.stringify(definition)); return undefined; }
  catch { return 'Use a valid MCP definition within the input limits.'; }
}

export function nameIssue(text: string): string | undefined {
  try {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(text.trim())) throw new Error();
    mcpServerName(text.trim()); return undefined;
  } catch { return 'Use 1–64 letters, digits, _ or - without reserved names.'; }
}

export function valueIssue(transport: string, text: string): string | undefined {
  if (!plain(text)) return 'Control characters are not accepted.';
  return definitionIssue(transport === 'http' ? { url: text.trim() } : { command: text.trim(), args: [] });
}

export function argumentIssue(command: string, text: string): string | undefined {
  try {
    if (Buffer.byteLength(text) > 32 * 1024 || !plain(text)) throw new Error();
    return definitionIssue({ command, args: JSON.parse(text) });
  } catch { return 'Enter a bounded JSON array of argument strings.'; }
}

export function reviewDefinition(definition: McpAddDefinition): string {
  if ('url' in definition) {
    const url = new URL(definition.url); const query = Boolean(url.search); url.search = '';
    return `HTTP: ${safe(url.toString())}${query ? ' [query omitted]' : ''}`;
  }
  return `Executable: ${safe(definition.command)}\nArguments: ${definition.args.length} (values omitted)`;
}
