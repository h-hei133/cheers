import path from 'node:path';
import { captureWorkspaceRoot, selectWorkspaceRoot } from '../../core/workspace/roots.js';
import type { WorkspaceRoot } from '../../core/workspace/model.js';
import { inspectWorkspaceFile, workspaceFilePath } from '../authority/state.js';
import { hashContent } from '../authority/content.js';
import { captureOperationScope } from '../recovery/operation/store.js';
import type { OperationScope, PreparedFile } from '../recovery/operation/model.js';
import { applyHunks } from './apply.js';
import { parsePatch, patchLimits } from './parse.js';
import type { PatchFileOperation, PatchHunk } from './types.js';

/** One independently selectable unit of a patch. */
export interface PatchGroup {
  /** Content-derived and stable for the same operation against the same base. */
  readonly id: string;
  readonly label: string;
  readonly files: readonly string[];
  readonly operationIndex: number;
  /** Present when this group is one independently selectable update hunk. */
  readonly hunkIndexes?: readonly number[];
}

export interface PatchPlan {
  readonly scope: OperationScope;
  readonly files: readonly PreparedFile[];
  readonly revision: string;
  /** Revision of every group; a subset selection keeps this value. */
  readonly fullRevision: string;
  readonly groups: readonly PatchGroup[];
  /** Group ids this plan applied; empty when no selection was requested. */
  readonly selected: readonly string[];
}

function canApplyHunks(content: string, hunks: readonly PatchHunk[]): boolean {
  try {
    applyHunks(content, hunks);
    return true;
  } catch {
    return false;
  }
}

function groupHunks(content: string, hunks: readonly PatchHunk[]): readonly (readonly number[])[] {
  const groups: number[][] = [];
  for (let index = 0; index < hunks.length; index++) {
    if (groups.length === 0) {
      groups.push([index]);
      continue;
    }
    const last = groups[groups.length - 1]!;
    const lastValid = canApplyHunks(content, last.map(candidateIndex => hunks[candidateIndex]!));
    const aloneValid = canApplyHunks(content, [hunks[index]!]);
    if (lastValid && aloneValid) {
      groups.push([index]);
      continue;
    }
    let merged = false;
    for (let groupIndex = groups.length - 1; groupIndex >= 0; groupIndex--) {
      const candidate = [...groups[groupIndex]!, index].sort((left, right) => left - right);
      if (!canApplyHunks(content, candidate.map(candidateIndex => hunks[candidateIndex]!))) continue;
      groups[groupIndex] = candidate;
      merged = true;
      break;
    }
    if (!merged) {
      // If no smaller closure is independently applicable, keep the dependency
      // atomic rather than offering a selection that can only fail after approval.
      const candidate = [...groups.flat(), index];
      if (!canApplyHunks(content, candidate.map(candidateIndex => hunks[candidateIndex]!))) {
        throw new Error('Patch hunk dependencies cannot be represented as an independently selectable group.');
      }
      groups.splice(0, groups.length, candidate);
    }
  }
  return groups.map(group => Object.freeze(group));
}

