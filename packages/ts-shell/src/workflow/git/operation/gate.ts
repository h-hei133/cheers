import { adaptTools, createToolHooks, type ToolGateOptions } from '../../../turn/tools.js';
import type { AgentMessage } from '../../../core/agent/state.js';
import { nativeGitTool } from './tool.js';
import type { GitPlan, GitOperationResult } from './model.js';
import { NativeGit } from '../read/native.js';
import { publishGitResult } from './publication.js';
import { evaluateToolPermissionScope } from '../../../core/query/toolPolicy.js';

/** Direct UI operations run the very same prepared-tool permission and hooks. */
export async function runNativeGit(git: NativeGit, plan: GitPlan, options: ToolGateOptions, publish: (result: GitOperationResult) => void,
  signal?: AbortSignal): Promise<GitOperationResult> {
  let outcome: GitOperationResult = { status: 'prepared', note: 'Exact Git operation prepared; no write has run.' };
  const notify = (result: GitOperationResult) => { outcome = publishGitResult(result, publish); return outcome; };
  const tool = nativeGitTool(git, plan, notify, absolute => {
    const blocked = options.admission?.(); if (blocked) throw new Error(blocked);
    for (const name of ['write', 'edit', 'read']) {
      const decision = evaluateToolPermissionScope(name, { path: absolute }, options.permissionScope, options.workspaceRoot, options.denyRules);
      if (decision.denied) throw new Error(decision.reason);
    }
  }); const pool = new Map([[tool.name, tool]]);
  const adapted = adaptTools(pool, options)[0]!; const hooks = createToolHooks(options, pool);
  const assistantMessage: AgentMessage = { role: 'assistant', content: [], timestamp: new Date().toISOString() };
  try {
    const args = adapted.prepareArguments!({ command: plan.summary });
    const call = { id: plan.id, name: tool.name, args };
    notify({ status: 'permission-pending', note: 'Exact Git operation awaits its ordinary permission and hooks.' });
    if (outcome.durability) throw new Error('Git preparation could not be durably saved; no operation was dispatched.');
    const denied = await hooks.beforeToolCall!({ call, args, assistantMessage }, signal);
    if (denied?.block) return { ...outcome, note: denied.reason ?? outcome.note };
    options.emit({ type: 'tool.started', toolName: tool.name, taskId: plan.id, args });
    const result = await adapted.execute(plan.id, args, signal);
    await hooks.afterToolCall!({ call, args, assistantMessage, result, isError: result.isError }, signal);
    options.emit({ type: 'tool.result', toolName: tool.name, taskId: plan.id, success: !result.isError, output: result.output });
    return outcome;
  } catch (error) {
    if (outcome.status !== 'unknown' && outcome.status !== 'partial' && outcome.status !== 'succeeded') notify({ status: 'blocked', note: error instanceof Error ? error.message : 'Git gate could not confirm execution.' });
    return outcome;
  }
}
