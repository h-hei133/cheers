import { afterEach, expect, it, vi } from 'vitest';
import { getPwRuntimeStatus, importPwRuntime } from './playwrightRuntime.js';

afterEach(() => {
  vi.doUnmock('@cheers/browser');
  vi.resetModules();
});

it('loads the packaged driver probe and preserves installed runtime selection', async () => {
  const launch = vi.fn();
  const driver = { chromium: { launch, executablePath: () => '/tested/browser' } };
  const importer = vi.fn(async (specifier: string) => specifier === 'playwright' ? driver : undefined);
  const result = await getPwRuntimeStatus({ importer, fsExists: value => value === '/tested/browser',
    env: { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '' }, platform: 'linux' });
  expect(result).toMatchObject({ status: 'ready', reasonCode: 'ready', dependency: 'playwright',
    executablePath: '/tested/browser', executableSource: 'playwright-cache', passiveStatusCheck: true, browserLaunched: false });
  expect(importer.mock.calls).toEqual([['playwright-core'], ['playwright']]);
  expect(launch).not.toHaveBeenCalled();
  expect(await importPwRuntime(importer)).toMatchObject({ ok: true, module: driver });
});

it('does not load the optional browser package for a disabled probe', async () => {
  const load = vi.fn(() => ({ getPwRuntimeStatus: vi.fn(), importPwRuntime: vi.fn() }));
  vi.doMock('@cheers/browser', load);
  const disabled = await getPwRuntimeStatus({ enabled: false });
  expect(disabled).toMatchObject({ status: 'disabled', dependency: 'none', passiveStatusCheck: true, browserLaunched: false });
  expect(load).not.toHaveBeenCalled();
});