export function planPatch(input: string, context: {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly assertFileAccess?: (absolutePath: string) => void;
}, selection?: readonly string[]): PatchPlan {
  const scope = captureOperationScope(context);
  const paths = new Set<string>();
  const objects = new Set<string>();
  let bytes = 0;
  const target = (name: string) => {
    const absolute = path.resolve(scope.workspace.path, name);
    const root = selectWorkspaceRoot(scope.workspace.path, context.workspaceRoots ?? [], absolute, 'write');
    const workspace = captureWorkspaceRoot(root, root, 'write');
    const relative = path.relative(root, absolute);
    const canonical = workspaceFilePath(root, relative);
    context.assertFileAccess?.(absolute);
    // Conservatively reject case/normalization aliases even on case-sensitive volumes.
    const key = canonical.normalize('NFC').toLowerCase();
    if ([...paths].some(other => key === other || key.startsWith(other + path.sep) || other.startsWith(key + path.sep))) {
      throw new Error('Patch contains duplicate or overlapping targets.');
    }
    paths.add(key);
    const before = Object.freeze(inspectWorkspaceFile(root, relative, context.assertFileAccess, patchLimits.fileBytes));
    if (before.state === 'exists') {
      if (objects.has(before.identity)) throw new Error('Patch contains multiple paths to the same file.');
      if (before.content.includes('\0')) throw new Error('Binary patch targets are not supported.');
      objects.add(before.identity);
      bytes += Buffer.byteLength(before.content);
      if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
    }
    return { workspaceRoot: root, workspaceIdentity: workspace.identity, relativePath: relative, before };
  };
  type Target = ReturnType<typeof target>;
  interface Entry {
    readonly operation: PatchFileOperation;
    readonly groups: readonly PatchGroup[];
    readonly files: readonly PreparedFile[];
    readonly source?: Target;
  }
  const entries: Entry[] = [];
  for (const [operationIndex, operation] of parsePatch(input).entries()) {
    const source = target(operation.path);
    if (operation.kind === 'add') {
      if (source.before.state !== 'absent') throw new Error('Add File target already exists.');
      const prepared = { ...source, content: operation.content };
      const group = Object.freeze({
        id: hashContent(JSON.stringify({ kind: operation.kind, path: operation.path })).slice(0, 12),
        label: `Add ${operation.path}`,
        files: Object.freeze([path.join(source.workspaceRoot, source.relativePath)]),
        operationIndex,
      });
      entries.push({ operation, groups: [group], files: [prepared] });
    } else {
      if (source.before.state !== 'exists') throw new Error('Patch source file is missing.');
      if (operation.kind === 'delete') {
        const prepared = { ...source, content: undefined };
        const group = Object.freeze({
          id: hashContent(JSON.stringify({ kind: operation.kind, path: operation.path })).slice(0, 12),
          label: `Delete ${operation.path}`,
          files: Object.freeze([path.join(source.workspaceRoot, source.relativePath)]),
          operationIndex,
        });
        entries.push({ operation, groups: [group], files: [prepared] });
      }
      else {
        const content = applyHunks(source.before.content, operation.hunks);
        if (operation.kind === 'move') {
          const destination = target(operation.moveTo);
          if (destination.workspaceRoot !== source.workspaceRoot || destination.before.state !== 'absent') throw new Error('Rename requires an absent target in the same workspace.');
          const rename = Object.freeze({ source: source.relativePath, target: destination.relativePath });
          const prepared = [{ ...destination, content, mode: source.before.mode & 0o777, rename }, { ...source, content: undefined, rename }];
          const group = Object.freeze({
            id: hashContent(JSON.stringify({ kind: operation.kind, path: operation.path, moveTo: operation.moveTo, hunks: operation.hunks })).slice(0, 12),
            label: `Move ${operation.path} to ${operation.moveTo}`,
            files: Object.freeze(prepared.map(file => path.join(file.workspaceRoot, file.relativePath))),
            operationIndex,
          });
          entries.push({ operation, groups: [group], files: prepared, source });
        } else {
          const prepared = content !== source.before.content ? [{ ...source, content }] : [];
          const groups = groupHunks(source.before.content, operation.hunks).map((hunkIndexes) => {
            const first = hunkIndexes[0]! + 1;
            const label = hunkIndexes.length === 1
              ? operation.hunks.length === 1
                ? `Update ${operation.path} (1 hunk)`
                : `Update ${operation.path} (hunk ${first}/${operation.hunks.length})`
              : `Update ${operation.path} (hunks ${hunkIndexes.map(index => index + 1).join(",")}/${operation.hunks.length})`;
            return Object.freeze({
              id: hashContent(JSON.stringify({ kind: operation.kind, path: operation.path, hunkIndexes })).slice(0, 12),
              label,
              files: Object.freeze([path.join(source.workspaceRoot, source.relativePath)]),
              operationIndex,
              hunkIndexes,
            });
          });
          entries.push({ operation, groups, files: prepared, source });
        }
      }
    }
  }
  const files = entries.flatMap(entry => entry.files);
  for (const file of files) {
    const size = file.content === undefined ? 0 : Buffer.byteLength(file.content);
    if (size > patchLimits.fileBytes) throw new Error('Planned patch file exceeds the size limit.');
    bytes += size;
  }
  if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
  const planned = files.map(file => Object.freeze({ ...file,
    maxBytes: Math.max(file.before.state === 'exists' ? Buffer.byteLength(file.before.content) : 0,
      file.content === undefined ? 0 : Buffer.byteLength(file.content)),
    mode: file.content === undefined ? undefined : file.mode ?? (file.before.state === 'exists' ? file.before.mode & 0o777 : 0o666 & ~process.umask()) }));
  const fullRevision = hashContent(JSON.stringify({ scope, files: planned }));
  const groups = Object.freeze(entries.flatMap(entry => entry.groups));
  const selected = selection === undefined ? Object.freeze([] as string[])
    : Object.freeze([...new Set(selection)]);
  if (selection !== undefined) {
    if (selected.length === 0) throw new Error('Patch selection is empty; choose at least one group.');
    const known = new Set(groups.map(group => group.id));
    const unknown = selected.find(id => !known.has(id));
    if (unknown !== undefined) throw new Error(`Patch selection ${unknown} is stale or unknown; re-plan before applying.`);
    const chosen = new Set(selected);
    const kept = entries.flatMap(entry => {
      const selectedGroups = entry.groups.filter(group => chosen.has(group.id));
      if (!selectedGroups.length) return [];
      const operation = entry.operation;
      const source = entry.source;
      if (operation.kind !== 'update' || !source || source.before.state !== 'exists') return entry.files;
      const hunkIndexes = selectedGroups.flatMap(group => group.hunkIndexes ?? []).sort((left, right) => left - right);
      const content = applyHunks(source.before.content, hunkIndexes.map(index => operation.hunks[index]!));
      return content !== source.before.content ? [{ ...source, content }] : [];
    });
    for (const file of kept) {
      const size = file.content === undefined ? 0 : Buffer.byteLength(file.content);
      if (size > patchLimits.fileBytes) throw new Error('Planned patch file exceeds the size limit.');
    }
    const keptBytes = kept.reduce((total, file) => total + (file.content === undefined ? 0 : Buffer.byteLength(file.content)), 0);
    if (keptBytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
    const selectedPlanned = kept.map(file => Object.freeze({ ...file,
      maxBytes: Math.max(file.before.state === 'exists' ? Buffer.byteLength(file.before.content) : 0,
        file.content === undefined ? 0 : Buffer.byteLength(file.content)),
      mode: file.content === undefined ? undefined : file.mode ?? (file.before.state === 'exists' ? file.before.mode & 0o777 : 0o666 & ~process.umask()) }));
    const revision = hashContent(JSON.stringify({ scope, files: selectedPlanned }));
    return Object.freeze({ scope, revision, fullRevision, files: Object.freeze(selectedPlanned), groups, selected });
  }
  return Object.freeze({ scope, revision: fullRevision, fullRevision, files: Object.freeze(planned), groups, selected });
}

/**
 * Rebuild only the selected operations against their current sources.
 *
 * The full plan remains the approval baseline for the group identities, but an
 * unselected file is not read or matched here. That keeps a later edit to an
 * unselected target from invalidating an otherwise exact selected subset.
 */
export function planPatchSelection(input: string, context: {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly workspaceRoots?: readonly WorkspaceRoot[];
  readonly assertFileAccess?: (absolutePath: string) => void;
}, selection: readonly string[], base: PatchPlan): PatchPlan {
  const selected = Object.freeze([...new Set(selection)]);
  if (selected.length === 0) throw new Error('Patch selection is empty; choose at least one group.');
  const known = new Set(base.groups.map(group => group.id));
  const unknown = selected.find(id => !known.has(id));
  if (unknown !== undefined) throw new Error(`Patch selection ${unknown} is stale or unknown; re-plan before applying.`);
  const chosen = new Set(selected);
  const operations = parsePatch(input);
  const paths = new Set<string>();
  const objects = new Set<string>();
  let bytes = 0;
  const target = (name: string) => {
    const absolute = path.resolve(base.scope.workspace.path, name);
    const root = selectWorkspaceRoot(base.scope.workspace.path, context.workspaceRoots ?? [], absolute, 'write');
    const workspace = captureWorkspaceRoot(root, root, 'write');
    const relative = path.relative(root, absolute);
    const canonical = workspaceFilePath(root, relative);
    context.assertFileAccess?.(absolute);
    const key = canonical.normalize('NFC').toLowerCase();
    if ([...paths].some(other => key === other || key.startsWith(other + path.sep) || other.startsWith(key + path.sep))) {
      throw new Error('Patch contains duplicate or overlapping targets.');
    }
    paths.add(key);
    const before = Object.freeze(inspectWorkspaceFile(root, relative, context.assertFileAccess, patchLimits.fileBytes));
    if (before.state === 'exists') {
      if (objects.has(before.identity)) throw new Error('Patch contains multiple paths to the same file.');
      if (before.content.includes('\0')) throw new Error('Binary patch targets are not supported.');
      objects.add(before.identity);
      bytes += Buffer.byteLength(before.content);
      if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
    }
    return { workspaceRoot: root, workspaceIdentity: workspace.identity, relativePath: relative, before };
  };

  const files: PreparedFile[] = [];
  for (const [operationIndex, operation] of operations.entries()) {
    const selectedGroups = base.groups.filter(group => group.operationIndex === operationIndex && chosen.has(group.id));
    if (selectedGroups.length === 0) continue;
    if (operation.kind === 'update') {
      const source = target(operation.path);
      if (source.before.state !== 'exists') throw new Error('Patch source file is missing.');
      const hunkIndexes = selectedGroups.flatMap(group => group.hunkIndexes ?? []).sort((left, right) => left - right);
      const content = applyHunks(source.before.content, hunkIndexes.map(index => operation.hunks[index]!));
      if (content !== source.before.content) files.push({ ...source, content });
      continue;
    }

    const source = target(operation.path);
    if (operation.kind === 'add' && source.before.state !== 'absent') throw new Error('Add File target already exists.');
    if (operation.kind === 'delete' && source.before.state !== 'exists') throw new Error('Patch source file is missing.');
    if (operation.kind === 'move') {
      if (source.before.state !== 'exists') throw new Error('Patch source file is missing.');
      const destination = target(operation.moveTo);
      if (destination.workspaceRoot !== source.workspaceRoot || destination.before.state !== 'absent') {
        throw new Error('Rename requires an absent target in the same workspace.');
      }
    }
    const selectedPaths = new Set(selectedGroups.flatMap(group => group.files));
    const selectedFiles = base.files.filter(file => selectedPaths.has(path.join(file.workspaceRoot, file.relativePath)));
    if (selectedFiles.length === 0) throw new Error('Patch selection does not resolve to a prepared file.');
    files.push(...selectedFiles);
  }

  for (const file of files) {
    const size = file.content === undefined ? 0 : Buffer.byteLength(file.content);
    if (size > patchLimits.fileBytes) throw new Error('Planned patch file exceeds the size limit.');
    bytes += size;
  }
  if (bytes > patchLimits.totalBytes) throw new Error('Patch batch exceeds its total size limit.');
  const planned = files.map(file => Object.freeze({ ...file,
    maxBytes: Math.max(file.before.state === 'exists' ? Buffer.byteLength(file.before.content) : 0,
      file.content === undefined ? 0 : Buffer.byteLength(file.content)),
    mode: file.content === undefined ? undefined : file.mode ?? (file.before.state === 'exists' ? file.before.mode & 0o777 : 0o666 & ~process.umask()) }));
  const revision = hashContent(JSON.stringify({ scope: base.scope, files: planned }));
  return Object.freeze({ scope: base.scope, revision, fullRevision: base.fullRevision,
    files: Object.freeze(planned), groups: base.groups, selected });
}
