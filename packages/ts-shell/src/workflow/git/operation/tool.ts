import type { ToolDefinition, ToolExecutionContext } from '../../../tools/types.js';
import type { GitPlan, GitOperationResult } from './model.js';
import { NativeGit } from '../read/native.js';
import { executeGitPlan } from './execute.js';
import { publishGitResult } from './publication.js';

/** A native prepared command reuses bash's existing permission/deny semantics. */
export function nativeGitTool(git: NativeGit, plan: GitPlan, publish: (result: GitOperationResult) => GitOperationResult | void, checkNativeTarget?: (absolute: string) => void): ToolDefinition {
  return { name: 'bash', description: 'Execute this exact native Git operation after ordinary command approval.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['command'], properties: { command: { const: plan.summary } } },
    onRefusal: (_args, _context, status) => { publishGitResult({ status: status === 'denied' ? 'denied' : 'blocked', note: `Git operation ${status}; no target effect was authorized.` }, publish); },
    prepare: (_args, context) => {
      if (context.workspaceRoot !== git.root) throw new Error('Git operation runtime root changed.');
      for (const source of plan.sources ?? []) context.assertSourceAccess?.(source);
      for (const target of plan.nativeTargets ?? []) checkNativeTarget?.(target);
      return Object.freeze({ targets: [], permissionArgs: { command: plan.summary }, previewKind: 'execution' as const, preview: plan.preview,
        execute: async (actual: ToolExecutionContext) => {
          let result: GitOperationResult;
          try {
            for (const source of plan.sources ?? []) actual.assertSourceAccess?.(source);
            for (const target of plan.nativeTargets ?? []) checkNativeTarget?.(target);
            for (const target of plan.targets) actual.assertFileAccess?.(target);
            result = await executeGitPlan(git, plan, actual.abortSignal);
          } catch (error) {
            result = { status: 'blocked', note: error instanceof Error ? error.message : 'Git operation refused before verified execution.' };
          }
          result = publishGitResult(result, publish);
          return { success: result.status === 'succeeded', output: result.note, metadata: { gitOperation: { id: plan.id, ...result } } };
        } });
    }, async execute() { throw new Error('Native Git requires its original prepared command and approval.'); } };
}
