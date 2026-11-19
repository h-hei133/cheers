import { runExtensionInvocation } from '../../../extensions/runtime/context.js';
import type { ExtensionHostBridge, ExtensionShortcut } from '../../../extensions/runtime/inProcessLoader.js';
import { normalizeKey } from '../../../presentation/tui/input/keyId.js';

const SHORTCUT_TIMEOUT_MS = 30_000;

/** The immutable registration set belongs to one admitted CLI extension generation. */
export class ExtensionShortcuts {
  private readonly commands = new Map<string, NonNullable<ExtensionShortcut['run']>>();
  private readonly lifetime = new AbortController();
  private running = false;

  constructor(private readonly host: ExtensionHostBridge, private readonly signal: AbortSignal,
    private readonly admitted: () => boolean) {}

  publish(shortcuts: readonly ExtensionShortcut[]): void {
    for (const shortcut of shortcuts) {
      const key = normalizeKey(shortcut.key);
      if (key && shortcut.run) this.commands.set(key, shortcut.run);
    }
  }

  retire(): void { this.lifetime.abort(); }

  dispatch(keyId: string, surface: AbortSignal, reportFailure: () => void): boolean {
    const run = this.commands.get(keyId);
    const active = () => !this.signal.aborted && !this.lifetime.signal.aborted && !surface.aborted && this.admitted();
    if (!run || !active()) return false;
    if (this.running) return true;
    const ui = this.host.ui;
    if (!ui || !active()) return false;
    const timeout = AbortSignal.timeout(SHORTCUT_TIMEOUT_MS);
    const lifetime = AbortSignal.any([this.signal, this.lifetime.signal, surface, timeout]);
    this.running = true;
    // The captured loader callback observes the original realm and retires late continuations.
    void runExtensionInvocation(ui, lifetime, () => run()).catch(() => {
      if (active()) reportFailure();
    }).finally(() => { this.running = false; });
    return true;
  }
}
