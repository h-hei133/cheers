import { afterEach, describe, expect, it, vi } from "vitest";
const clock = vi.hoisted(() => ({ now: vi.fn(() => 0) }));
const loop = vi.hoisted(() => ({
  enable: vi.fn(),
  count: 2,
  min: 1_000_000,
  mean: 3_000_000,
  max: 9_000_000,
  percentile: vi.fn((value: number) => value === 50 ? 2_000_000 : value === 95 ? 7_000_000 : 8_000_000),
}));
vi.mock('node:perf_hooks', () => ({
  performance: clock,
  monitorEventLoopDelay: vi.fn(() => loop),
}));

async function loadWith(env: string | undefined) {
  vi.resetModules();
  vi.stubEnv('CHEERS_TIMING', env);
  return import("./startupTiming.js");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.useRealTimers();
  clock.now.mockReset();
  loop.enable.mockClear();
  loop.percentile.mockClear();
});

describe('startup timing', () => {
  it.each([undefined, 'true'])('records nothing and installs no observers with gate %s', async env => {
    const timing = await loadWith(env);
    timing.time('first');
    expect(timing.startupObservers()).toEqual({});
    expect(clock.now).not.toHaveBeenCalled();
    expect(loop.enable).not.toHaveBeenCalled();
    expect(timing.formatTimingReport()).toContain('No timing recorded');
  });

  it('includes time before module evaluation and ignores wall-clock changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000000);
    clock.now.mockReturnValue(120);
    const timing = await loadWith('1');
    clock.now.mockReturnValue(140); timing.time('modules loaded');
    vi.setSystemTime(1);
    clock.now.mockReturnValue(200); timing.time('bootstrap');
    const report = timing.formatTimingReport();
    expect(report).toContain('modules loaded: 140.0ms (elapsed 140.0ms)');
    expect(report).toContain('bootstrap: 60.0ms (elapsed 200.0ms)');
    expect(report).toContain('total: 200.0ms');
    expect(report).toContain('Excludes parent launcher time');
    expect(report).toContain('not visible terminal pixels');
    expect(timing.timingSnapshot().eventLoop).toMatchObject({ count: 2, p95Ms: 7 });
  });

  it('records actual observer events and keeps namespaces apart', async () => {
    const timing = await loadWith('1');
    const observers = timing.startupObservers();
    expect(timing.formatTimingReport()).toContain('No timing recorded');
    clock.now.mockReturnValue(10); observers.onInputReady!();
    clock.now.mockReturnValue(20); observers.onFirstLayout!();
    expect(timing.formatTimingReport()).not.toContain('first frame write completed');
    clock.now.mockReturnValue(30); observers.onFirstWrite!();
    clock.now.mockReturnValue(40); timing.time('other phase', 'other');
    expect(timing.formatTimingReport()).toContain('first frame write completed: 10.0ms (elapsed 30.0ms)');
    expect(timing.formatTimingReport()).not.toContain('other phase');
    expect(timing.formatTimingReport('other')).toContain('other phase: 40.0ms');
  });
});
