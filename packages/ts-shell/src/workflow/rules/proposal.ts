import path from 'node:path';
import { editDiff } from '../../edit/result/diff.js';
import { hashContent } from '../../edit/authority/content.js';
import { createPatchToolDefinition } from '../../edit/patch/tool.js';
import type { ToolExecutionContext, ToolPreparation } from '../../tools/types.js';
import { inspectWorkspaceFile, type FileState } from '../../core/workspace/files.js';
import { detectLineEnding, splitByteOrderMark } from '../../runtime/execution/fileText.js';

export type RuleProposalKind = 'init' | 'feedback';

export interface RuleProposal {
  readonly kind: RuleProposalKind;
  readonly target: string;
  readonly before: string;
  readonly after: string;
  readonly expectedContent: string;
  readonly sourceDigest: string;
  readonly preview: string;
  readonly write: 'new' | 'append' | 'unchanged';
  readonly sourceState: 'exists' | 'absent';
}

export interface PreparedRuleProposal extends RuleProposal {
  readonly input: string;
  readonly preparation: ToolPreparation;
}

const MARKER = '## Project initialization guidance';
const FEEDBACK_MARKER = '## Feedback-derived rule proposal';
const MAX_FEEDBACK = 4_000;

/** Inspect only bounded, local project metadata. No command is executed here. */
export function proposeRules(root: string, kind: RuleProposalKind, feedback?: string, read?: (target: string, maxBytes: number) => FileState): RuleProposal {
  const projectRoot = path.resolve(root);
  const source = read ?? ((target, maxBytes) => inspectWorkspaceFile(projectRoot, path.relative(projectRoot, target), undefined, maxBytes));
  const { target, file } = ruleTarget(projectRoot, source);
  const before = file.state === 'exists' ? file.content : '';
  const section = kind === 'init' ? initializationSection(projectRoot, source) : feedbackSection(feedback);
  const marker = kind === 'init' ? MARKER : FEEDBACK_MARKER;
  const alreadyPresent = kind === 'init' ? before.includes(marker) : before.replace(/\r\n/g, '\n').includes(section);
  const after = alreadyPresent ? before : joinRuleText(before, section);
  return Object.freeze({
    kind,
    target,
    before,
    after,
    expectedContent: before,
    sourceDigest: hashContent(before),
    preview: editDiff(path.relative(projectRoot, target) || path.basename(target), before, after),
    write: after === before ? 'unchanged' : file.state === 'exists' ? 'append' : 'new',
    sourceState: file.state,
  });
}

/** Prepare the proposal for the ordinary apply_patch approval and stale check. */
export function prepareRuleProposal(proposal: RuleProposal, context: ToolExecutionContext): PreparedRuleProposal {
  if (!context.sessionId) throw new Error('A saved session is required before preparing a rule write.');
  const relative = path.relative(context.artifactRoot ?? context.workspaceRoot, proposal.target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Rule target is outside the workspace.');
  const args = rulePatchArguments(proposal, relative);
  const input = args.input;
  const patch = createPatchToolDefinition();
  const preparation = patch.prepare!(args, context);
  return Object.freeze({ ...proposal, input, preparation });
}

export function rulePatchArguments(proposal: RuleProposal, relative: string): { input: string; expectedHashes: Record<string, string> } {
  const input = proposal.sourceState === 'absent'
    ? `*** Begin Patch\n*** Add File: ${relative}\n${proposal.after.split('\n').filter((line, index, all) => index < all.length - 1 || line).map(line => `+${line}`).join('\n')}\n*** End Patch`
    : updatePatch(relative, proposal.before, proposal.after);
  return { input, expectedHashes: proposal.sourceState === 'absent' ? {} : { [proposal.target]: proposal.sourceDigest } };
}

function updatePatch(relative: string, before: string, after: string): string {
  const oldLines = patchLines(before);
  const newLines = patchLines(after);
  const hunk = ['@@', ...oldLines.map(line => `-${line}`), ...newLines.map(line => `+${line}`)].join('\n');
  return `*** Begin Patch\n*** Update File: ${relative}\n${hunk}\n*** End Patch`;
}

function patchLines(value: string): string[] {
  const normalized = splitByteOrderMark(value).text.replace(/\r\n/g, '\n');
  if (!normalized) return [];
  return (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
}

function ruleTarget(root: string, read: (target: string, maxBytes: number) => FileState): { target: string; file: FileState } {
  for (const candidate of ['AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD']) {
    const target = path.join(root, candidate);
    const file = read(target, 128 * 1024);
    if (file.state === 'exists') return { target, file };
  }
  return { target: path.join(root, 'AGENTS.md'), file: { state: 'absent' } };
}

function joinRuleText(before: string, section: string): string {
  if (!before) return `${section}\n`;
  const ending = detectLineEnding(before);
  const text = splitByteOrderMark(before).text;
  return before + (text ? (text.endsWith('\n') ? ending : ending + ending) : '') + section.replace(/\n/g, ending)
    + (!text || text.endsWith('\n') ? ending : '');
}

function initializationSection(root: string, read: (target: string, maxBytes: number) => FileState): string {
  const facts: string[] = [];
  const manifests: string[] = [];
  const metadata = new Map<string, FileState>();
  const exists = (name: string) => { if (!metadata.has(name)) metadata.set(name, read(path.join(root, name), 128 * 1024)); return metadata.get(name)!.state === 'exists'; };
  const add = (name: string, label: string) => { if (exists(name)) { manifests.push(name); facts.push(`- ${label}: ${name}`); } };
  add('package.json', 'JavaScript/TypeScript manifest');
  add('tsconfig.json', 'TypeScript configuration');
  add('Cargo.toml', 'Rust manifest');
  add('pyproject.toml', 'Python project metadata');
  add('requirements.txt', 'Python dependencies');
  const manager = exists('pnpm-lock.yaml') ? 'pnpm' : exists('yarn.lock') ? 'yarn' : exists('bun.lock') ? 'bun' : 'npm';
  if (exists('package.json')) facts.push(`- Package manager: ${manager} (inferred from manifest/lock files)`);
  const packageFile = metadata.get('package.json');
  const packageData = packageFile?.state === 'exists' ? readJson(packageFile.content) : undefined;
  if (typeof packageData?.name === 'string' && packageData.name.trim()) facts.push(`- Project name: ${packageData.name.trim()}`);
  const scripts = packageData?.scripts && typeof packageData.scripts === 'object' ? packageData.scripts as Record<string, unknown> : {};
  if (typeof scripts.test === 'string') facts.push(`- Test command: ${manager} test (declared by package.json)`);
  if (typeof scripts.build === 'string') facts.push(`- Build command: ${manager} run build (declared by package.json)`);
  if (!facts.length) facts.push('- No recognized project manifest or declared test/build command was found.');
  return [MARKER, '', 'This section was proposed from files currently present in the project.', ...facts,
    '', manifests.length ? 'Review these facts and add project-specific rules before approving a write.' : 'Add project rules manually; no stack-specific commands were inferred.'].join('\n');
}

function feedbackSection(feedback: string | undefined): string {
  const clean = (feedback ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length > MAX_FEEDBACK) throw new Error('Rule feedback exceeds 4000 characters.');
  return [FEEDBACK_MARKER, '', 'This is a proposal from explicit user feedback. Feedback alone does not authorize a write.',
    `- Feedback: ${clean || '(empty; provide feedback after /rules)'}`,
    '', 'Review and edit this proposal before sending it through ordinary approval.'].join('\n');
}

function readJson(content: string): Record<string, unknown> {
  const value: unknown = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Project manifest is not a JSON object.');
  return value as Record<string, unknown>;
}
