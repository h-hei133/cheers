import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as catalog from '../../../core/skills/skillCatalog.js';
import type { Skill } from '../../../core/skills/skillLoader.js';
import { projectTrust } from '../../../core/security/projectTrust.js';
import { runSkillCommand } from '../../../core/commands/skillCommandRuntime.js';
import { tokenizeCommandArgs } from '../../../core/commands/arguments.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { OverlayHost } from '../overlay.js';
import { skillPicker } from './skills.js';

const skill = (name = 'fixture'): Skill => ({ name, description: 'Fixture instructions', body: 'Keep exact body\n\n```sh\npassword=body-is-intentional\n```',
  source: 'cli', filePath: '/fixture/SKILL.md', disableModelInvocation: false, unhonouredFields: [] });
const result = (...skills: Skill[]): catalog.SkillCatalogResult => ({ skills: new Map(skills.map(item => [item.name, item])), collisions: [], diagnostics: [], failures: [] });

afterEach(() => vi.restoreAllMocks());

describe('skill inspection', () => {
  it.each(['file', 'fi\x1b[31mle'])('does not let decoded file URL controls reassemble metadata: %s', protocol => {
    const raw = `${protocol}:///fixture/sk-%C2%9B31msynthetic-sensitive`;
    const item = { ...skill(raw), description: raw };
    vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));
    return (async () => {
      const picker = skillPicker({ cwd: '/fixture' }), option = (await picker.load())[0]!;
      expect(option.label + option.detail).not.toMatch(/[\x00-\x1f\x7f-\x9f]/);
      expect(option.label + option.detail).not.toContain('synthetic-sensitive');
      const listed = await runSkillCommand([], { cwd: '/fixture' });
      expect(listed.output).not.toContain('synthetic-sensitive');
      const selected = await picker.apply([item.name]);
      expect(selected?.note).not.toContain('synthetic-sensitive'); expect(selected?.note).toContain(item.body);
    })();
  });

  it('scrubs list metadata before shortening while preserving exact identity and instruction bodies', async () => {
    const item = { ...skill('api_key=synthetic-\x1b[31msensitive-name'), description: `${'x'.repeat(100)} sk-\x1b[31msynthetic-sensitive-description` };
    vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));
    const picker = skillPicker({ cwd: '/fixture' });
    const [option] = await picker.load();
    expect(option!.id).toBe(item.name);
    expect(JSON.stringify({ label: option!.label, detail: option!.detail })).not.toMatch(/synthetic-sensitive|sk-synt/);
    const selected = await picker.apply([item.name]);
    expect(selected?.note).toContain(item.body);
    expect(selected?.note).not.toMatch(/synthetic-sensitive|sk-synt/);
    expect(selected?.draft).toBeUndefined();
  });

  it('publishes a structured body-free list and preserves the selected body exactly', async () => {
    const item = { ...skill(), description: 'First line.\r\nSecond line. password=synthetic-sensitive' };
    vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));
    const listed = await runSkillCommand([], { cwd: '/fixture' });
    expect(listed.report?.facts).toMatchObject({ count: 1, skills: [{ name: item.name, source: 'cli' }] });
    expect(listed.output).toBe(reportText(listed.report!));
    expect(JSON.stringify(listed.report)).not.toContain(item.body);
    expect(JSON.stringify(listed)).not.toContain('synthetic-sensitive');
    const selected = await runSkillCommand(['FIXTURE'], { cwd: '/fixture' });
    expect(selected.kind).toBe('local'); expect(selected.report).toBeUndefined();
    expect(selected.output.endsWith(item.body)).toBe(true);
    expect(selected.output).toContain('First line.\nSecond line. password=[redacted]');
  });

  it('neutralizes terminal controls in a displayed instruction body without flattening Markdown', async () => {
    const item = { ...skill(), body: 'normal\n\tindent\n\x1b]0;owned\x07safe\n\x1b[31mred\x00' };
    vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));

    const selected = await runSkillCommand([item.name], { cwd: '/fixture' });

    expect(selected.output).toContain('normal\n\tindent\nsafe\nred\\u0000');
    expect(selected.output).not.toMatch(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
  });

  it.each(['apply-before-load', 'unoffered', 'multiple', 'duplicate'] as const)('requires one offered, unused selection: %s', async phase => {
    const item = skill(), other = skill('other');
    const read = vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item, other));
    const picker = skillPicker({ cwd: '/fixture' });
    if (phase === 'apply-before-load') { expect(await picker.apply([item.name])).toBeUndefined(); expect(read).not.toHaveBeenCalled(); return; }
    await picker.load();
    if (phase === 'duplicate') {
      const first = picker.apply([item.name]);
      expect(await picker.apply([item.name])).toBeUndefined();
      expect((await first)?.draft).toBe('/skill fixture ');
    } else expect(await picker.apply(phase === 'multiple' ? [item.name, other.name] : ['missing'])).toBeUndefined();
    expect(read).toHaveBeenCalledTimes(phase === 'duplicate' ? 2 : 1);
  });

  it('rechecks exact current identity without substituting a case-insensitive replacement', async () => {
    const original = skill('Example');
    vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValueOnce(result(original)).mockResolvedValue(result(skill('example')));
    const picker = skillPicker({ cwd: '/fixture' }); await picker.load();
    const selected = await picker.apply([original.name]);
    expect(selected?.draft).toBeUndefined(); expect(selected?.note).toContain('no longer available');
    expect(selected?.note).not.toContain('body-is-intentional');
  });

  it.each(['plain-name', 'name with spaces', "name'quoted\\literal", '--dash', '$() `literal`'])(
    'inserts an exact draft that the original argument parser can read: %s', async name => {
      const item = skill(name); vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));
      const picker = skillPicker({ cwd: '/fixture' }); await picker.load();
      const selected = await picker.apply([name]);
      expect(selected?.draft).toBeTypeOf('string');
      const decoded = tokenizeCommandArgs(selected!.draft!.slice('/skill '.length));
      expect((await runSkillCommand(decoded, { cwd: '/fixture' })).output.endsWith(item.body)).toBe(true);
    });

  it.each(['load', 'apply', 'failure'] as const)('rejects an obsolete admission during %s and suppresses late notes', async phase => {
    let stale = false, release!: () => void;
    const item = skill(), read = vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValue(result(item));
    const context = { cwd: '/fixture', admission: () => stale ? 'original binding changed' : undefined };
    const picker = skillPicker(context); await picker.load();
    read.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; });
      if (phase === 'failure') throw new Error('PRIVATE_RESPONSE_BODY'); return result(item); });
    const pending = phase === 'load' ? picker.load() : picker.apply([item.name]);
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); stale = true;
    if (phase === 'load') { const rejected = expect(pending).rejects.toThrow('original binding changed'); release(); await rejected; }
    else { release(); expect(await pending).toBeUndefined(); }
    expect(picker.isCurrent?.()).toBe(false); expect(picker.status?.()).toContain('changed');
    const count = read.mock.calls.length;
    await expect(picker.load()).rejects.toThrow('original binding changed');
    await expect(runSkillCommand([], context)).rejects.toThrow('original binding changed');
    expect(read).toHaveBeenCalledTimes(count);
  });

  it('reports catalog failure safely and forwards cancellation before reading', async () => {
    const read = vi.spyOn(catalog, 'resolveSkillCatalog').mockResolvedValueOnce(result(skill())).mockRejectedValue(new Error('PRIVATE_RESPONSE_BODY'));
    const picker = skillPicker({ cwd: '/fixture' }); await picker.load();
    expect(await picker.apply(['fixture'])).toEqual({ note: 'Skill catalog unavailable. Reopen /skill to retry.' });
    const controller = new AbortController(); controller.abort();
    await expect(runSkillCommand([], { cwd: '/fixture', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('forwards the original abort signal and withholds a catalog that settles after cancellation', async () => {
    const controller = new AbortController(); let release!: () => void;
    const read = vi.spyOn(catalog, 'resolveSkillCatalog').mockImplementationOnce(async options => {
      expect(options.abortSignal).toBe(controller.signal);
      await new Promise<void>(resolve => { release = resolve; }); return result(skill());
    });
    const pending = runSkillCommand([], { cwd: '/fixture', signal: controller.signal });
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); release(); await rejected; expect(read).toHaveBeenCalledOnce();
  });

  it.each(['overlay', 'original'] as const)('forwards %s cancellation through the real overlay load', async owner => {
    let signal: AbortSignal | undefined, release!: () => void;
    const original = new AbortController();
    vi.spyOn(catalog, 'resolveSkillCatalog').mockImplementationOnce(async options => {
      signal = options.abortSignal; await new Promise<void>(resolve => { release = resolve; }); return result(skill());
    });
    const overlay = new OverlayHost(() => {}), picker = skillPicker({ cwd: '/fixture', signal: original.signal });
    try {
      overlay.open(picker); await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      expect(signal).toBeDefined();
      if (owner === 'original') original.abort(); else overlay.handleKey(parseKeyEvent('\x1b'), vi.fn());
      expect(signal!.aborted).toBe(true); release(); await new Promise(resolve => setTimeout(resolve, 0));
      expect(await picker.apply(['fixture'])).toBeUndefined();
    } finally { release?.(); overlay.close(); }
  });

  it('keeps an accepted selection usable after the overlay aborts its load signal', async () => {
    const item = skill(); const signals: Array<AbortSignal | undefined> = [];
    vi.spyOn(catalog, 'resolveSkillCatalog').mockImplementation(async options => { signals.push(options.abortSignal); return result(item); });
    const overlay = new OverlayHost(() => {}), picker = skillPicker({ cwd: '/fixture' });
    try {
      overlay.open(picker); await vi.waitFor(() => expect(signals).toHaveLength(1));
      await new Promise(resolve => setTimeout(resolve, 0));
      const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
      expect(apply).toHaveBeenCalledWith(picker, ['fixture']); expect(signals[0]?.aborted).toBe(true);
      const selected = await picker.apply(['fixture']);
      expect(selected?.draft).toBe('/skill fixture '); expect(selected?.note).toContain(item.body);
      expect(signals[1]).toBeDefined(); expect(signals[1]?.aborted).toBe(false);
      expect(signals[1]).not.toBe(signals[0]);
    } finally { overlay.close(); }
  });
});

describe('original skill catalog policy', () => {
  let root: string, workspace: string, named: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-skill-picker-')); workspace = path.join(root, 'workspace');
    fs.mkdirSync(workspace); vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const directory = path.join(workspace, '.agents', 'skills', 'project'); fs.mkdirSync(directory, { recursive: true });
    named = path.join(directory, 'SKILL.md'); fs.writeFileSync(named, '---\nname: project\ndescription: Fixture\n---\nOriginal named instructions.');
  });
  afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

  it('keeps project trust, named paths, noSkills, and read-only file bytes in the original catalog', async () => {
    vi.spyOn(projectTrust, 'isProjectUntrusted').mockReturnValue(true);
    expect(await skillPicker({ cwd: workspace }).load()).toEqual([]);
    const picker = skillPicker({ cwd: workspace, skillOptions: { noSkills: true, skillPaths: [named] } });
    const bytes = fs.readFileSync(named), stat = fs.statSync(named);
    expect((await picker.load()).map(item => item.id)).toEqual(['project']);
    expect((await picker.apply(['project']))?.note).toContain('Original named instructions.');
    expect(fs.readFileSync(named)).toEqual(bytes); expect(fs.statSync(named).mtimeMs).toBe(stat.mtimeMs);
  });
});
