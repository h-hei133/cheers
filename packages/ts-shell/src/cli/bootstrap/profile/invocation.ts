import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SwitchReceipt } from './model.js';
import { switchArgs } from './model.js';

/** Select the actual executable or known loader; source startup argv are never replayed. */
export function freshExecutable(execPath: string, entry: string | undefined): { readonly command: string; readonly prefix: readonly string[] } {
  if (!/^(node|bun)(\.exe)?$/i.test(path.basename(execPath))) return { command: execPath, prefix: [] };
  if (!entry || !fs.statSync(entry).isFile() || !/(?:[/\\]entrypoints[/\\]cli\.(?:tsx|js)|[/\\]dist[/\\]cli\.js)$/.test(entry)) {
    throw new Error('The current CLI executable identity cannot be relaunched.');
  }
  const absolute = fs.realpathSync(entry);
  if (/\.tsx?$/.test(absolute)) {
    if (/^bun(\.exe)?$/i.test(path.basename(execPath))) return { command: execPath, prefix: [absolute] };
    const [major, minor] = process.versions.node.split('.').map(Number);
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    // The known loader stays in the admitted process. The package's CLI would
    // create an extra launcher whose PID and signal ownership differ.
    const flag = major! > 20 || major === 20 && minor! >= 6 || major === 18 && minor! >= 19 ? '--import' : '--loader';
    return { command: execPath, prefix: [flag, loader, absolute] };
  }
  return { command: execPath, prefix: [absolute] };
}

export function freshInvocation(receipt: SwitchReceipt, executable: ReturnType<typeof freshExecutable>, env: NodeJS.ProcessEnv) {
  const selected: Record<string, string> = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'TERM', 'COLORTERM', 'TERM_PROGRAM',
    'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'NO_COLOR', 'FORCE_COLOR']) if (env[key] !== undefined) selected[key] = env[key]!;
  selected.HOME = receipt.plan.target.homeDir; selected.USERPROFILE = receipt.plan.target.homeDir;
  selected.CHEERS_PROFILE_HANDOFF = `${receipt.plan.source.id}:${receipt.operation}`;
  if (env.CHEERS_PROVIDER_MODE === 'synthetic') selected.CHEERS_PROVIDER_MODE = 'synthetic';
  return { command: executable.command, args: [...executable.prefix, ...switchArgs(receipt.plan)], env: selected };
}
