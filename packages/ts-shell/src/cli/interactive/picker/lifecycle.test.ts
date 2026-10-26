import { expect, it, vi } from 'vitest';
import { PickerLifecycles } from './lifecycle.js';
import { OverlayHost, type Picker } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const picker = (overrides: Partial<Picker> = {}): Picker => ({ title: 'Fixture', form: 'panel', empty: '',
  load: async () => [{ id: 'choice', label: 'Choice' }], apply: async () => undefined, ...overrides });

it.each(['rows', 'input'] as const)('transfers a %s child lifetime to its parent on actual Escape, retires its local preview and cancels at the root', async surface => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), ended = vi.fn(), parentEnded = vi.fn();
  const parent = picker({ title: 'Parent', previewEnd: parentEnded });
  const child = picker({ title: 'Child', back: () => parent, previewEnd: ended,
    ...(surface === 'input' ? { input: { initial: 'draft', label: 'Text', validate: () => undefined, apply: async () => undefined } } : {}) });
  const tracked = lifetimes.track(child, controller, false), host = new OverlayHost(() => {});
  try {
    host.open(tracked); await settle(); host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
    expect(ended).toHaveBeenCalledOnce(); expect(controller.signal.aborted).toBe(false);
    expect(lifetimes.controllerFor(tracked)).toBeUndefined(); expect(host.render(80, 20).join('\n')).toContain('Parent');
    host.close(); expect(parentEnded).toHaveBeenCalledOnce(); expect(controller.signal.aborted).toBe(true);
  } finally { host.close(); lifetimes.abortAll(); }
});

it('cancels a failed parent construction after retiring the child preview', async () => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), ended = vi.fn(), host = new OverlayHost(() => {});
  host.open(lifetimes.track(picker({ previewEnd: ended, back: () => { throw new Error('Unavailable parent'); } }), controller, false));
  await settle(); expect(() => host.handleKey(parseKeyEvent('\x1b'), vi.fn())).toThrow('Unavailable parent');
  expect(ended).toHaveBeenCalledOnce(); expect(controller.signal.aborted).toBe(true); expect(host.active).toBe(false);
});

it('cancels all active parent owners on shutdown after a child returns', async () => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), host = new OverlayHost(() => {});
  host.open(lifetimes.track(picker({ back: () => picker() }), controller, false)); await settle();
  host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle(); expect(controller.signal.aborted).toBe(false);
  lifetimes.abortAll(); expect(controller.signal.aborted).toBe(true); host.close();
});

it.each(['inspection', 'input'] as const)('keeps a %s action wrapper bound to its original tracked browser through child continuation and closure', async surface => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), host = new OverlayHost(() => {});
  const activate = vi.fn(), inspect = vi.fn(async () => ({ next: picker({ title: 'Child' }) }));
  const source = picker(surface === 'inspection' ? { load: async () => [{ id: 'missing', label: 'Missing', disabled: true, focusable: true }],
    inspect, apply: activate } : { input: { initial: 'draft', label: 'Value', validate: () => undefined, apply: async () => ({ next: picker({ title: 'Child' }) }) } });
  const tracked = lifetimes.track(source, controller, false); host.open(tracked); await settle();
  let work: Promise<unknown> | undefined;
  try {
    host.handleKey(parseKeyEvent('\r'), (selected, ids) => {
      expect(lifetimes.controllerFor(selected)).toBe(controller);
      work = selected.apply(ids).then(outcome => {
        expect(outcome?.next).toBeDefined();
        host.open(lifetimes.track(outcome!.next!, controller, false)); lifetimes.finish(selected, controller);
      });
    }); await work; await settle();
    expect(lifetimes.controllerFor(tracked)).toBeUndefined(); expect(controller.signal.aborted).toBe(false);
    expect(host.render(80, 20).join('\n')).toContain('Child'); expect(activate).not.toHaveBeenCalled();
    host.close(); expect(controller.signal.aborted).toBe(true);
  } finally { host.close(); lifetimes.abortAll(); }
});
