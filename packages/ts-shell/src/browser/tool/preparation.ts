import path from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import type { ToolExecutionContext, ToolExecutionResult, ToolPreparation } from '../../tools/types.js';
import { selectWorkspaceRoot } from '../../core/workspace/roots.js';
import { verifyPathContainment } from '../../core/security/pathJail.js';
import { bindExecutionTarget, executionWorkspaceKey } from '../../runtime/execution/binding.js';
import { browserSession } from '../session/pool.js';

export interface UploadSource { readonly path: string; readonly root: string; readonly identity: string }
export interface BrowserCall { readonly binding?: string; readonly sources: readonly UploadSource[] }
const prepared = new WeakMap<object, BrowserCall>();

export function browserCall(args: object): BrowserCall | undefined { return prepared.get(args); }

export function verifyBrowserCall(args: Record<string, unknown>, context: ToolExecutionContext): void {
  const call = prepared.get(args);
  if (!call) return;
  executionWorkspaceKey(args, args, context.workspaceRoot);
  const manager = browserSession(context);
  if ((manager.tabs.current ? manager.tabs.binding() : undefined) !== call.binding) throw new Error('The selected browser tab or document changed after approval.');
}

/** Bind every source and the selected document before an execution permission round trip. */
export function prepareBrowserCall(args: Record<string, unknown>, context: ToolExecutionContext, execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult>): ToolPreparation {
  const selected = JSON.parse(JSON.stringify(args)) as Record<string, unknown>;
  bindExecutionTarget(selected, selected, context.workspaceRoot);
  const manager = browserSession(context);
  const action = String(selected.action ?? '').trim().toLowerCase();
  const binding = manager.tabs.current ? manager.tabs.binding() : undefined;
  const sources = action === 'upload' ? uploadSources(selected.files, context) : [];
  const call = Object.freeze({ binding, sources });
  prepared.set(selected, call);
  const preview = ['Browser request', `Action: ${JSON.stringify(action)}`, `Project: ${JSON.stringify(realpathSync(context.workspaceRoot))}`,
    `Selected tab/document: ${binding ?? '(no page open)'}`, `Arguments: ${JSON.stringify(selected)}`,
    ...(sources.length ? ['Complete upload source list (8 MiB total maximum):', ...sources.map((source, index) => `${index + 1}: ${JSON.stringify(source.path)} (read root ${JSON.stringify(source.root)})`)] : []),
    ...(action === 'download' ? ['Explicit URL download: at most 8 MiB transfer and decoded bytes per response, 5 redirects, no browser cookies or credentials.', 'Destination: session artifact storage; exclusive verified publication. Click/blob downloads are unsupported.'] : []),
    'Closing this preview does not approve the browser request.'].join('\n');
  return { targets: [], permissionArgs: Object.freeze(selected), previewKind: 'execution', preview,
    execute: async current => {
      verifyBrowserCall(selected, current);
      return execute(selected, current);
    } };
}

function uploadSources(value: unknown, context: ToolExecutionContext): readonly UploadSource[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4 || value.some(entry => typeof entry !== 'string' || !entry.trim())) throw new Error('Upload requires 1 to 4 source file paths.');
  return Object.freeze(value.map(input => {
    const absolute = path.resolve(context.workspaceRoot, input as string);
    const root = selectWorkspaceRoot(context.workspaceRoot, context.workspaceRoots ?? [], absolute, 'read');
    const checked = verifyPathContainment(absolute, root);
    if (!checked.allowed) throw new Error('Upload source is outside its read grant.');
    context.assertFileAccess?.(absolute); context.assertFileAccess?.(checked.resolvedPath);
    const stats = statSync(checked.resolvedPath, { bigint: true });
    if (!stats.isFile() || stats.size > 8n * 1024n * 1024n) throw new Error('Upload sources must be bounded regular files.');
    return Object.freeze({ path: checked.resolvedPath, root: realpathSync(root), identity: `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}` });
  }));
}

export function verifyUploadSource(source: UploadSource, context: ToolExecutionContext): void {
  const root = selectWorkspaceRoot(context.workspaceRoot, context.workspaceRoots ?? [], source.path, 'read');
  context.assertFileAccess?.(source.path);
  const stats = statSync(source.path, { bigint: true });
  if (realpathSync(root) !== source.root || !stats.isFile() || `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}` !== source.identity) throw new Error('Upload source or grant changed after approval.');
}
