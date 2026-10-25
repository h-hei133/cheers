import path from 'node:path';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { configurationAdmission } from '../../core/shell/configuration.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';
import { captureWorkspaceRoot, selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { inspectWorkspaceFile, inspectWorkspaceFileAsync, type FileState } from '../../core/workspace/files.js';

const gates = new WeakMap<ShellRuntimeContext, (tool?: string) => ToolGateOptions>();

export function installCommandGate(context: ShellRuntimeContext, gate: (tool?: string) => ToolGateOptions): void {
  gates.set(context, gate);
}

export function commandGateFor(context: ShellRuntimeContext): ((tool?: string) => ToolGateOptions) | undefined {
  return gates.get(context);
}

/** Capture read authority without acquiring content; refresh grants at every check. */
export function sourceAccessFor(context: ShellRuntimeContext, signal?: AbortSignal): (absolute: string) => void {
  const sessionId = context.session.id;
  const cwd = context.cwd;
  const root = captureWorkspaceRoot(cwd, cwd, 'read');
  const configured = configurationAdmission(context);
  return absolute => {
    const gate = gates.get(context);
    if (!gate) throw new Error('The source-read permission owner is unavailable.');
    const options = gate('read');
    const refusal = configured() ?? options.admission?.();
    if (refusal) throw new Error(refusal);
    signal?.throwIfAborted();
    if (context.session.id !== sessionId || context.cwd !== cwd || captureWorkspaceRoot(cwd, cwd, 'read').identity !== root.identity) {
      throw new Error('The source-read session or workspace changed.');
    }
    assertSourceAccess(absolute, cwd, context.session.workspaceRoots, options.permissionScope, [...context.runtimeConfig.denyRules, ...options.denyRules ?? []]);
  };
}

function sourceTarget(context: ShellRuntimeContext, target: string, maxBytes: number, check: (absolute: string) => void) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 2 * 1024 * 1024) throw new Error('Invalid source size limit.');
  const absolute = path.resolve(context.cwd, target); check(absolute);
  const selected = selectWorkspaceRoot(context.cwd, context.session.workspaceRoots ?? [], absolute, 'read');
  return { absolute, selected, relative: path.relative(selected, absolute) };
}

/** Synchronous command callers retain the same bounded reader contract. */
export function sourceReaderFor(context: ShellRuntimeContext, signal?: AbortSignal): (target: string, maxBytes: number) => FileState {
  const check = sourceAccessFor(context, signal);
  return (target, maxBytes) => {
    const { absolute, selected, relative } = sourceTarget(context, target, maxBytes, check);
    const file = inspectWorkspaceFile(selected, relative, check, maxBytes);
    check(absolute);
    return file;
  };
}

/** Interactive verification reuses the asynchronous inspection owner and its settlement. */
export function sourceReaderForAsync(context: ShellRuntimeContext, signal?: AbortSignal): (target: string, maxBytes: number) => Promise<FileState> {
  const check = sourceAccessFor(context, signal);
  return async (target, maxBytes) => {
    const { absolute, selected, relative } = sourceTarget(context, target, maxBytes, check);
    const file = await inspectWorkspaceFileAsync(selected, relative, check, maxBytes, undefined, signal);
    check(absolute);
    return file;
  };
}
