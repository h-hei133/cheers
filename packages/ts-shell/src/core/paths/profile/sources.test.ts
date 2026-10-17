import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from './context.js';
import { HookTrustStore } from '../../hooks/trust.js';
import { ApprovalTrustPolicy } from '../../shell/approvalTrustPolicy.js';
import type { EscalationPrompt } from '../../shell/approval/contract.js';
import { loadInstructionFiles } from '../../../context/instructions/projectInstructions.js';
import { listThemes } from '../../../presentation/themes/index.js';
import { loadUserKeybindings } from '../../../cli/interactive/keybindings.js';
import { McpAuthService } from '../../../cli/mcp/auth/service.js';
import { TemplateLoader } from '../../prompts/templateLoader.js';
import { SkillLoader } from '../../skills/skillLoader.js';
import { SubagentLoader } from '../../subagents/subagentLoader.js';
import { ExtensionStore } from '../../../extensions/store/state.js';
import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeRuntimeConfigFileAt } from '../../../config/runtimeConfig.js';
import { ConfigWriteError } from '../../../config/outcome.js';
import { installCrashRecorder } from '../../../observability/crashLog.js';
import { runReportCommand } from '../../commands/reportCommandRuntime.js';
import type { CommandContext } from '../../commands/types.js';

let home: string;
let workspace: string;
let a: ProfileContext;
let b: ProfileContext;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-sources-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  a = createProfileContext({ name: 'a', homeDir: home, env: {} });
  b = createProfileContext({ name: 'b', homeDir: home, env: {} });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

it.each(['replacement', 'link'] as const)('refuses a default report after its captured root changes through %s', async change => {
  const context = { cwd: workspace, getToolPool: async () => {
    fs.renameSync(a.root, `${a.root}-retired`);
    if (change === 'link') fs.symlinkSync(b.root, a.root, 'dir');
    else fs.mkdirSync(a.root);
    return new Map();
  } } as CommandContext;
  const result = await withProfile(a, () => runReportCommand([], context));
  expect(result.output).toContain('Could not write the report');
  expect(result.output).toContain('changed identity');
  expect(result.output).not.toContain('Report written');
  expect(fs.readdirSync(a.root)).toEqual([]);
  expect(fs.readdirSync(b.root)).toEqual([]);
});

it('keeps explicit report exports in the authorized workspace', async () => {
  const context = { cwd: workspace, getToolPool: async () => new Map() } as CommandContext;
  const result = await withProfile(a, () => runReportCommand(['report.zip'], context));
  expect(result.output).toContain('Report written');
  expect(fs.readFileSync(path.join(workspace, 'report.zip')).subarray(0, 2).toString()).toBe('PK');
});
const prompt: EscalationPrompt = { id: 'test', title: 'Permission', message: 'synthetic approval',
  context: { toolName: 'bash', operation: 'spawn', target: 'node --version' }, options: [], defaultOption: 'deny',
  recommendedAction: 'allow once', severity: 'low' };

it.each(['leaf', 'root'] as const)('withholds captured hook approvals after replacing their %s', replacement => {
  const first = withProfile(a, () => new HookTrustStore());
  const second = withProfile(b, () => new HookTrustStore());
  first.recordTrust('local'); second.recordTrust('foreign');
  const other = path.join(b.root, 'hook-trust.json'); const before = fs.readFileSync(other, 'utf8');
  if (replacement === 'root') {
    fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  } else {
    const target = path.join(a.root, 'hook-trust.json'); fs.unlinkSync(target); fs.symlinkSync(other, target);
  }
  expect(first.isTrusted('local')).toBe(false); expect(first.isTrusted('foreign')).toBe(false);
  expect(() => first.recordTrust('late')).toThrow(); expect(fs.readFileSync(other, 'utf8')).toBe(before);
});

it('refuses linked approval grants and invalidates captured allow-once state', () => {
  const first = withProfile(a, () => new ApprovalTrustPolicy());
  const second = withProfile(b, () => new ApprovalTrustPolicy());
  const cacheKey = first.evaluate(prompt, workspace).cacheKey; first.rememberAllowOnce(cacheKey);
  second.rememberAllowAlways(prompt, workspace);
  const other = path.join(b.root, 'approval-policy.json'); const before = fs.readFileSync(other, 'utf8');
  fs.symlinkSync(other, path.join(a.root, 'approval-policy.json'));
  expect(() => first.evaluate(prompt, workspace)).toThrow('symbolic links');
  expect(() => first.consumeAllowOnce(cacheKey)).toThrow('symbolic links');
  expect(() => first.rememberAllowAlways(prompt, workspace)).toThrow('symbolic links');
  expect(fs.readFileSync(other, 'utf8')).toBe(before);
});

