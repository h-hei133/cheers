import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { routeSlashCommand } from './slashRouter.js';
import { buildCliCommandExecution } from '../../entrypoints/cliCommandExecutionBridge.js';
import { composePrompt } from './composition.js';
import { createCommandRegistry } from './registry.js';
import { needsComposition } from './composition.js';
import { SubmissionQueue } from '../../cli/interactive/inputQueue.js';
let root: string;
let skillPaths: string[];
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/composition-');
  skillPaths = ['a', 'b'].map(name => {
    const file = path.join(root, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: method ${name}\n---\nBODY ${name}`); return file;
  });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

it('prepares only the two skills after a real closing fence, preserving every code example without dispatching its driver', async () => {
  const example = '````text\nexample ```` /skill:missing\n/deep-research\n```` trailing\n/skill:missing\n`````';
  const input = `检查示例\n${example}\n/skill:a /skill:b`;
  const researchCommand = vi.fn();
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, researchCommand });
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { originalInput: input, skills: [{ name: 'a' }, { name: 'b' }], methods: [] } });
  expect(result).toMatchObject({ prompt: expect.stringContaining(example) });
  expect(result).toMatchObject({ prompt: expect.stringContaining('BODY a') });
  expect(result).toMatchObject({ prompt: expect.stringContaining('BODY b') });
  expect(researchCommand).not.toHaveBeenCalled();
});

it.each(['/skill:a /skill:b 问题', '请比较 /skill:a\n再检查 /skill:b 反例'])(
  'routes all skills into one prompt with original provenance: %s', async input => {
    const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } });
    expect(result).toMatchObject({ kind: 'prompt', prompt: expect.stringContaining('BODY a'), promptMetadata: {
      originalInput: input, skills: [{ name: 'a', source: 'cli' }, { name: 'b', source: 'cli' }] } });
    expect(result).toMatchObject({ prompt: expect.stringContaining('BODY b') });
  });

it('restores exact source and performs no configuration or research side effect after failed preparation', async () => {
  const input = '  问题 /skill:a\n/skill:missing  ';
  const researchCommand = vi.fn(); const settingsCommand = vi.fn();
  expect(await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, researchCommand, settingsCommand }))
    .toMatchObject({ kind: 'local', retryDraft: input, output: expect.stringContaining('missing') });
  expect(researchCommand).not.toHaveBeenCalled(); expect(settingsCommand).not.toHaveBeenCalled();
});

it('does not scan skill-shaped arguments of an opening functional command', async () => {
  const settingsCommand = vi.fn(async () => ({ kind: 'local' as const, output: 'handler' }));
  const result = await routeSlashCommand('/settings /skill:missing', { cwd: root, settingsCommand });
  expect(result).toMatchObject({ kind: 'local', output: expect.not.stringContaining('Unknown or unavailable skill') });
  expect(result).not.toHaveProperty('retryDraft');
});

it.each([' /settings', '\n/model', '/home/fixture'])(
  'passes positioned commands and explicit paths as prose: %s', async input => {
    expect(await routeSlashCommand(input, { cwd: root })).toBeNull();
  });

it('cancels preparation without publishing partial instructions', async () => {
  const signal = new AbortController(); signal.abort();
  await expect(composePrompt('/skill:a', { cwd: root, signal: signal.signal, skillOptions: { skillPaths, noSkills: true } })).rejects.toThrow();
});

it('passes both instruction bodies and attachments through the real execution bridge once', async () => {
  const input = '问题 /skill:a /skill:b';
  const attachments = { images: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }] };
  const result = await buildCliCommandExecution({ prompt: input, cwd: root, sessionId: 'fixture', interactive: false,
    renderer: { renderLine: vi.fn() }, skillOptions: { skillPaths, noSkills: true }, attachments } as never);
  expect(result).toMatchObject({ kind: 'execute', effectivePrompt: expect.stringContaining('BODY a'), attachments,
    promptMetadata: { originalInput: input, skills: [{ name: 'a' }, { name: 'b' }] } });
  expect(result).toMatchObject({ effectivePrompt: expect.stringContaining('BODY b') });
});

it('combines two compatible pure modifiers without executing their handlers', async () => {
  const directory = path.join(root, '.agents', 'prompts'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'evidence.md'), '---\ncomposable: true\ndescription: Evidence method\n---\nCheck counterexamples for $@');
  const input = '比较两种架构 /brainstorm /evidence --counterexample /skill:a';
  const commands = [...createCommandRegistry(root).values()].map(command => ({ ...command, execute: vi.fn(command.execute) }));
  const result = await composePrompt(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } }, commands);
  expect(result).toMatchObject({ kind: 'prompt', prompt: expect.stringContaining('Design exploration') });
  expect(result).toMatchObject({ prompt: expect.stringContaining('Check counterexamples for 比较两种架构 --counterexample') });
  expect(commands.every(command => !command.execute.mock.calls.length)).toBe(true);
});

