import fs from 'node:fs';
import * as fileSystem from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { readSessionNavigation } from '../query/navigation.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../store/sessionFileLayout.js';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { resumeShellSession } from '../../core/shell/recovery.js';
import { sessionPickerHost } from '../../cli/interactive/picker/session/host.js';
import type { SavedSessionSelection } from '../navigation/selection.js';
import { sessionPicker } from '../../cli/interactive/picker/session.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { ConfigState } from '../../config/state.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-session-selection-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(fileSystem.rmSync).mockImplementation(actual.rmSync).mockClear();
  actual.rmSync(root, { recursive: true, force: true });
});

function setup() {
  const manager = new SessionManager();
  const source = manager.createNew(root);
  manager.addTurn(source.id, { role: 'user', content: 'saved target question' });
  const current = manager.createNew(root);
  const runtime = { cwd: root, projectRoot: root, session: current,
    runtimeConfig: getRuntimeConfig(root) } as ShellRuntimeContext;
  runtime.configuration = new ConfigState(runtime.runtimeConfig, configurationBinding(runtime));
  const lines: string[] = [];
  const renderer = { renderLine: (line: string) => lines.push(line) } as never;
  const layout = locateExistingSessionLayout(createSessionStoreLayout(), source.id);
  const bytes = () => [layout.statePath, layout.metadataPath, layout.transcriptPath].map(file => fs.readFileSync(file));
  const execute = (selection: SavedSessionSelection) => resumeShellSession({
    requestedSessionId: source.id, selection, sessionManager: manager, runtimeContext: runtime, renderer,
  });
  return { manager, source, current, runtime, lines, layout, bytes, execute };
}

it('carries the actual catalog preview version through the host and activates its exact saved session', async () => {
  const test = setup();
  let result: Awaited<ReturnType<typeof resumeShellSession>> | undefined;
  const ports = sessionPickerHost({ runtimeContext: test.runtime, sessionManager: test.manager, busy: () => false,
    resume: async (_id, selection) => { result = await test.execute(selection); return undefined; } });
  const picker = sessionPicker({ sessionManager: test.manager, context: ports.sessionContext, resume: ports.resumeSession });
  await picker.search!('saved target question');
  await picker.apply([test.source.id]);
  expect(result, test.lines.join('\n')).toMatchObject({ resumed: true, autoResume: null });
  expect(test.runtime.session.id).toBe(test.source.id);
  expect(test.runtime.session.turns.at(-1)?.content).toBe('saved target question');
  expect(test.manager.getCurrentSessionForProject(root)?.id).toBe(test.source.id);
});

it.each(['before-resolution', 'during-resolution', 'during-load'] as const)('refuses changed preview content %s with no activation writes', async timing => {
  const test = setup();
  const selection = { sessionId: test.source.id, version: readSessionNavigation(test.source.id, root).version, admission: () => undefined };
  const edit = () => fs.writeFileSync(test.layout.transcriptPath,
    fs.readFileSync(test.layout.transcriptPath, 'utf8').replace('saved target question', 'edited target question'));
  let expected = test.bytes();
  if (timing === 'before-resolution') { edit(); expected = test.bytes(); }
  if (timing === 'during-resolution') {
    const resolve = test.manager.catalog.resolve.bind(test.manager.catalog);
    vi.spyOn(test.manager.catalog, 'resolve').mockImplementationOnce(async (...args) => {
      const result = await resolve(...args); edit(); expected = test.bytes(); return result;
    });
  }
  if (timing === 'during-load') {
    const load = SessionStoreAccess.prototype.load;
    vi.spyOn(SessionStoreAccess.prototype, 'load').mockImplementation(function (...args) {
      const result = load.apply(this, args);
      if (args[0] === test.source.id) { edit(); expected = test.bytes(); }
      return result;
    });
  }
  expect(await test.execute(selection)).toEqual({ resumed: false });
  expect(test.runtime.session.id).toBe(test.current.id);
  expect(test.manager.getCurrentSessionForProject(root)?.id).toBe(test.current.id);
  expect(test.bytes()).toEqual(expected);
  expect(test.lines.join('\n')).toContain('changed after the preview');
  expect(test.lines.join('\n')).not.toContain('Resumed session');
});

it('revalidates runtime admission after asynchronous reference resolution and preserves the new session', async () => {
  const test = setup();
  let valid = true;
  const selection = { sessionId: test.source.id, version: readSessionNavigation(test.source.id, root).version,
    admission: () => valid ? undefined : 'The active workspace changed.' };
  const resolve = test.manager.catalog.resolve.bind(test.manager.catalog);
  vi.spyOn(test.manager.catalog, 'resolve').mockImplementationOnce(async (...args) => {
    const result = await resolve(...args); valid = false; return result;
  });
  const before = test.bytes();
  expect(await test.execute(selection)).toEqual({ resumed: false });
  expect(test.runtime.session.id).toBe(test.current.id);
  expect(test.bytes()).toEqual(before);
  expect(test.lines.join('\n')).toContain('workspace changed');
});