it('rejects linked automatic user instructions, themes and explicit-home keybindings', () => {
  fs.writeFileSync(path.join(b.root, 'AGENTS.md'), 'B private instruction');
  fs.symlinkSync(path.join(b.root, 'AGENTS.md'), path.join(a.root, 'AGENTS.md'));
  expect(() => withProfile(a, () => loadInstructionFiles({ cwd: workspace }))).toThrow('symbolic links');
  fs.mkdirSync(path.join(b.root, 'themes'));
  fs.writeFileSync(path.join(b.root, 'themes', 'private.json'), JSON.stringify({ colors: { text: '#123456' } }));
  fs.symlinkSync(path.join(b.root, 'themes'), path.join(a.root, 'themes'), 'dir');
  expect(() => withProfile(a, () => listThemes(workspace))).toThrow('symbolic links');
  fs.writeFileSync(path.join(b.root, 'keybindings.json'), JSON.stringify({ 'app.exit': 'ctrl+x' }));
  fs.symlinkSync(path.join(b.root, 'keybindings.json'), path.join(a.root, 'keybindings.json'));
  expect(() => withProfile(a, () => loadUserKeybindings(home))).toThrow('symbolic links');
});

it('keeps a captured MCP auth owner from adopting replacement credentials or revoking them', async () => {
  const first = withProfile(a, () => new McpAuthService('same', { transport: 'http', url: 'https://mcp.example', scope: 'user' }));
  const second = withProfile(b, () => new McpAuthService('same', { transport: 'http', url: 'https://mcp.example', scope: 'user' }));
  second.logout(); const before = fs.readFileSync(second.target, 'utf8');
  fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  await expect(first.token()).rejects.toThrow('changed identity');
  expect(() => first.logout()).toThrow('changed identity');
  expect(fs.readFileSync(second.target, 'utf8')).toBe(before);
});

it.each(['templates', 'skills', 'agents', 'extensions'] as const)('binds a captured %s reader to its original root', async source => {
  const read = withProfile(a, () => {
    if (source === 'templates') { const loader = new TemplateLoader(workspace); return () => loader.load(); }
    if (source === 'skills') { const loader = new SkillLoader(workspace); return () => loader.load(); }
    if (source === 'agents') { const loader = new SubagentLoader(workspace); return () => loader.loadAllSubagents(); }
    const store = new ExtensionStore(); return () => store.read();
  });
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  for (const directory of ['prompts', 'skills', 'agents', 'extensions']) fs.mkdirSync(path.join(a.root, directory));
  fs.writeFileSync(path.join(a.root, 'prompts', 'replacement.md'), 'replacement template');
  fs.writeFileSync(path.join(a.root, 'skills', 'replacement.md'), '---\nname: replacement\ndescription: replacement skill\n---\nreplacement');
  fs.writeFileSync(path.join(a.root, 'agents', 'replacement.md'), '---\nname: replacement\ndescription: replacement agent\n---\nreplacement');
  fs.writeFileSync(path.join(a.root, 'extensions', 'registry.json'), JSON.stringify({ schema: 1, revision: 5, packages: [], imports: [] }));
  await expect(Promise.resolve().then(read)).rejects.toThrow('changed identity');
});

it('refuses a retained config edit even when the replacement root has identical bytes', () => {
  const edit = withProfile(a, () => {
    const file = getUserRuntimeConfigPath(); fs.writeFileSync(file, '{"offline":true}\n');
    return readRuntimeConfigEditAt(file);
  });
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  const before = '{"offline":true}\n'; fs.writeFileSync(edit.path, before);
  try { writeRuntimeConfigFileAt(edit.path, { ...edit.values, offline: false }, edit); throw new Error('Unexpected successful write'); }
  catch (error) {
    expect(error).toBeInstanceOf(ConfigWriteError); expect((error as ConfigWriteError).state).toBe('unchanged');
  }
  expect(fs.readFileSync(edit.path, 'utf8')).toBe(before);
  expect(fs.readdirSync(a.root)).toEqual(['config.json']);
});

it('keeps the installed crash callback from writing a replacement root', () => {
  const previous = process.listeners('unhandledRejection');
  const stop = withProfile(a, () => installCrashRecorder({ cwd: workspace }));
  const listener = process.listeners('unhandledRejection').find(candidate => !previous.includes(candidate))!;
  try {
    listener(new Error('first synthetic crash'), Promise.resolve());
    expect(fs.existsSync(path.join(a.root, 'crashes.json'))).toBe(true);
    fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
    listener(new Error('late synthetic crash'), Promise.resolve());
    expect(fs.readdirSync(a.root)).toEqual([]);
  } finally { stop(); }
});
