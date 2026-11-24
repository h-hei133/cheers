import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyEdits, modify } from 'jsonc-parser';
import { editDiff } from '../../../edit/result/diff.js';
import { configParserText, parseConfigText } from '../../../config/syntax.js';
import { patchConfigDocument } from '../../../config/patch.js';
import { bundledHookDeclarations } from '../../../core/hooks/assets.js';
import { createDefaultExecutionService } from '../../../runtime/execution/service.js';
import type { FileState } from '../../../core/workspace/files.js';
import { inspectWorkspaceFile } from '../../../core/workspace/files.js';
import { isRecord } from '../../../core/values/record.js';
import { applyHunks } from '../../../edit/patch/apply.js';
import { parsePatch, patchLimits } from '../../../edit/patch/parse.js';
import { matchesFileState } from '../../../edit/authority/state.js';
import { splitByteOrderMark } from '../../../runtime/execution/fileText.js';
import { readInitializer } from './asset.js';
import { captureArchitectureSource } from './snapshot.js';

const CONFIG = '.normproof';
const HOOKS = '.agents/hooks.json';
const GENERATED = [`${CONFIG}/evidence-manifest.json`, `${CONFIG}/judge-input.json`, `${CONFIG}/write-rules.json`,
  `${CONFIG}/norm-packs/software-structure-v0/profile.json`, `${CONFIG}/.gitignore`] as const;
const BASELINE = `${CONFIG}/baseline.json`;
const GUIDANCE = 'AGENTS.md';
export const ARCHITECTURE_LIMIT = 128 * 1024;

type Reader = (target: string, maxBytes: number) => FileState;
type PlannedFile = { readonly path: string; readonly before: FileState; readonly after: string };
export interface ArchitecturePlan {
  readonly args: { readonly input: string; readonly expectedHashes: Record<string, string> };
  readonly files: readonly PlannedFile[];
  readonly preview: string;
  readonly verifySources: () => void;
  readonly verifyDestinations: () => void;
}