it('routes review as one driver carrying prose, modifiers and every selected skill', async () => {
  const input = '检查证据 /brainstorm /review /skill:a';
  const gitCommand = vi.fn(async (args: readonly string[]) => ({
    kind: 'prompt' as const,
    prompt: args[1] ?? '',
    promptMetadata: { source: 'git-review' },
  }));
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand });
  expect(gitCommand).toHaveBeenCalledOnce();
  const focus = gitCommand.mock.calls[0]?.[0]?.[1];
  expect(focus).toContain('BODY a');
  expect(focus).toContain('Design exploration.');
  expect(focus).toContain('检查证据');
  expect(result).toMatchObject({
    kind: 'prompt',
    prompt: expect.stringContaining('BODY a'),
    promptMetadata: { source: 'git-review', originalInput: input, skills: [{ name: 'a' }] },
  });
});

it('does not invoke a review marker inside a balanced quote, but does invoke the following review', async () => {
  const input = 'focus="literal /review text" /review';
  const gitCommand = vi.fn(async (args: readonly string[]) => ({
    kind: 'prompt' as const,
    prompt: args[1] ?? '',
    promptMetadata: { source: 'git-review' },
  }));
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand });
  expect(gitCommand).toHaveBeenCalledOnce();
  expect(gitCommand.mock.calls[0]?.[0]?.[1]).toContain('focus="literal /review text"');
  expect(result).toMatchObject({
    kind: 'prompt',
    promptMetadata: { source: 'git-review', originalInput: input },
  });
});

it("keeps an option-attached quote literal and an unfinished quote from dispatching review", async () => {
  const gitCommand = vi.fn(async (args: readonly string[]) => ({
    kind: 'prompt' as const,
    prompt: args[1] ?? '',
    promptMetadata: { source: 'git-review' },
  }));
  for (const quoted of ["--focus'literal /review text' /review", "--focus' 中文 /review text' /review",
    "-f'literal /review text' /review"]) {
    expect(await routeSlashCommand(quoted, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand }))
      .toMatchObject({ kind: 'prompt', promptMetadata: { source: 'git-review', originalInput: quoted } });
  }
  expect(gitCommand).toHaveBeenCalledTimes(3);

  expect(await routeSlashCommand('focus="unfinished /review', { cwd: root,
    skillOptions: { skillPaths, noSkills: true }, gitCommand })).toBeNull();
  expect(gitCommand).toHaveBeenCalledTimes(3);
});

it('does not let prose apostrophes hide a review marker', async () => {
  const input = "Let's compare /review because it's ready";
  const gitCommand = vi.fn(async () => ({ kind: 'prompt' as const, prompt: 'reviewed',
    promptMetadata: { source: 'git-review' } }));
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand });
  expect(gitCommand).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { source: 'git-review', originalInput: input } });
});

it('preserves dash-prefixed prose for a flagless review driver', async () => {
  const input = '检查证据 /review --keep-this /skill:a';
  const gitCommand = vi.fn(async (args: readonly string[]) => ({
    kind: 'prompt' as const,
    prompt: args[1] ?? '',
    promptMetadata: { source: 'git-review' },
  }));
  const result = await routeSlashCommand(input, {
    cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand,
  });
  const focus = gitCommand.mock.calls[0]?.[0]?.[1];
  expect(gitCommand).toHaveBeenCalledOnce();
  expect(focus).toContain('BODY a');
  expect(focus).toContain('检查证据');
  expect(focus?.match(/--keep-this/g)).toHaveLength(1);
  expect(result).toMatchObject({
    kind: 'prompt',
    promptMetadata: { source: 'git-review', originalInput: input, skills: [{ name: 'a' }] },
  });
});

it('keeps strict option rejection for composed methods that declare flags', async () => {
  const input = '问题 /brainstorm --counterexample /skill:a';
  const commands = [...createCommandRegistry(root).values()].map(command => ({ ...command, execute: vi.fn(command.execute) }));
  const result = await composePrompt(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } }, commands);
  expect(result).toMatchObject({
    kind: 'local',
    retryDraft: input,
    output: expect.stringContaining('Invalid /brainstorm composition'),
  });
  expect(commands.every(command => !command.execute.mock.calls.length)).toBe(true);
});

it.each(['audit', 'check'])('uses the review driver for the /%s alias in composed prose', async name => {
  const input = `检查证据 /brainstorm /${name} /skill:a`;
  const gitCommand = vi.fn(async () => ({ kind: 'prompt' as const, prompt: 'prepared review',
    promptMetadata: { source: 'git-review' } }));
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand });
  expect(gitCommand).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { source: 'git-review', originalInput: input } });
});

