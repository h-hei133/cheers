import { afterEach, expect, it, vi } from 'vitest';
import type { CommandContext, LocalCommandResult } from '../../../core/commands/types.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { PickerLifecycles } from './lifecycle.js';
import { usagePicker } from './usage.js';
import { getSessionUsage, recordSessionUsage, resetSessionUsage } from '../../../observability/usageTelemetry.js';
import { Pager, pageLongOutput } from '../../../presentation/tui/chrome/pager.js';
import { reportText } from '../../../core/commands/report/projection.js';
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

afterEach(() => { vi.restoreAllMocks(); });

function fixture() {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin();
  const read = vi.fn(() => ({ config: {} as never, catalog: [], revision: 1 }));
  const account = vi.fn(async (): Promise<LocalCommandResult> => ({ kind: 'local', output: 'Account result' }));
  const context: CommandContext = { cwd: '/usage-fixture', sessionId: 'usage-cancellation',
    signal: controller.signal, readConfiguration: read, usageCommand: account };
  const picker = lifetimes.track(usagePicker(context), controller, true);
  return { lifetimes, controller, read, account, picker };
}

it('rejects an already cancelled usage opening before reading configuration', async () => {
  const { controller, read, picker } = fixture(); controller.abort();
  await expect(picker.load()).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).not.toHaveBeenCalled();
});

it.each(['admission', 'configuration'] as const)('rejects a usage opening cancelled within %s', async phase => {
  const controller = new AbortController();
  const read = vi.fn(() => { if (phase === 'configuration') controller.abort(); return { config: {} as never, catalog: [], revision: 1 }; });
  const picker = usagePicker({ cwd: '/usage-fixture', signal: controller.signal, readConfiguration: read,
    admission: () => { if (phase === 'admission') controller.abort(); return undefined; } });
  await expect(picker.load()).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).toHaveBeenCalledTimes(phase === 'admission' ? 0 : 1);
});

it('withholds overview when its fresh configuration read cancels the owner', async () => {
  const controller = new AbortController(); let reads = 0;
  const picker = usagePicker({ cwd: '/usage-fixture', signal: controller.signal,
    readConfiguration: () => { if (++reads === 3) controller.abort(); return { config: {} as never, catalog: [], revision: 1 }; } });
  await picker.load(); await expect(picker.apply(['overview'])).resolves.toBeUndefined();
  expect(reads).toBe(3);
});

it.each(['overview', 'account', 'reset-status'])('withholds retired %s actions after real host closure', async action => {
  const { controller, read, account, picker } = fixture(), host = new OverlayHost(() => {});
  const load = vi.spyOn(picker, 'load'); host.open(picker);
  try {
    await load.mock.results[0]!.value;
    await vi.waitFor(() => expect((host as unknown as { model: { total: number } }).model.total).toBe(3));
    host.close(); expect(controller.signal.aborted).toBe(true);
    read.mockClear();
    expect(await picker.apply([action])).toBeUndefined();
    expect(picker.isCurrent?.()).toBe(false);
    expect(read).not.toHaveBeenCalled(); expect(account).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it.each(['success', 'error'] as const)('withholds an accepted account %s after original cancellation', async outcome => {
  const { lifetimes, controller, account, picker } = fixture(), host = new OverlayHost(() => {});
  let settle!: () => void;
  account.mockImplementation(() => new Promise<LocalCommandResult>((resolve, reject) => {
    settle = () => outcome === 'success' ? resolve({ kind: 'local', output: 'Late account result' }) : reject(new Error('Late account failure'));
  }));
  const load = vi.spyOn(picker, 'load'); host.open(picker);
  let pending: Promise<unknown> | undefined;
  try {
    await load.mock.results[0]!.value;
    await vi.waitFor(() => expect((host as unknown as { model: { total: number } }).model.total).toBe(3));
    host.handlePaste('Account quota');
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['account']); expect(controller.signal.aborted).toBe(false);
    pending = picker.apply(['account']); expect(account).toHaveBeenCalledOnce();
    lifetimes.abortAll(); expect(controller.signal.aborted).toBe(true); settle();
    expect(await pending).toBeUndefined();
  } finally { settle?.(); await pending; host.close(); }
});

it('keeps accepted account work independent of the retired browser signal', async () => {
  const { controller, account, picker } = fixture(), host = new OverlayHost(() => {});
  const load = vi.spyOn(picker, 'load'); host.open(picker);
  try {
    await load.mock.results[0]!.value;
    await vi.waitFor(() => expect((host as unknown as { model: { total: number } }).model.total).toBe(3));
    host.handlePaste('Account quota');
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['account']); expect(load.mock.calls[0]![0]?.aborted).toBe(true);
    expect(controller.signal.aborted).toBe(false);
    await expect(picker.apply(['account'])).resolves.toEqual({ note: 'Account result' });
    expect(account).toHaveBeenCalledOnce();
  } finally { host.close(); }
});

it('opens the actual usage overview reader repeatedly without account fetches or drawing acquisitions', async () => {
  const sessionId = 'usage-cancellation'; resetSessionUsage(sessionId);
  recordSessionUsage(sessionId, { provider: 'fixture', model: 'overview', promptTokens: 100, completionTokens: 10 });
  const before = JSON.stringify(getSessionUsage(sessionId)), pager = new Pager();
  try {
    for (let round = 0; round < 10; round++) {
      const { lifetimes, controller, read, account, picker } = fixture(), host = new OverlayHost(() => {});
      const load = vi.spyOn(picker, 'load'); host.open(picker);
      try {
        await load.mock.results[0]!.value;
        await vi.waitFor(() => expect((host as unknown as { model: { total: number } }).model.total).toBe(3));
        const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
        expect(apply).toHaveBeenCalledWith(picker, ['overview']); expect(controller.signal.aborted).toBe(false);
        const outcome = await picker.apply(['overview']), report = outcome!.report!;
        expect(report.facts).toMatchObject({ recordedTokens: 110, recordedTurns: 1, shownModels: 1 });
        const block = { text: reportText(report), report, collapsed: false }, snapshot = JSON.stringify(report);
        expect(pageLongOutput(pager, '/usage', block)).toBe(true); expect(block.collapsed).toBe(true);
        const acquisitions = read.mock.calls.length;
        pager.handlePaste('tokens');
        for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
          const frame = pager.render(width, height, height);
          expect(frame.length).toBeLessThanOrEqual(height); expect(frame.every(line => visibleWidth(line) <= width)).toBe(true);
        }
        pager.handleKey('escape', undefined, 24);
        expect(pager.active).toBe(false); expect(pager.text).toBe('');
        expect(pager as unknown as { report?: unknown; rows: unknown[]; filter: string }).toMatchObject({ report: undefined, rows: [], filter: '' });
        expect(read).toHaveBeenCalledTimes(acquisitions); expect(account).not.toHaveBeenCalled();
        expect(block.report).toBe(report); expect(JSON.stringify(report)).toBe(snapshot);
        expect(JSON.stringify(getSessionUsage(sessionId))).toBe(before);
      } finally { host.close(); pager.close(); lifetimes.abortAll(); }
    }
  } finally { resetSessionUsage(sessionId); }
});
