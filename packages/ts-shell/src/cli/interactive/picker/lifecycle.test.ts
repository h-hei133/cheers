import { expect, it, vi } from 'vitest';
import { PickerLifecycles } from './lifecycle.js';
import { OverlayHost, type Picker } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const picker = (overrides: Partial<Picker> = {}): Picker => ({ title: 'Fixture', form: 'panel', empty: '',
  load: async () => [{ id: 'choice', label: 'Choice' }], apply: async () => undefined, ...overrides });

it.each((['rows', 'input'] as const).flatMap(surface =>
  (['prepare', 'cleanup', 'notify', 'construct'] as const).flatMap(stage =>
    (['close', 'replace', 'keep'] as const).map(ending => ({ surface, stage, ending })))))(
  'revalidates $surface Escape return when $stage will $ending its host and settles the original lifetime', async ({ surface, stage, ending }) => {
    const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), replacementController = lifetimes.begin();
    let armed = false;
    const effect = vi.fn(() => {
      if (!armed) return; armed = false;
      if (ending === 'close') host.close();
      else if (ending === 'replace') host.open(lifetimes.track(picker({ title: 'Replacement' }), replacementController, false));
    });
    const host = new OverlayHost(() => { if (armed && stage === 'notify') effect(); });
    const parent = picker({ title: 'Original parent' });
    const back = vi.fn(() => { if (stage === 'construct') effect(); return parent; });
    const ended = vi.fn(() => { if (stage === 'cleanup') effect(); });
    const child = lifetimes.track(picker({ title: 'Child', back, previewEnd: ended,
      previewBack: () => { if (stage === 'prepare') effect(); },
      ...(surface === 'input' ? { input: { initial: 'held form draft', label: 'Value', validate: () => undefined,
        apply: async () => undefined } } : {}) }), controller, false);
    try {
      host.open(child); await settle(); armed = true;
      host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
      expect(effect).toHaveBeenCalledOnce(); expect(ended).toHaveBeenCalledOnce();
      expect(host.active).toBe(ending !== 'close');
      if (ending === 'replace') expect(host.render(100, 25).join('\n')).toContain('Replacement');
      if (ending === 'keep') expect(host.render(100, 25).join('\n')).toContain('Original parent');
      expect(back).toHaveBeenCalledTimes(ending === 'keep' || stage === 'construct' ? 1 : 0);
      expect(lifetimes.controllerFor(child)).toBeUndefined();
      expect(controller.signal.aborted).toBe(ending !== 'keep');
      expect(replacementController.signal.aborted).toBe(false);
    } finally { armed = false; host.close(); lifetimes.abortAll(); }
  });

it.each(['delete', 'rename'] as const)('keeps a %s confirmation Escape inside its child before returning to a parent', async mutation => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), host = new OverlayHost(() => {});
  const back = vi.fn(() => picker({ title: 'Parent' })), change = vi.fn();
  host.open(lifetimes.track(picker({ back, onDelete: change, onRename: change }), controller, false)); await settle();
  try {
    host.handleKey(parseKeyEvent(mutation === 'delete' ? '\x1b[3~' : '\x12'), vi.fn());
    expect(host.render(100, 25).join('\n')).toContain(mutation === 'delete' ? 'Delete' : 'New title:');
    host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
    expect(back).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
    expect(host.render(100, 25).join('\n')).toContain('Choice'); expect(controller.signal.aborted).toBe(false);
    host.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
    expect(back).toHaveBeenCalledOnce(); expect(host.render(100, 25).join('\n')).toContain('Parent');
  } finally { host.close(); lifetimes.abortAll(); }
});

it.each(['prepare', 'construct'] as const)('cancels the original lifetime if parent return %s throws', async stage => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), host = new OverlayHost(() => {});
  const failure = new Error('Parent return unavailable');
  const cancelled = vi.fn();
  host.open(lifetimes.track(picker({
    previewBack: () => { if (stage === 'prepare') throw failure; return cancelled; },
    back: () => { throw failure; },
  }), controller, false)); await settle();
  try {
    expect(() => host.handleKey(parseKeyEvent('\x1b'), vi.fn())).toThrow(failure);
    expect(controller.signal.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledTimes(stage === 'construct' ? 1 : 0);
  } finally { host.close(); lifetimes.abortAll(); }
});

it('aborts an abandoned parent lifetime even when the original cancellation cleanup throws', async () => {
  const lifetimes = new PickerLifecycles(), controller = lifetimes.begin(), host = new OverlayHost(() => {});
  const failure = new Error('Return cleanup unavailable'), cancelled = vi.fn(() => { throw failure; });
  host.open(lifetimes.track(picker({ previewBack: () => cancelled,
    back: () => { host.close(); return picker({ title: 'Obsolete parent' }); },
  }), controller, false)); await settle();
  try {
    expect(() => host.handleKey(parseKeyEvent('\x1b'), vi.fn())).toThrow(failure);
    expect(cancelled).toHaveBeenCalledOnce(); expect(controller.signal.aborted).toBe(true); expect(host.active).toBe(false);
  } finally { host.close(); lifetimes.abortAll(); }
});

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
