import { parseSyntax } from './syntax/parse.js';
import { forceSyntax } from './force/syntax.js';
import type { CommandContext, LocalCommandResult } from './types.js';

type ForceContext = CommandContext & { readonly forceTool?: (tool: string) => Promise<string> };

/** Selects a tool for one subsequent request; it never executes or authorizes it. */
export async function runForceCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(forceSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /force arguments: ${parsed.reason}` };
  const tool = parsed.args[0]?.trim();
  if (!tool || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(tool)) return { kind: 'local', output: 'Force requires one available tool name.' };
  const select = (context as ForceContext).forceTool;
  if (!select) return { kind: 'local', output: 'Force selection is unavailable in this host; no request was changed.' };
  try {
    const output = await select(tool);
    return { kind: 'local', output: `${output}\nThis selection applies to one subsequent request only. Plan mode, sandbox, ordinary approval, and tool policy remain in force.` };
  } catch (error) {
    return { kind: 'local', output: `Force selection refused: ${error instanceof Error ? error.message : 'tool is unavailable'}` };
  }
}
