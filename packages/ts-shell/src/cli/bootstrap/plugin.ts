import { createInterface, type Interface } from 'node:readline';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CliInvocation } from '../options/argv.js';
import { extensionCommandFor, waitForExtensionsFor } from '../runtime/extensions.js';
import type { CliProcessRunnerInput } from './contract.js';

const OPTIONS = new Set(['--profile', '--config', '--project', '--attach', '--offline']);

export function pluginInstallInvocation(invocation: CliInvocation): { source: string } | { error: string } | undefined {
  const [command, action, source] = invocation.positionals;
  if (command !== 'plugin' || action !== 'install') return undefined;
  if (!source || invocation.positionals.length !== 3 || invocation.tail.length || invocation.unresolved.length
    || invocation.options.some(option => !OPTIONS.has(option.name))) {
    return { error: 'Usage: cheers plugin install <source> [--project <path>] [--profile <name>] [--config <file>] [--offline].' };
  }
  return { source };
}

export async function runPluginInstall(input: CliProcessRunnerInput, context: ShellRuntimeContext, source: string,
  bind: (readline: Interface) => void): Promise<boolean> {
  const controller = new AbortController();
  const readline = createInterface({ input: input.stdin, output: input.process.stdout, terminal: true });
  readline.once('SIGINT', () => readline.close());
  readline.once('close', () => controller.abort());
  try {
    bind(readline);
    await waitForExtensionsFor(context);
    const result = await extensionCommandFor(context)('plugin', ['install', source],
      { sessionId: context.session.id, cwd: context.cwd, signal: controller.signal }, true);
    if (result.installConfirmed) input.writeOutput(result.output);
    else input.writeError(result.output);
    return result.installConfirmed === true;
  } finally {
    readline.close();
  }
}
