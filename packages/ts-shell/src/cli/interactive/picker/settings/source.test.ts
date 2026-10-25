import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig, getUserRuntimeConfigPath, getProjectConfigPath, readUserRuntimeConfigFile } from '../../../../config/runtimeConfig.js';
import { createConfigInputs } from '../../../../config/inputs/selection.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../../../core/shell/runtimeContext.js';
import { projectTrust } from '../../../../core/security/trust/store.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';
import { OverlayHost, type PickerOutcome } from '../../overlay.js';
import { openSettings } from '../../settings.js';
import { settingsPicker } from '../settings.js';

let root: string, user: string, project: string, input: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  root = fs.mkdtempSync('/tmp/cheers-test/settings-sources-');
  vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home'));
  vi.stubEnv('CHEERS_MAX_TURNS', ''); vi.stubEnv('CHEERS_OFFLINE', '');
  user = getUserRuntimeConfigPath(); project = getProjectConfigPath(root);
  input = path.join(root, 'explicit-' + 'x'.repeat(130), 'overlay.json');
  for (const file of [user, project, input]) fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(user, '{/* retain */"maxTurns":11,"offline":true}');
  fs.writeFileSync(project, '{"maxTurns":9}'); fs.writeFileSync(input, '{"maxTurns":31}');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function panel(explicit = true, override = false) {
  const inputs = explicit ? createConfigInputs([{ path: input, source: 'user' }], root) : undefined;
  const overrides = override ? { attentionOnIdle: false } : undefined;
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
    runtimeConfig: getRuntimeConfig(root, overrides, inputs), runtimeConfigOverrides: overrides,
    session: { id: 'settings-sources', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] } });
  const overlay = new OverlayHost(() => {});
  const host = { openSettings: (scope?: 'user' | 'project') => openSettings(context, () => {}, scope) };
  let outcome: PickerOutcome | undefined;
  const settle = async () => { for (let index = 0; index < 4; index++) await Promise.resolve(); };
  const render = (width = 80) => overlay.render(width, 24).map(stripAnsi).join('\n');
  const key = async (text: string) => {
    const pending: Promise<void>[] = [];
    overlay.handleKey(parseKeyEvent(text), (picker, ids) => { pending.push(picker.apply(ids).then(result => {
      outcome = result; if (result?.next) overlay.open(result.next);
    })); });
    await Promise.all(pending); await settle();
    return outcome;
  };
  const choose = async (label: string) => {
    for (let index = 0; index < 25; index++) {
      if (render().split('\n').some(row => row.trimStart().startsWith(`▸ ${label}`))) return key('\r');
      await key('\x1b[B');
    }
    throw new Error(`Choice not reachable: ${label}`);
  };
  const open = async (field = 'maxTurns') => { overlay.open(settingsPicker(host)); await settle(); await key(field); await key('\r'); };
  return { context, overlay, render, key, choose, open };
}

it.each([48, 100])('reads a long explicit origin at %i columns without editing or writing, and returns to the same staged value', async width => {
  const h = panel(), bytes = [user, project, input].map(file => fs.readFileSync(file));
  await h.open(); await h.key('\r'); await h.key('\x15'); await h.key('22'); await h.key('\r');
  await h.choose('Values and sources');
  let shown = h.render(width);
  expect(shown).toContain('Effective: 31'); expect(shown).toContain('Read-only');
  h.overlay.handlePaste('forged'); await h.key('\x15'); await h.key('replacement');
  for (let index = 0; index < 25; index++) { await h.key('\x1b[B'); shown += '\n' + h.render(width); }
  expect(shown.replace(/\n/g, '')).toContain(input); expect(shown).toContain('input 1');
  expect(shown).toContain('Stored: 11'); expect(shown).toContain('read-only');
  expect(shown).not.toContain('replacement'); expect(shown).not.toContain('forged');
  await h.key('\x1b'); expect(h.render()).toContain('Pending: 22');
  await h.choose('Values and sources'); await h.key('\r'); expect(h.render()).toContain('Pending: 22');
  expect([user, project, input].map(file => fs.readFileSync(file))).toEqual(bytes);
  h.overlay.close();
});

