import path from 'node:path';
import { changelogSyntax } from './changelog/syntax.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { packageVersion } from '../version/current.js';

interface Entry { readonly version: string; readonly text: string; }

/** Read only the current project's authorized release notes and identify the installed version. */
export async function runChangelogCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(changelogSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /changelog arguments: ${parsed.reason}\n${syntaxHelp(changelogSyntax)}` };
  const version = packageVersion();
  const file = path.join(context.projectRoot ?? context.cwd, 'CHANGELOG.md');
  if (!version) return { kind: 'local', output: 'Changelog unavailable: the installed build has no readable version.' };
  if (!context.dataTransfer) return { kind: 'local', output: `Changelog unavailable for installed version ${version}: authorized project-file reading is unavailable (offline).` };
  const read = await context.dataTransfer.read({ path: file, maxBytes: 128 * 1024 });
  if (read.outcome !== 'read') return { kind: 'local', output: `Project changelog ${read.outcome}: ${read.reason}`, state: { status: read.outcome } };
  const entries = parseEntries(read.content);
  if (!entries.length) return { kind: 'local', output: `Changelog unavailable for installed version ${version}: ${file} contains no versioned entries.` };
  const selected = parsed.action.name === 'full' ? entries : entries.slice(0, 1);
  const exact = entries.find(entry => entry.version === version);
  const note = exact ? `Installed version: ${version}; matching version label in project notes.` : `Installed version: ${version}; no matching version label in project notes.`;
  return { kind: 'local', output: [`# Changelog`, ``, note, `Source: ${file}`, ``, ...selected.map(entry => entry.text)].join('\n') };
}

function parseEntries(markdown: string): Entry[] {
  const entries: Entry[] = [];
  let current: { version: string; lines: string[] } | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^##\s+\[?([^\]\s]+)\]?/.exec(line);
    if (match) {
      if (current) entries.push({ version: current.version, text: current.lines.join('\n').trim() });
      current = { version: match[1]!, lines: [line] };
    } else if (current) current.lines.push(line);
  }
  if (current) entries.push({ version: current.version, text: current.lines.join('\n').trim() });
  return entries;
}
