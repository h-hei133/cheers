import { realpathSync, statSync } from 'node:fs';

interface ExecutionBinding { readonly root: string; readonly identity: string; readonly selection: string }
const bindings = new WeakMap<object, ExecutionBinding>();

function rootBinding(selection: unknown, root: string): ExecutionBinding {
  const canonical = realpathSync(root);
  const stats = statSync(canonical, { bigint: true });
  if (!stats.isDirectory()) throw new Error('Execution workspace must be an existing directory.');
  return { root: canonical, identity: `${stats.dev}:${stats.ino}:${stats.birthtimeMs}`, selection: JSON.stringify(selection) };
}

/** Capture the exact executable arguments and canonical cwd before the approval round trip. */
export function bindExecutionTarget(owner: object, selection: unknown, root: string): void {
  bindings.set(owner, Object.freeze(rootBinding(selection, root)));
}

export function executionWorkspace(owner: object, selection: unknown, root: string): string {
  return verifiedExecutionBinding(owner, selection, root).root;
}

export function executionWorkspaceKey(owner: object, selection: unknown, root: string): string {
  const binding = verifiedExecutionBinding(owner, selection, root);
  return JSON.stringify([binding.root, binding.identity]);
}

function verifiedExecutionBinding(owner: object, selection: unknown, root: string): ExecutionBinding {
  const before = bindings.get(owner);
  const current = rootBinding(selection, root);
  if (before && (before.root !== current.root || before.identity !== current.identity || before.selection !== current.selection)) {
    throw new Error('Executable arguments or workspace changed after approval.');
  }
  return before ?? current;
}

export function executionApprovalPreview(owner: object, selection: unknown, root: string): string {
  const target = JSON.parse(executionApprovalTarget(owner, selection, root)) as { executable: string; args: unknown[]; workspaceRoot: string };
  return ['Execution request', `Executable: ${JSON.stringify(target.executable)}`, 'Arguments (literal values, in order):',
    ...target.args.map((arg, index) => `${index + 1}: ${JSON.stringify(arg)}`), `Working directory: ${JSON.stringify(target.workspaceRoot)}`,
    'This starts executable code with OS process permissions. File-result checks do not sandbox the server or its plugins.',
    'Closing this preview does not approve execution.'].join('\n');
}

export function executionApprovalTarget(owner: object, selection: unknown, root: string): string {
  const selected = selection && typeof selection === 'object' ? selection as Record<string, unknown> : {};
  let canonical: string;
  try { canonical = bindings.get(owner)?.root ?? realpathSync(root); } catch { canonical = root; }
  return JSON.stringify({ executable: selected.command ?? '(no executable selected)', args: selected.args ?? [], workspaceRoot: canonical });
}
