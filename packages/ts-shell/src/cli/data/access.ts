import path from 'node:path';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { captureWorkspaceRoot, selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { inspectWorkspaceFile, type FileState } from '../../core/workspace/files.js';

const gates = new WeakMap<ShellRuntimeContext, (tool?: string) => ToolGateOptions>();

export function installCommandGate(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions): void {
  gates.set(context, gate);
}

export function commandGateFor(context: ShellRuntimeContext): ((tool?: string) => ToolGateOptions) | undefined {
  return gates.get(context);
}

/** Capture one read authority; every opened object is checked against current grants. */
export function sourceReaderFor(context: ShellRuntimeContext, signal?: AbortSignal): (target: string, maxBytes: number) => FileState {
  const sessionId = context.session.id;
  const cwd = context.cwd;
  const root = captureWorkspaceRoot(cwd, cwd, 'read');
  const configured = configurationAdmission(context);
  return (target, maxBytes) => {
    const gate = gates.get(context);
    if (!gate) throw new Error('The source-read permission owner is unavailable.');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024) throw new Error('Invalid source size limit.');
    const options = gate('read');
    const check = (absolute: string) => {
      const refusal = configured() ?? options.admission?.();
      if (refusal) throw new Error(refusal);
      signal?.throwIfAborted();
      if (context.session.id !== sessionId || context.cwd !== cwd || captureWorkspaceRoot(cwd, cwd, 'read').identity !== root.identity) {
        throw new Error('The source-read session or workspace changed.');
      }
      assertSourceAccess(absolute, cwd, context.session.workspaceRoots, options.permissionScope, [...context.runtimeConfig.denyRules, ...options.denyRules ?? []]);
    };
    const absolute = path.resolve(cwd, target);
    const selected = selectWorkspaceRoot(cwd, context.session.workspaceRoots ?? [], absolute, 'read');
    const file = inspectWorkspaceFile(selected, path.relative(selected, absolute), check, maxBytes);
    check(absolute);
    return file;
  };
}
