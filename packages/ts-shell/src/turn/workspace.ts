import fs from 'node:fs';
import path from 'node:path';
import { verifyPathContainment } from '../core/security/pathJail.js';
import { parsePathSelector } from '../core/tools/selectorParser.js';
import { assertWorkspaceRoot, captureWorkspaceRoot, resolveWorkspaceRoot } from '../core/workspace/roots.js';
import type { WorkspaceRoot } from '../core/workspace/model.js';
import { parsePatch } from '../edit/patch/parse.js';

interface WorkspaceGate {
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
}
interface Target {
  readonly selection: string;
  readonly canonical: string;
  readonly root: WorkspaceRoot;
  readonly directory: boolean;
}
interface Access {
  readonly owner: object;
  readonly name: string;
  readonly selection: string;
  readonly targets: readonly Target[];
  callId?: string;
  retired?: boolean;
}
// These roots belong to one native call. They never enter saved session grants or command sandboxes.
const calls = new WeakMap<object, Access>();

function externalTarget(selection: string, primary: string, access: WorkspaceRoot['access']): Target {
  if (!path.isAbsolute(selection)) throw new Error('Relative paths cannot escape the workspace. Use an absolute path to request access elsewhere.');
  if (!selection.trim() || selection.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(selection)) throw new Error('File access path is invalid.');
  let directory = false;
  try { directory = fs.statSync(selection).isDirectory(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  let ancestor = directory ? selection : path.dirname(selection);
  for (;;) {
    try {
      const root = captureWorkspaceRoot(ancestor, primary, access);
      const checked = verifyPathContainment(selection, root.path);
      if (!checked.allowed) throw new Error('File access target could not be verified.');
      // A dangling link must not be mistaken for a missing file.
      try { if (fs.lstatSync(selection).isSymbolicLink()) throw new Error('File access targets cannot be symbolic links.'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      return Object.freeze({ selection: path.resolve(selection), canonical: checked.resolvedPath, root, directory });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try { fs.lstatSync(ancestor); throw new Error('File access parent could not be verified.'); }
      catch (probe) { if ((probe as NodeJS.ErrnoException).code !== 'ENOENT') throw probe; }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
}

/** Capture before patch preflight, which may read files but cannot execute a call. */
export function captureFileAccess(name: string, args: Record<string, unknown>, options: WorkspaceGate): void {
  if (calls.has(args)) { fileAccessOptions(name, args, options); return; }
  const names = name === 'apply_patch' && typeof args.input === 'string'
    ? parsePatch(args.input).flatMap(operation => operation.kind === 'move' ? [operation.path, operation.moveTo] : [operation.path])
    : ['read', 'write', 'edit'].includes(name) && typeof args.path === 'string'
      ? [name === 'read' ? parsePathSelector(args.path).cleanPath : args.path] : [];
  const access = name === 'read' ? 'read' : 'write';
  const targets: Target[] = [];
  for (const selected of new Set(names)) {
    if (selected.startsWith('artifact://')) continue;
    if (resolveWorkspaceRoot(options.workspaceRoot, options.workspaceRoots ?? [], selected, access) !== undefined) continue;
    targets.push(externalTarget(selected, options.workspaceRoot, access));
  }
  if (targets.length) calls.set(args, { owner: options, name, selection: JSON.stringify(args), targets: Object.freeze(targets) });
}

export function bindFileAccess(original: object, prepared: object): void {
  const access = calls.get(original);
  if (access) calls.set(prepared, access);
}

/** Recheck the original spelling and directory identity before each read or write boundary. */
export function fileAccessOptions<T extends WorkspaceGate>(name: string, args: Record<string, unknown>, options: T, target?: string): T {
  const access = calls.get(args);
  if (!access) return options;
  if (access.retired || access.owner !== options || access.name !== name || access.selection !== JSON.stringify(args)) throw new Error('File access approval belongs to another call.');
  for (const captured of access.targets) {
    assertWorkspaceRoot(captured.root);
    const current = verifyPathContainment(captured.selection, captured.root.path);
    if (!current.allowed || current.resolvedPath !== captured.canonical) throw new Error('File access target changed after preparation.');
  }
  if (target !== undefined && resolveWorkspaceRoot(options.workspaceRoot, options.workspaceRoots ?? [], target, name === 'read' ? 'read' : 'write') === undefined
    && !access.targets.some(captured => path.resolve(target) === captured.canonical || path.resolve(target) === captured.selection
      || name === 'read' && captured.directory && path.resolve(target) === captured.root.path
      || name === 'read' && captured.directory && path.dirname(path.resolve(target)) === captured.canonical)) {
    throw new Error('File access approval does not cover this target.');
  }
  const roots = [...options.workspaceRoots ?? []];
  for (const captured of access.targets) if (!roots.some(root => root.path === captured.root.path)) roots.push(captured.root);
  return { ...options, workspaceRoots: roots };
}

export function fileAccessPrompt(args: object): string | undefined {
  const access = calls.get(args);
  return access?.targets.map(target => `${JSON.stringify(target.canonical)} (directory ${JSON.stringify(target.root.path)})`).join(', ');
}

/** Writers keep canonical paths inside their selected jail; approval still rechecks the original alias. */
export function fileAccessArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const access = calls.get(args);
  if (!access || typeof args.path !== 'string') return args;
  const clean = name === 'read' ? parsePathSelector(args.path).cleanPath : args.path;
  const captured = access.targets.find(target => target.selection === path.resolve(clean));
  return captured ? { ...args, path: captured.canonical + (name === 'read' ? args.path.trim().slice(clean.length) : '') } : args;
}

export function authorizeFileAccess(args: object, callId: string): void {
  const access = calls.get(args);
  if (access) {
    if (access.callId) throw new Error('File access approval was already used.');
    access.callId = callId;
  }
}

export function requireFileAccess(args: object, callId: string): void {
  const access = calls.get(args);
  if (access && access.callId !== callId) throw new Error('This external file call requires its own approval.');
}

export function forgetFileAccess(args: object): void {
  const access = calls.get(args);
  if (access) access.retired = true;
  calls.delete(args);
}
