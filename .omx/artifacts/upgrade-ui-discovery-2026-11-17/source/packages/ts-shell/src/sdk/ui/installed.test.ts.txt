import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createAgentSession, DefaultResourceLoader, type ExtensionUiHost } from '../../index.js';
import { extensionHostFor } from '../../cli/runtime/extensions/host.js';
import { executeInProcessScript } from '../../extensions/runtime/inProcessLoader.js';
import type { VersionRecord } from '../../extensions/model.js';

let root: string;
beforeEach(() => {
  const temporary = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporary, { recursive: true });
  root = fs.mkdtempSync(path.join(temporary, 'sdk-ui-worker-'));
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  vi.stubEnv('CHEERS_PROVIDER_MODE', 'synthetic');
  vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(root, 'registry.json'));
  vi.stubEnv('CHEERS_PLUGINS_FILE', path.join(root, 'legacy.json'));
  vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(root, 'sources.json'));
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function held<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}

it.each(['options.ui', 'bindUi'] as const)(
  'renews %s for a fresh installed-worker consumer of the original shared host', async mode => {
    const source = `
import { defineExtension } from '@cheers/extension-api';
export default defineExtension(async api => {
  await Promise.resolve();
  api.registerTool({
    name: 'worker_ui',
    description: 'Ask through the captured worker host.',
    argsSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    execute: async args => {
      const title = String(args.title);
      const answer = await api.ui.input(title);
      const continuation = title === 'Before publication' ? await api.ui.input('Retired worker continuation') : undefined;
      await api.ui.notify('Answered ' + title);
      return { success: true, output: JSON.stringify({ answer: answer ?? null,
        ...(title === 'Before publication' ? { continuation: continuation ?? null } : {}) }) };
    },
  });
});
`;
    const scriptFile = path.join(root, 'worker.ts'); fs.writeFileSync(scriptFile, source);
    const record: VersionRecord = {
      source: 'isolated-worker-fixture',
      sourceIdentity: 'c'.repeat(64),
      trustFingerprint: 'd'.repeat(64),
      digest: createHash('sha256').update(source).digest('hex'),
      url: 'https://fixture.invalid/sdk-ui-worker.tgz',
      files: {}, directories: [], storage: [],
      manifest: {
        schema: 1, name: 'sdk-ui-worker', version: '1.0.0',
        permissions: { workspace: 'read', network: 'none' }, skills: [],
        scripts: [{ name: 'main', path: 'worker.ts' }], commands: [], tools: [],
      },
    };
    const original = held<string | undefined>();
    const next = held<string | undefined>();
    const signals: Array<AbortSignal | undefined> = [];
    const input = vi.fn<NonNullable<ExtensionUiHost['input']>>((title, _placeholder, options) => {
      signals.push(options?.signal);
      if (title === 'Before publication') return original.promise;
      if (title === 'After publication') return next.promise;
      return Promise.resolve('Unexpected worker input');
    });
    const notify = vi.fn();
    const host: ExtensionUiHost = { input, notify };
    const loader = new DefaultResourceLoader({ cwd: root, noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true });
    await loader.reload();
    const { session } = await createAgentSession({ cwd: root, resourceLoader: loader, noTools: 'all',
      ...(mode === 'options.ui' ? { ui: host } : {}) });
    const release = mode === 'bindUi' ? session.bindUi(host) : undefined;
    const firstController = new AbortController();
    const nextController = new AbortController();
    const workers: Array<Promise<unknown>> = [];
    try {
      // This is the raw bridge retained by ExtensionService/executeScript,
      // not the renewing SDK loader/contribution facade.
      const shared = extensionHostFor(session.runtimeContext);
      expect(shared).toBeDefined();
      const invoke = (title: string, controller: AbortController) => executeInProcessScript({
        root, scriptFile, record, argv: [], denyRules: () => [],
        context: { workspaceRoot: root, sessionId: session.sessionId, taskId: title, abortSignal: controller.signal },
        invoke: { kind: 'tool', name: 'worker_ui', args: { title } },
        host: shared,
      });
      const first = invoke('Before publication', firstController);
      const firstObserved = first.catch(() => undefined); workers.push(firstObserved);
      await vi.waitFor(() => expect(input).toHaveBeenCalledTimes(1), { timeout: 3000 });
      expect(signals[0]?.aborted).toBe(false);
      const state = session.runtimeContext.configuration;
      const before = state.current;
      const background = state.backgroundSignal;
      const substrate = state.substrateRevision;
      expect(state.publish(state.begin(before.binding), before.requested, before.binding).status).toBe('applied');
      expect(state.current.revision).toBeGreaterThan(before.revision);
      expect(state.current.binding).toEqual(before.binding);
      expect(state.substrateRevision).toBe(substrate);
      expect(background.aborted).toBe(true);
      expect(signals[0]?.aborted).toBe(true);
      const firstResult = await firstObserved;
      expect(firstResult?.success).toBe(true);
      expect(JSON.parse(String(firstResult?.metadata?.eventOutput))).toEqual({ answer: null, continuation: null });
      expect(firstResult?.metadata?.registeredTools).toEqual([{ name: 'worker_ui', description: 'Ask through the captured worker host.' }]);
      expect(input).toHaveBeenCalledTimes(1);
      expect(notify).not.toHaveBeenCalled();
      expect(extensionHostFor(session.runtimeContext)).toBe(shared);

      let nextSettled = false;
      // No SDK api.ui call intervenes to incidentally renew the raw host.
      const second = invoke('After publication', nextController);
      const secondObserved = second.then(result => { nextSettled = true; return result; }, () => { nextSettled = true; return undefined; });
      workers.push(secondObserved);
      await vi.waitFor(() => expect(input).toHaveBeenCalledTimes(2), { timeout: 3000 });
      expect(input.mock.calls[1]?.[0]).toBe('After publication');
      expect(signals[1]?.aborted).toBe(false);
      original.resolve('Late original answer');
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(nextSettled).toBe(false);
      expect(signals[1]?.aborted).toBe(false);
      expect(notify).not.toHaveBeenCalled();
      next.resolve('Fresh worker answer');
      const secondResult = await secondObserved;
      expect(secondResult?.success).toBe(true);
      expect(JSON.parse(String(secondResult?.metadata?.eventOutput))).toEqual({ answer: 'Fresh worker answer' });
      expect(secondResult?.metadata?.registeredTools).toEqual([{ name: 'worker_ui', description: 'Ask through the captured worker host.' }]);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith('Answered After publication', undefined);
    } finally {
      firstController.abort(); nextController.abort();
      original.resolve(undefined); next.resolve(undefined);
      await Promise.allSettled(workers);
      release?.();
      await session.dispose();
    }
  },
  10_000,
);