it('does not expose an admission exception or accept a missing saved preview', async () => {
  const test = setup();
  const resume = vi.fn(async () => undefined);
  const ports = sessionPickerHost({ runtimeContext: test.runtime, sessionManager: test.manager, busy: () => false, resume });
  expect(await ports.resumeSession(test.source.id)).toContain('preview is unavailable');
  expect(resume).not.toHaveBeenCalled();
  const before = test.bytes();
  expect(await test.execute({ sessionId: test.source.id, version: readSessionNavigation(test.source.id, root).version,
    admission: () => { throw new Error('PRIVATE_ADMISSION_BODY'); } })).toEqual({ resumed: false });
  expect(test.bytes()).toEqual(before);
  expect(test.lines.join('\n')).not.toContain('PRIVATE_ADMISSION_BODY');
});

it.each(['verified', 'unreadable', 'changed'] as const)(
  'classifies activation after a storage lock release failure when readback is %s', async readback => {
    const test = setup();
    const selection = { sessionId: test.source.id, version: readSessionNavigation(test.source.id, root).version,
      admission: () => undefined };
    const remove = (await vi.importActual<typeof import('node:fs')>('node:fs')).rmSync;
    let injected = false;
    let pointer: Buffer | undefined;
    vi.mocked(fileSystem.rmSync).mockImplementation((file, options) => {
      if (!injected && String(file) === test.layout.stateLockPath) {
        injected = true;
        pointer = fs.readFileSync(path.join(root, '.cheers', 'current-session.json'));
        if (readback === 'unreadable') fs.renameSync(test.layout.metadataPath, `${test.layout.metadataPath}.unreadable`);
        if (readback === 'changed') fs.appendFileSync(test.layout.transcriptPath, JSON.stringify({
          type: 'message', id: 'late-message', role: 'user', content: 'External change', timestamp: new Date().toISOString(),
        }) + '\n');
        throw new Error('PRIVATE_LOCK_RELEASE_BODY');
      }
      return remove(file, options);
    });
    const result = await test.execute(selection);
    expect(injected).toBe(true);
    expect(result.resumed).toBe(readback === 'verified');
    expect(test.runtime.session.id).toBe(readback === 'verified' ? test.source.id : test.current.id);
    expect(test.runtime.workspaceIssue).toContain(readback === 'verified' ? 'lock could not be released' : 'Restart');
    expect(test.lines.join('\n')).not.toContain('PRIVATE_LOCK_RELEASE_BODY');
    expect(fs.readFileSync(path.join(root, '.cheers', 'current-session.json'))).toEqual(pointer);
    if (readback === 'verified') {
      expect(result).toMatchObject({ resumed: true, autoResume: null });
      expect(test.manager.getCurrentSessionForProject(root)?.id).toBe(test.source.id);
      expect(test.lines.join('\n')).toContain('was activated');
      expect(test.lines.join('\n')).not.toContain('Resumed session');
    } else {
      expect(test.lines.join('\n')).toContain('could not be verified');
    }
  });

it('fences an unknown activation when the current-session writer publishes then throws', async () => {
  const test = setup();
  const selection = { sessionId: test.source.id, version: readSessionNavigation(test.source.id, root).version,
    admission: () => undefined };
  const setCurrent = test.manager.setCurrentSessionForProject.bind(test.manager);
  let pointer: Buffer | undefined;
  vi.spyOn(test.manager, 'setCurrentSessionForProject').mockImplementation((...args) => {
    setCurrent(...args);
    pointer = fs.readFileSync(path.join(root, '.cheers', 'current-session.json'));
    throw new Error('PRIVATE_POST_PUBLICATION_BODY');
  });
  expect(await test.execute(selection)).toEqual({ resumed: false });
  expect(test.runtime.session.id).toBe(test.current.id);
  expect(test.runtime.workspaceIssue).toContain('Restart');
  expect(test.lines.join('\n')).toContain('could not be verified');
  expect(test.lines.join('\n')).not.toContain('PRIVATE_POST_PUBLICATION_BODY');
  expect(fs.readFileSync(path.join(root, '.cheers', 'current-session.json'))).toEqual(pointer);
  expect(test.manager.getCurrentSessionForProject(root)?.id).toBe(test.source.id);
});
