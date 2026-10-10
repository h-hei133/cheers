import { ShellManager } from '../../shell/platform/shellManager.js';
import { planSandboxedCommand } from '../../../sandbox/osSandbox.js';
import { workspaceSandboxPolicy } from '../../../sandbox/workspace.js';
import type { ToolExecutionContext } from '../../../tools/types.js';

/**
 * How a command will be launched: the shell, its arguments, and the isolation
 * plan.
 *
 * Shared so the two ways a command can be started cannot disagree about either
 * of the safety decisions here. A path that composed its own argv would quietly
 * skip the sandbox, which is a real confinement boundary rather than a flag, and
 * the difference would only show up as a command running unjailed.
 */
export function planCommandLaunch(
  command: string,
  context: ToolExecutionContext,
): { shellBin: string; shellArgs: string[]; sandbox: ReturnType<typeof planSandboxedCommand> } {
  const env = ShellManager.getActiveEnvironment()
  const isWindows = process.platform === 'win32'
  const shellBin = env.executionPath
  let shellArgs: string[]

  if (env.activeBackend === 'powershell') {
    shellArgs = ['-NoProfile', '-NonInteractive', '-Command', command]
  } else if (env.activeBackend === 'git-bash' || env.activeBackend === 'bash') {
    shellArgs = ['-c', command]
  } else if (env.activeBackend === 'wsl') {
    shellArgs = ['-e', 'sh', '-c', command]
  } else {
    shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command]
  }
  // OS-level isolation, when it has been turned on. The plan says which of the
  // three states applies, and an unavailable launcher is reported on the result
  // rather than quietly downgraded to no isolation.
  const sandbox = planSandboxedCommand({
    shell: shellBin,
    shellArgs,
    workspaceRoot: context.workspaceRoot,
    ...workspaceSandboxPolicy(context.workspaceRoot, context.workspaceRoots),
  })
  return { shellBin, shellArgs, sandbox }
}
