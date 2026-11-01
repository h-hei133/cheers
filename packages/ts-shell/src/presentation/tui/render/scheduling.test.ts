import { expect, it } from 'vitest';
import { TUI } from './engine.js';
import type { RenderScheduler } from './frame.js';
import { RecordingTerminal } from '../../../test-utils/terminalDouble.js';

it.each([false, true])('paints through continuous requests after a costly frame in alternate=%s', useAlternateScreen => {
  let now = 0, nextId = 0, frames = 0, row = 'initial';
  const timers = new Map<number, { due: number; run: () => void }>();
  const scheduler: RenderScheduler = {
    now: () => now,
    setImmediate: callback => { callback(); return ++nextId; },
    setTimeout: (run, delay) => { const id = ++nextId; timers.set(id, { due: now + delay, run }); return id; },
    clearTimeout: id => { timers.delete(id as number); },
  };
  const advance = (duration: number) => {
    const until = now + duration;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > until) break;
      now = next[1].due; timers.delete(next[0]); next[1].run();
    }
    now = Math.max(now, until);
  };
  const terminal = new RecordingTerminal(), tui = new TUI(terminal, scheduler);
  tui.setFrameProvider({ renderFrame: () => {
    if (++frames === 1) now += 100;
    return { rows: [row], fullScreen: true };
  } });
  try {
    tui.start({ useAlternateScreen }); advance(33); terminal.drain();
    expect(frames).toBe(1);
    for (let index = 1; index <= 8; index++) {
      row = `latest-${index}`; tui.requestRender(); advance(50);
      expect(timers.size).toBeLessThanOrEqual(1);
    }
    expect(frames).toBeGreaterThan(1);
    expect(terminal.drain()).toContain('latest-8');
  } finally { tui.stop(); }
  expect(timers.size).toBe(0);
});