it('changes scope through actual keys, saves only the primary project field, explains overlay precedence and reads it back on reopen', async () => {
  projectTrust.setProjectTrust(root, 'session-only');
  const h = panel(), userBytes = fs.readFileSync(user), inputBytes = fs.readFileSync(input);
  await h.open(); await h.choose('Change save scope'); await h.choose('Project configuration');
  expect(h.render()).toContain('save to project');
  await h.key('\r'); await h.key('\x15'); await h.key('22'); await h.key('\r');
  const saved = await h.key('\r');
  expect(saved?.note).toContain('Saved to your project configuration'); expect(saved?.note).toContain('input 1');
  expect(saved!.note.indexOf('differs from')).toBeLessThan(saved!.note.indexOf(input));
  expect(h.context.runtimeConfig.maxTurns).toBe(31);
  expect(JSON.parse(fs.readFileSync(project, 'utf8')).maxTurns).toBe(22);
  expect(fs.readFileSync(user)).toEqual(userBytes); expect(fs.readFileSync(input)).toEqual(inputBytes);
  await h.key('\r'); expect(h.render()).toContain('Stored: 22');
  fs.writeFileSync(input, '{}'); fs.writeFileSync(user, '{"offline":true}');
  expect(refreshShellRuntimeConfig(h.context).status).toBe('applied'); expect(h.context.runtimeConfig.maxTurns).toBe(22);
  h.overlay.close();
});

it('keeps an untrusted project save inactive and makes the reason readable without changing trust', async () => {
  const h = panel(false); await h.open(); await h.choose('Change save scope'); await h.choose('Project configuration');
  await h.key('\r'); await h.key('\x15'); await h.key('22'); await h.key('\r');
  expect((await h.key('\r'))?.note).toContain('The project value is not active');
  expect(h.context.runtimeConfig.maxTurns).toBe(11);
  await h.key('\r'); await h.choose('Values and sources');
  let shown = h.render();
  for (let index = 0; index < 20; index++) { await h.key('\x1b[B'); shown += '\n' + h.render(); }
  expect(shown).toContain('trust has not been established'); expect(shown).toContain('/trust');
  await h.key('\x1b'); expect(h.context.runtimeConfig.maxTurns).toBe(11); h.overlay.close();
});

it('retains the launch override after a user Apply and shows accepted versus stored values in the read-only view', async () => {
  const h = panel(false, true); await h.open('attentionOnIdle'); await h.key('\r');
  expect((await h.key('\r'))?.note).toContain('keeps its launch override');
  expect(h.context.runtimeConfig.attentionOnIdle).toBe(false); expect(readUserRuntimeConfigFile().attentionOnIdle).toBe(true);
  expect(fs.readFileSync(user, 'utf8')).toContain('/* retain */');
  await h.key('\r'); await h.choose('Values and sources');
  const shown = h.render(); expect(shown).toContain('Effective: false'); expect(shown).toContain('Accepted: false');
  expect(shown).toContain('Source: override'); expect(shown).toContain('Stored: true'); h.overlay.close();
});

it.each([
  { field: 'disabledTools', chunks: ['fixture.a', 'fixture.b', 'fixture.c'], value: ['fixture.a', 'fixture.b', 'fixture.c'] },
  { field: 'modelTokenBudgets', chunks: ['{', '"openai/fixture": {"reserveTokens": 1000, "keepRecentTokens": 2000}', '}'],
    value: { 'openai/fixture': { reserveTokens: 1000, keepRecentTokens: 2000 } } },
])('types multiple lines for $field, stages without writing, cancels a second edit and saves only on Apply', async ({ field, chunks, value }) => {
  const h = panel(false), original = fs.readFileSync(user), projectBytes = fs.readFileSync(project), inputBytes = fs.readFileSync(input);
  await h.open(field); await h.choose('Edit value'); await h.key('\x15');
  for (let index = 0; index < chunks.length; index++) {
    await h.key(chunks[index]!);
    if (index < chunks.length - 1) await h.key(index === 0 ? '\x1b[13;2u' : '\n');
  }
  expect(h.render()).toContain('Shift+Enter/Ctrl+J');
  expect(fs.readFileSync(user)).toEqual(original);
  await h.key('\r'); expect(h.render()).toContain('Pending:');
  expect(fs.readFileSync(user)).toEqual(original);
  await h.choose('Edit value'); await h.key('\n'); await h.key('discard-me');
  await h.key('\x1b'); expect(h.render()).toContain('Pending:');
  expect(fs.readFileSync(user)).toEqual(original);
  expect((await h.choose('Apply'))?.note).toContain('Saved to your user configuration');
  expect(readUserRuntimeConfigFile()[field as 'disabledTools' | 'modelTokenBudgets']).toEqual(value);
  expect(fs.readFileSync(user, 'utf8')).toContain('/* retain */');
  expect(fs.readFileSync(project)).toEqual(projectBytes); expect(fs.readFileSync(input)).toEqual(inputBytes);
  await h.open(field); await h.choose('Edit value');
  const shown = h.render(120);
  expect(shown).not.toContain('discard-me');
  expect(shown).toContain(field === 'disabledTools' ? 'fixture.c' : 'keepRecentTokens');
  h.overlay.close();
});
