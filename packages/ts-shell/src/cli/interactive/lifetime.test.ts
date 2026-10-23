import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InteractiveMode } from './interactiveMode.js';
import { RecordingTerminal } from '../../test-utils/terminalDouble.js';
import { SessionManager } from '../../session/SessionManager.js';
import { readSessionNavigation } from '../../session/query/navigation.js';
import type { SavedSessionSelection } from '../../session/navigation/selection.js';
import { createSessionStoreLayout, locateExistingSessionLayout } from '../../session/store/sessionFileLayout.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { resumeShellSession } from '../../core/shell/recovery.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { PickerHost } from './picker/registry.js';

let root: string;
let mode: InteractiveMode | undefined;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), '.tmp-selection-lifetime-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
});
afterEach(() => { mode?.stop(); mode = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true }); });

it.each(['open', 'stopped', 'closing', 'cancelled', 'aborted'] as const)(
  'revalidates the actual picker host after delayed resolution when the surface is %s', async state => {
    const manager = new SessionManager();
    const target = manager.createNew(root);
    manager.addTurn(target.id, { role: 'user', content: 'Saved choice' });
    const current = manager.createNew(root);
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
      rootMode: 'direct', targetPathBase: root, gitRoot: null,
      gitContext: { insideGit: false, root: null, branch: null, isClean: true },
      runtimeConfig: getRuntimeConfig(root), session: current });
    const renderer = new StreamingRenderer();
    vi.spyOn(renderer, 'renderLine').mockImplementation(() => {});
    const controller = new AbortController();
    let activeController: AbortController | null = null;
    const options = { runtimeContext: context, sessionManager: manager, renderer,
      terminal: new RecordingTerminal(), setReadline: () => {},
      sessionRuntime: { observeEvents: () => () => {}, getAgentMode: () => 'build',
        getPermissionScope: () => 'ask', getCurrentRunController: () => activeController,
        cancelAndWait: async () => {} }, logger: { info: () => {}, warn: () => {}, error: () => {} },
      approvalTrustPolicy: {}, initialMcpGateway: {} };
    mode = new InteractiveMode(options as unknown as ConstructorParameters<typeof InteractiveMode>[0]);
    const host = mode as unknown as { pickerHost(): PickerHost; busy: boolean; closing: boolean;
      interrupt(): Promise<void>; runCommandLine(line: string, selection: SavedSessionSelection): Promise<undefined> };
    // The host is idle when the choice is accepted. Its own command becomes busy
    // during resolution, which must not invalidate an otherwise live selection.
    let result: Awaited<ReturnType<typeof resumeShellSession>> | undefined;
    vi.spyOn(host, 'runCommandLine').mockImplementation(async (_line, selection) => {
      host.busy = true;
      result = await resumeShellSession({ requestedSessionId: target.id, selection,
        sessionManager: manager, runtimeContext: context, renderer });
      return undefined;
    });
    let release!: () => void;
    const resolve = manager.catalog.resolve.bind(manager.catalog);
    vi.spyOn(manager.catalog, 'resolve').mockImplementationOnce(async (...args) => {
      await new Promise<void>(done => { release = done; }); return resolve(...args);
    });
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), target.id);
    const bytes = () => [layout.statePath, layout.metadataPath, layout.transcriptPath,
      path.join(root, '.cheers', 'current-session.json')].map(file => fs.readFileSync(file));
    const before = bytes();
    const pending = host.pickerHost().resumeSession!(target.id, readSessionNavigation(target.id, root).version);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    if (state === 'stopped') mode.stop();
    if (state === 'closing') host.closing = true;
    if (state === 'cancelled') await host.interrupt();
    if (state === 'aborted') {
      controller.abort(); activeController = controller;
    }
    release(); await pending;
    expect(result?.resumed).toBe(state === 'open');
    expect(context.session.id).toBe(state === 'open' ? target.id : current.id);
    expect(manager.getCurrentSessionForProject(root)?.id).toBe(state === 'open' ? target.id : current.id);
    if (state !== 'open') expect(bytes()).toEqual(before);
  });
