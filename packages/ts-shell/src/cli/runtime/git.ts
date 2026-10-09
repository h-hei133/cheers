import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import type { ToolDefinition } from '../../tools/types.js';
import { GitWorkbench } from '../../workflow/git/service.js';
import { gitStore, retainGitRecord } from '../../workflow/git/operation/store.js';
import { runNativeGit } from '../../workflow/git/operation/gate.js';
import type { GitOperationResult } from '../../workflow/git/operation/model.js';
import { migrateWorkspaceSession } from '../workspace/migration.js';
import type { CommandContext } from '../../core/commands/types.js';
import { GitCommitIntent } from '../../workflow/git/operation/intent.js';
import { checkoutIdentity, sameCheckout } from '../../workflow/git/worktree/identity.js';
import { assertSourceAccess } from '../../core/query/sourcePolicy.js';

interface GitRuntime { readonly workbench: GitWorkbench; readonly cancel: () => void; readonly tools: () => readonly ToolDefinition[] }
const runtimes = new WeakMap<ShellRuntimeContext, GitRuntime>();
export function installGitRuntime(context: ShellRuntimeContext, manager: SessionManager, runtime: ShellSessionRuntime,
  gate: () => ToolGateOptions): void {
  const store = gitStore(manager, () => context.session);
  let active: AbortController | undefined;
  const intent = new GitCommitIntent(store, () => ({ id: context.session.id, cwd: context.cwd, prompt: manager.getSession(context.session.id)?.turns.at(-1) }));
  const busy = () => runtime.getCurrentRunController() !== null || active !== undefined;
  const workbench = new GitWorkbench({ store, busy, currentRoot: () => context.cwd,
    sourceAccess: absolute => assertSourceAccess(absolute, context.cwd, context.session.workspaceRoots, runtime.getPermissionScope(), context.runtimeConfig.denyRules),
    armCommit: intent.arm.bind(intent),
    binding: { migrate: target => migrateWorkspaceSession(manager, context, target, () => runtime.getCurrentRunController() !== null),
      owns: (target, branch, head) => store.read().worktrees.some(item => item.path === target && sameCheckout(target, item)
        && (!branch || item.branch === branch) && (head === undefined || item.head === head)),
      forget: target => store.write(state => ({ ...state, worktrees: state.worktrees.filter(item => item.path !== target) })),
      remember: (target, branch, head) => store.write(state => ({ ...state, worktrees: [...state.worktrees.filter(item => item.path !== target), { path: target, branch, head, ...checkoutIdentity(target) }] })) },
    execute: async (git, plan) => {
      if (busy()) throw new Error('Another session operation is active.');
      const original = context.session; const root = context.cwd; active = new AbortController();
      const options = gate();
      const publish = (result: GitOperationResult) => {
        const previous = store.read().operations.find(item => item.id === plan.id);
        retainGitRecord(store, { id: plan.id, root: plan.snapshot.root, summary: plan.summary, result,
          ...(previous?.remote ? { remote: previous.remote } : plan.remote ? { remote: plan.remote } : {}) });
      };
      try { return await runNativeGit(git, plan, { ...options, admission: () => options.admission?.()
        ?? (context.session !== original || context.cwd !== root ? 'Session changed after Git preparation.' : undefined) }, publish, active.signal); }
      finally { active = undefined; }
    } });
  runtimes.set(context, { workbench, cancel: () => active?.abort(), tools: () => intent.tools(workbench.git()) });
}
export function gitWorkbenchFor(context: ShellRuntimeContext): GitWorkbench | undefined { return runtimes.get(context)?.workbench; }
export function gitCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['gitCommand']> {
  return (args, commandContext) => gitWorkbenchFor(context)?.command(args, commandContext) ?? Promise.resolve({ kind: 'local', output: 'Git workbench requires a bound session runtime.' });
}
export function worktreeCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['worktreeCommand']> {
  return args => gitWorkbenchFor(context)?.worktree(args) ?? Promise.resolve({ kind: 'local', output: 'Worktree operation requires a bound session runtime.' });
}
export function commitCommandFor(context: ShellRuntimeContext): NonNullable<CommandContext['commitCommand']> {
  return args => gitWorkbenchFor(context)?.commit(args.join(' ')) ?? Promise.resolve({ kind: 'local', output: 'Commit requires a bound session runtime.' });
}
export function cancelGitFor(context: ShellRuntimeContext): void { runtimes.get(context)?.cancel(); }
export function gitFeatureTools(context: ShellRuntimeContext): readonly ToolDefinition[] { return runtimes.get(context)?.tools() ?? []; }
