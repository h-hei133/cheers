import { createViewState, type ViewState } from '../../presentation/tui/surface/contract.js';
import { InteractiveSurface } from '../../presentation/tui/surface/view.js';
import { TUI } from '../../presentation/tui/render/engine.js';
import { processTerminal, type TerminalDevice } from '../../presentation/tui/terminal.js';
import type { RenderScheduler } from '../../presentation/tui/render/frame.js';
import { StdinBuffer } from '../../presentation/tui/input/stdinBuffer.js';
import { startupObservers, time } from '../../observability/startupTiming.js';

/** One editor, paste store and terminal engine survive initialization. */
export class StartupSurface {
  readonly state: ViewState = createViewState();
  readonly tui: TUI;
  readonly input = new StdinBuffer();
  readonly firstPaint: Promise<void>;
  private finishPaint: () => void = () => {};
  private readonly releaseInput: () => void;
  private readonly releaseKey: () => void;
  private readonly releasePaste: () => void;
  private transferred = false;
  private stopped = false;
  private notice = 'Loading runtime · Enter adds a line · Esc exits';

  constructor(readonly terminal: TerminalDevice = processTerminal, scheduler?: RenderScheduler,
    private readonly exit: (code: number) => void = code => process.exit(code)) {
    this.firstPaint = new Promise(resolve => { this.finishPaint = resolve; });
    this.tui = new TUI(terminal, scheduler);
    const view = new InteractiveSurface({ facts: () => ({ model: '', provider: '', directory: process.cwd() }), statusItems: () => ['directory'],
      activity: () => undefined, busy: () => false, queuedCount: () => 0, now: Date.now,
      ambient: () => ({ openTodos: 0, peerSessions: 0, runningCommands: 0 }), cancelArmed: () => false,
      overlayFullScreen: () => false, overlayRows: () => [], selection: () => undefined,
      hintStatus: () => ({ toast: this.notice }) }, this.state);
    this.state.editor.placeholder = 'Loading · type a draft';
    this.releaseKey = this.input.onKey(event => {
      if (this.stopped || this.transferred) return;
      if (event.keyId === 'escape' || event.keyId === 'ctrl+c' || event.keyId === 'ctrl+d') { this.dispose(); this.exit(130); return; }
      if (event.text) this.insert(event.text);
      else if (event.name === 'backspace') this.state.editor.backspace();
      else if (event.name === 'delete') this.state.editor.deleteForward();
      else if (event.keyId === 'enter' || event.keyId === 'ctrl+j' || event.keyId === 'shift+enter') this.insert('\n');
      else if (['left', 'right', 'up', 'down'].includes(event.name)) this.state.editor.move(event.name as 'left' | 'right' | 'up' | 'down');
      else if (event.keyId === 'ctrl+a' || event.name === 'home') this.state.editor.move('line-start');
      else if (event.keyId === 'ctrl+e' || event.name === 'end') this.state.editor.move('line-end');
      else if (event.keyId === 'ctrl+u') this.state.editor.kill('line-start');
      this.tui.requestRender();
    });
    this.releasePaste = this.input.onPaste((text, issue) => {
      if (issue) this.notice = 'Paste exceeds the startup draft limit';
      else this.insert(text);
      this.tui.requestRender();
    });
    this.releaseInput = this.tui.onInput(data => this.input.feed(data));
    this.tui.setFrameProvider(view);
    this.tui.setDisconnectHandler(() => { this.dispose(); this.exit(130); });
    process.once('exit', this.dispose);
    try {
      const observers = startupObservers();
      this.tui.start({ useAlternateScreen: true, ...observers, onFirstWrite: () => {
        observers.onFirstWrite?.(); this.finishPaint();
      } });
      this.tui.renderNow();
      time('startup composer shown');
    } catch (error) { this.dispose(); throw error; }
  }

  private insert(text: string): void {
    if (this.state.editor.getText().length + text.length > 32768) { this.notice = 'Startup draft limit reached'; return; }
    this.state.editor.insert(text);
  }

  adopt(alternateScreen: boolean, onFirstWrite?: () => void): void {
    if (this.stopped || this.transferred) throw new Error('Startup surface ownership has already ended.');
    this.releaseInput(); this.releaseKey(); this.releasePaste();
    this.tui.transfer(alternateScreen, onFirstWrite);
    this.transferred = true; process.removeListener('exit', this.dispose);
  }

  dispose = (): void => {
    if (this.stopped || this.transferred) return;
    this.stopped = true; this.releaseInput(); this.releaseKey(); this.releasePaste(); this.input.dispose(); this.tui.stop();
    this.finishPaint();
    process.removeListener('exit', this.dispose);
  };
}

let pending: StartupSurface | undefined;
export function beginStartupSurface(): Promise<void> {
  if (pending) throw new Error('A startup surface already owns the terminal.');
  pending = new StartupSurface();
  return pending.firstPaint;
}
export function settleStartupInput(): Promise<void> | undefined {
  // Heavy module evaluation can postpone stdin callbacks. Let the poll phase
  // deliver input typed during loading to its original owner before adoption.
  return pending ? new Promise<void>(resolve => setImmediate(resolve)) : undefined;
}
export function takeStartupSurface(): StartupSurface | undefined {
  const surface = pending; pending = undefined; return surface;
}
export function stopStartupSurface(): void { pending?.dispose(); pending = undefined; }