/** Run the pinned generator in a private snapshot, then return only exact text changes. */
export async function planArchitecture(root: string, access: (file: string) => void, read: Reader,
  signal?: AbortSignal): Promise<ArchitecturePlan> {
  const destinations = new Map([...GENERATED, BASELINE, GUIDANCE, HOOKS].map(relative =>
    [relative, read(path.join(root, relative), ARCHITECTURE_LIMIT)] as const));
  for (const relative of [...GENERATED, BASELINE]) {
    if (destinations.get(relative)?.state === 'exists') throw new Error(`${relative} already exists. Preserve the current architecture settings.`);
  }
  const hooks = mergeHooks(destinations.get(HOOKS)!);
  const verifyDestinations = () => {
    for (const [relative, expected] of destinations) {
      if (!matchesFileState(read(path.join(root, relative), ARCHITECTURE_LIMIT), expected)) {
        throw new Error('Architecture files changed since the preview. Generate a new preview.');
      }
    }
  };
  const scratch = await fs.realpath(os.tmpdir());
  const relativeScratch = path.relative(root, scratch);
  if (relativeScratch !== '..' && !relativeScratch.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeScratch)) {
    throw new Error('Architecture previews require temporary storage outside the workspace.');
  }
  const directory = await fs.mkdtemp(path.join(scratch, 'cheers-architecture-'));
  try {
    const snapshot = path.join(directory, 'workspace');
    const verifySources = await captureArchitectureSource(root, snapshot, access, signal);
    const guidance = inspectWorkspaceFile(snapshot, GUIDANCE, undefined, ARCHITECTURE_LIMIT);
    const original = destinations.get(GUIDANCE)!;
    if (guidance.state !== original.state || guidance.state === 'exists' && original.state === 'exists'
      && guidance.content !== original.content) throw new Error('Guidance changed while planning architecture setup.');
    const executable = path.join(directory, 'initialize.mjs');
    await fs.writeFile(executable, readInitializer(), { flag: 'wx', mode: 0o600 });
    await runInitializer(executable, snapshot, ['init'], signal);
    const manifest = parseConfigText(initializeOutput(snapshot, GENERATED[0]));
    if (Array.isArray(manifest.entries) && manifest.entries.some(entry => isRecord(entry) && isRecord(entry.source)
      && entry.source.kind === 'baseline')) {
      await runInitializer(executable, snapshot, ['baseline', 'accept', '--json'], signal);
    }
    await runInitializer(executable, snapshot, ['prose', '--sync'], signal);
    const files: PlannedFile[] = [...GENERATED, GUIDANCE].map(relative => {
      const before = destinations.get(relative)!;
      const after = initializeOutput(snapshot, relative);
      return { path: relative, before, after: before.state === 'exists' && before.content.length > 0 && !before.content.endsWith('\n')
        ? after.replace(/\r?\n$/, '') : after };
    });
    const baseline = inspectWorkspaceFile(snapshot, BASELINE, undefined, ARCHITECTURE_LIMIT);
    if (baseline.state === 'exists') files.push({ path: BASELINE, before: destinations.get(BASELINE)!, after: baseline.content });
    files.push({ path: HOOKS, before: destinations.get(HOOKS)!, after: hooks });
    verifySources();
    verifyDestinations();
    return toProposal(root, files, verifySources, verifyDestinations);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

async function runInitializer(executable: string, workspace: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const result = await createDefaultExecutionService().runCommand({
    operationKind: 'command.run', command: process.execPath, args: [executable, ...args], cwd: workspace, workspaceRoot: workspace,
    authority: { mode: 'command-allowlisted', source: 'workspace-authority', reason: 'User requested a local architecture preview.' },
    caller: 'architecture-preview', reason: 'Generate a proposal from an authorized temporary snapshot.',
    reportSafeCommand: 'Generate architecture proposal', timeoutMs: 20_000, abortSignal: signal,
    env: { TMPDIR: path.dirname(workspace), ...(process.versions.bun ? { BUN_BE_BUN: '1' } : {}) },
    cleanupTreeOnExit: true, captureOutput: false,
  });
  signal?.throwIfAborted();
  if (result.status !== 'completed' || result.exitCode !== 0 || result.terminationFailed || result.outputFailed) {
    throw new Error(`Architecture preview failed during ${args.slice(0, 2).join(' ')}. The workspace has no verified proposal.`);
  }
}

function initializeOutput(root: string, target: string): string {
  const file = inspectWorkspaceFile(root, target, undefined, ARCHITECTURE_LIMIT);
  if (file.state !== 'exists') throw new Error(`Architecture preview did not produce ${target}.`);
  return file.content;
}

function mergeHooks(before: FileState): string {
  const values = before.state === 'exists' ? parseConfigText(before.content) : {};
  const current = values.hooks ?? {};
  if (!isRecord(current)) throw new Error('Existing hook declarations are invalid.');
  const declarations = bundledHookDeclarations();
  const hooks = { ...current };
  let text = before.state === 'exists' ? before.content : '';
  for (const [name, handlers] of Object.entries(declarations)) {
    const prior = hooks[name] ?? [];
    if (!Array.isArray(prior) || prior.some(group => !isRecord(group) || !Array.isArray(group.hooks)
      || group.hooks.some(hook => isRecord(hook) && ((isRecord(hook.writeGate) && hook.writeGate.path === 'bundled:write')
        || (isRecord(hook.completionGate) && hook.completionGate.path === 'bundled:stop'))))) {
      throw new Error('Existing bundled architecture hook declarations require manual review.');
    }
    hooks[name] = [...prior, ...handlers];
    if (name in current && before.state === 'exists') {
      // Insert after the existing groups so surrounding JSONC comments and declarations survive.
      text = applyEdits(text, modify(configParserText(text), ['hooks', name, prior.length], handlers[0], { isArrayInsertion: true }));
    }
  }
  const next = { ...values, hooks };
  if (before.state === 'absent') return `${JSON.stringify(next, null, 2)}\n`;
  const result = patchConfigDocument({ text, values: parseConfigText(text), format: 'jsonc' }, next);
  return before.content.endsWith('\n') || !result.endsWith('\n') ? result : result.replace(/\r?\n$/, '');
}

function patchLines(text: string): string[] {
  const normalized = splitByteOrderMark(text).text.replace(/\r\n/g, '\n');
  return normalized ? normalized.replace(/\n$/, '').split('\n') : [];
}

function toProposal(root: string, files: PlannedFile[], verifySources: () => void, verifyDestinations: () => void): ArchitecturePlan {
  const changed = files.filter(file => file.before.state !== 'exists' || file.before.content !== file.after);
  const expectedHashes: Record<string, string> = {};
  const hunks = changed.map(file => {
    if (file.before.state === 'absent') return [`*** Add File: ${file.path}`, ...patchLines(file.after).map(line => `+${line}`)].join('\n');
    expectedHashes[path.join(root, file.path)] = file.before.hash;
    const before = patchLines(file.before.content);
    const after = patchLines(file.after);
    // Context preserves the raw bytes of matching lines, including mixed line endings.
    let prefix = 0;
    let suffix = 0;
    while (prefix < before.length && before[prefix] === after[prefix]) prefix++;
    while (suffix < before.length - prefix && suffix < after.length - prefix
      && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    return [`*** Update File: ${file.path}`, '@@', ...before.slice(0, prefix).map(line => ` ${line}`),
      ...before.slice(prefix, before.length - suffix).map(line => `-${line}`),
      ...after.slice(prefix, after.length - suffix).map(line => `+${line}`),
      ...before.slice(before.length - suffix).map(line => ` ${line}`), '*** End of File'].join('\n');
  });
  const input = ['*** Begin Patch', ...hunks, '*** End Patch'].join('\n');
  const parsed = parsePatch(input);
  for (const [index, file] of changed.entries()) {
    const operation = parsed[index]!;
    const exact = operation.kind === 'add' ? operation.content
      : operation.kind === 'update' && file.before.state === 'exists' ? applyHunks(file.before.content, operation.hunks) : undefined;
    if (exact !== file.after) throw new Error(`${file.path} cannot be represented byte-for-byte by the patch approval path.`);
  }
  const preview = changed.map(file => editDiff(file.path, file.before.state === 'exists' ? file.before.content : '', file.after)).join('\n\n');
  if (Buffer.byteLength(preview) > patchLimits.previewBytes) throw new Error('Architecture preview exceeds the patch review limit.');
  return { args: { input, expectedHashes }, files: changed, preview, verifySources, verifyDestinations };
}