it('refuses review when another workflow driver already owns the task', async () => {
  const input = '问题 /deep-research /review /skill:a';
  const gitCommand = vi.fn();
  const researchCommand = vi.fn();
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, gitCommand, researchCommand });
  expect(result).toMatchObject({
    kind: 'local',
    retryDraft: input,
    output: expect.stringContaining('Only one workflow driver can own a composed task'),
  });
  expect(gitCommand).not.toHaveBeenCalled();
  expect(researchCommand).not.toHaveBeenCalled();
});

it('refuses an over-budget second method without truncating the first or dispatching', async () => {
  fs.appendFileSync(skillPaths[1]!, 'x'.repeat(65536));
  const input = '问题 /skill:a /skill:b';
  expect(await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } }))
    .toMatchObject({ kind: 'local', retryDraft: input, output: expect.stringContaining('budget') });
});

it('revalidates configuration after pure method preparation before driver dispatch', async () => {
  let revision = 1; const execute = vi.fn();
  const commands = [{ name: 'method', kind: 'prompt', group: 'workflow', summary: 'method', supportsNonInteractive: true,
    composition: { kind: 'driver', prepare: () => { revision++; return { args: ['question'] }; } }, execute }] as never;
  const result = await composePrompt('问题 /method', { cwd: root, readConfiguration: () => ({ revision }) as never }, commands);
  expect(result).toMatchObject({ kind: 'local', output: expect.stringContaining('Configuration changed') });
  expect(execute).not.toHaveBeenCalled();
});

it('keeps composed prose in the pending submission lane and expands it once when drained', async () => {
  const input = '正文 /skill:a\n/skill:b';
  expect(needsComposition(input, [...createCommandRegistry(root).values()])).toBe(true);
  const queue = new SubmissionQueue(() => ({ id: 'session', createdAt: 'created', projectRoot: root }) as never, vi.fn());
  queue.push(input);
  expect(queue.shift()).toBe(input); expect(queue.shift()).toBeUndefined();
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } });
  expect(result).toMatchObject({ kind: 'prompt', promptMetadata: { originalInput: input } });
});

it('rejects an unsupported inline functional command without running it', async () => {
  const settingsCommand = vi.fn(); const input = '问题 /brainstorm /settings /skill:a';
  const result = await routeSlashCommand(input, { cwd: root, skillOptions: { skillPaths, noSkills: true }, settingsCommand });
  expect(result).toMatchObject({ kind: 'local', retryDraft: input, output: expect.stringContaining('/settings cannot be composed') });
  expect(settingsCommand).not.toHaveBeenCalled();
});

it('revalidates selected manifest source before a prepared driver can create state', async () => {
  const input = '问题 /driver /skill:a'; const execute = vi.fn();
  const command = { name: 'driver', kind: 'prompt', group: 'workflow', summary: 'driver', composition: { kind: 'driver',
    prepare: () => { fs.appendFileSync(skillPaths[0]!, '\nCHANGED'); return { args: ['问题'] }; } }, execute } as never;
  const result = await composePrompt(input, { cwd: root, skillOptions: { skillPaths, noSkills: true } }, [command]);
  expect(result).toMatchObject({ kind: 'local', retryDraft: input }); expect(execute).not.toHaveBeenCalled();
});

it('preserves literal option prose and permits absolute file values without consuming another invocation', async () => {
  const execute = vi.fn(async () => ({ kind: 'prompt' as const, prompt: 'prepared' }));
  const prepare = vi.fn((args: readonly string[]) => ({ args }));
  const commands = [{ name: 'driver', kind: 'prompt', group: 'workflow', summary: 'driver', composition: {
    kind: 'driver', flags: [{ name: 'brief', kind: 'text' }], prepare }, execute }] as never;
  await composePrompt('问题 /driver --brief /tmp/report.md /skill:a', { cwd: root, skillOptions: { skillPaths, noSkills: true } }, commands);
  expect(prepare).toHaveBeenCalledWith(['--brief', '/tmp/report.md'], expect.stringContaining('问题'));
  await composePrompt('问题 /driver "--literal" /skill:a', { cwd: root, skillOptions: { skillPaths, noSkills: true } }, commands);
  expect(prepare).toHaveBeenLastCalledWith([], expect.stringContaining('"--literal"'));
});

it('does not turn an unexpected driver shell action into an implicit functional action', async () => {
  const commands = [{ name: 'driver', kind: 'prompt', group: 'workflow', summary: 'driver', composition: {
    kind: 'driver', prepare: () => ({ args: ['question'] }) }, execute: async () => ({ kind: 'shell-action', action: 'exit-session' }) }] as never;
  await expect(composePrompt('问题 /driver', { cwd: root }, commands)).rejects.toThrow('unsupported shell action');
});
