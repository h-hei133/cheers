import { expect, it, vi } from 'vitest';
import { StartupSurface } from './startup.js';
import { startupEligible } from './startup/eligibility.js';
import { RecordingTerminal, ManualScheduler } from '../../test-utils/terminalDouble.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';

it.each([[], ['--project', '/fixture', '--no-skills'], ['--profile=test', '--offline']].map(args => [args]))(
  'permits an explicit interactive prepaint: %j', args => { expect(startupEligible(args, true)).toBe(true); });
it.each([['--print'], ['--json'], ['--session-id', 'old'], ['--replay-file', 'file'], ['--doctor'], ['serve'],
  ['prompt text'], ['--project'], ['--profile='], ['--', 'text'], ['--help'], ['--version']].map(args => [args]))(
  'keeps other launches out of the early terminal owner: %j', args => { expect(startupEligible(args, true)).toBe(false); });
it('never prepaints a pipe', () => { expect(startupEligible([], false)).toBe(false); });

it('paints and edits one draft without dispatching Enter before readiness', async () => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler(), exit = vi.fn();
  const surface = new StartupSurface(terminal, scheduler, exit);
  try {
    expect(stripAnsi(terminal.drain())).toContain('Loading');
    terminal.input('draft\rnext\x1b[D!'); scheduler.flush();
    await vi.waitFor(() => expect(surface.state.editor.getText()).toBe('draft\nnex!t'));
    expect(surface.state.editor.getText()).toBe('draft\nnex!t'); expect(exit).not.toHaveBeenCalled();
    surface.adopt(false);
    expect(surface.state.editor.getText()).toBe('draft\nnex!t');
    expect(() => surface.adopt(false)).toThrow('ownership');
    surface.dispose(); expect(terminal.stopped).toBe(false);
  } finally { surface.tui.stop(); surface.dispose(); }
});

it('refuses oversized paste as a whole and restores the terminal on startup cancellation', () => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler(), exit = vi.fn();
  const surface = new StartupSurface(terminal, scheduler, exit);
  terminal.input('\x1b[200~' + 'x'.repeat(32769) + '\x1b[201~'); scheduler.flush();
  expect(surface.state.editor.getText()).toBe(''); expect(stripAnsi(terminal.drain())).toContain('Startup draft limit');
  terminal.input('\x03'); expect(exit).toHaveBeenCalledWith(130); expect(terminal.stopped).toBe(true);
  expect(() => surface.adopt(true)).toThrow('ownership'); surface.dispose();
});

it('carries accepted and partial appearance reports into the adopted parser', () => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const surface = new StartupSurface(terminal, scheduler, vi.fn());
  try {
    terminal.input('\x1b[?997;2n');
    surface.adopt(true);
    const appearance = vi.fn(); const release = surface.input.onAppearance(appearance);
    expect(appearance).toHaveBeenLastCalledWith('light');
    surface.tui.onInput(data => surface.input.feed(data));
    terminal.input('\x1b[?997;'); terminal.input('1n');
    expect(appearance.mock.calls).toEqual([['light'], ['dark']]);
    expect(surface.state.editor.getText()).toBe('');
    release(); terminal.input('\x1b[?997;2n'); expect(appearance).toHaveBeenCalledTimes(2);
  } finally { surface.input.dispose(); surface.tui.stop(); surface.dispose(); }
});

it('binds readiness to the adopted write and cancels it on terminal failure', async () => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const written: Array<() => void> = [];
  vi.spyOn(terminal, 'write').mockImplementation((data, callback) => { terminal.writes.push(data); if (callback) written.push(callback); });
  const surface = new StartupSurface(terminal, scheduler, vi.fn());
  const ready = vi.fn();
  try {
    const painted = vi.fn(); void surface.firstPaint.then(painted);
    expect(painted).not.toHaveBeenCalled(); written[0]?.(); await surface.firstPaint;
    expect(painted).toHaveBeenCalledOnce();
    written.length = 0;
    const loading = vi.fn(); surface.tui.transfer(true, loading); surface.tui.renderNow();
    surface.adopt(true, ready); surface.tui.renderNow();
    written[0]?.(); expect(ready).not.toHaveBeenCalled(); expect(loading).not.toHaveBeenCalled();
    written[1]?.(); expect(ready).toHaveBeenCalledOnce();
    const late = vi.fn(); surface.tui.transfer(false, late); surface.tui.renderNow();
    surface.tui.stop(); written.at(-1)?.(); expect(late).not.toHaveBeenCalled();
  } finally { surface.input.dispose(); surface.tui.stop(); surface.dispose(); }
});
