import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { createShellToolDefinition } from '../../../core/tools/shell/tool.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { SessionManager } from '../../../session/SessionManager.js';
import { runPreparedTool } from '../../../turn/invoke.js';
import type { ToolGateOptions } from '../../../turn/tools.js';
import { captureShellHistory } from './history.js';
import { shellResult, type ShellResult } from './result.js';

interface ShellRuntime {
  readonly run: (command: string, excludeFromContext?: boolean) => Promise<ShellResult>;
  readonly abort: () => void;
  readonly isRunning: () => boolean;
}
const runtimes = new WeakMap<ShellRuntimeContext, ShellRuntime>();

/** Direct shell work shares the session command owner and the ordinary tool gate. */
export function installShellRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: (tool?: string) => ToolGateOptions): void {
  const tool = createShellToolDefinition(createDefaultExecutionService(), { combinedOutput: true });
  let owned: AbortController | undefined;
  runtimes.set(context, {
    run(command, excludeFromContext = false) {
      if (!command.trim()) return Promise.reject(new Error('Shell command cannot be empty.'));
      if (Buffer.byteLength(command) > 64 * 1024) return Promise.reject(new Error('Shell command exceeds 64 KiB.'));
      if (runtime.isRunning()) return Promise.reject(new Error('A session operation is still running.'));
      const history = captureShellHistory(context, manager);
      const options = gate('bash');
      if (runtime.isRunning()) return Promise.reject(new Error('A session operation is still running.'));
      const settled = runtime.commands.run(async signal => {
        const controller = owned!;
        const cancel = () => controller.abort();
        history.background.addEventListener('abort', cancel, { once: true });
        if (history.background.aborted) cancel();
        let started = false, denied = false;
        try {
          const result = await runPreparedTool(tool, { command }, { ...options, background: undefined,
            sessionId: history.sessionId, workspaceRoot: history.cwd,
            admission: () => (signal.aborted ? 'Shell command cancelled.' : undefined) ?? history.admission() ?? options.admission?.(),
            emit: event => {
              if (event.type === 'tool.started') started = true;
              if (event.type === 'approval.resolved' && event.outcome === 'denied') denied = true;
              history.emit(event);
            },
          }, signal, undefined, 'Shell command');
          const output = shellResult(result, { cancelled: signal.aborted, started, denied, excludeFromContext });
          return { ...output, historySaved: history.save(command, output) };
        } finally { history.background.removeEventListener('abort', cancel); }
      });
      const controller = runtime.commands.current!.controller;
      owned = controller;
      return settled.finally(() => { if (owned === controller) owned = undefined; });
    },
    abort: () => owned?.abort(),
    isRunning: () => owned !== undefined && runtime.commands.current?.controller === owned,
  });
}

export function shellRuntimeFor(context: ShellRuntimeContext): ShellRuntime | undefined { return runtimes.get(context); }
