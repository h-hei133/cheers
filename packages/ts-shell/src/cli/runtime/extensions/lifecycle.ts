import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import { configurationAdmission } from '../../../core/shell/configuration.js';
import { dispatchExtensionEvent, getExtensionEventRunners, type ExtensionEventRunner } from '../../../core/hooks/extensionBridge.js';
import type { ExtensionSessionEvent } from '../../../extensions/events/model.js';
import { extensionHostFor, quiesceExtensionHost } from './host.js';

/** Own the two notifications for one admitted session and extension generation. */
export class ExtensionSessionLifecycle {
  private started: Promise<void> | undefined;
  private shuttingDown: Promise<void> | undefined;
  private audience: readonly ExtensionEventRunner[] = [];
  private closing = false;
  private readonly sessionId: string;
  private readonly createdAt: string;
  private readonly root: string;
  private readonly configured: () => string | undefined;
  private readonly host: ReturnType<typeof extensionHostFor>;

  constructor(private readonly context: ShellRuntimeContext) {
    this.sessionId = context.session.id;
    this.createdAt = context.session.createdAt;
    this.root = context.cwd;
    this.configured = configurationAdmission(context);
    this.host = extensionHostFor(context);
  }

  private admission(): string | undefined {
    return this.context.session.id !== this.sessionId || this.context.session.createdAt !== this.createdAt || this.context.cwd !== this.root
      || extensionHostFor(this.context) !== this.host ? 'Extension session or generation changed.' : this.configured();
  }

  start(ready: () => Promise<void>, reason: Extract<ExtensionSessionEvent, { type: 'session_start' }>['reason'], signal?: AbortSignal): Promise<void> {
    if (this.closing) return Promise.reject(new Error('Extension session is closing.'));
    return this.started ??= Promise.resolve().then(async () => {
      signal?.throwIfAborted();
      await ready();
      signal?.throwIfAborted();
      const refused = this.admission();
      if (refused || this.closing) throw new Error(refused ?? 'Extension session is closing.');
      this.audience = [...getExtensionEventRunners(this.root, this.sessionId)];
      await this.publish({ type: 'session_start', sessionId: this.sessionId, workspaceRoot: this.root, reason }, signal);
      signal?.throwIfAborted();
      const retired = this.admission();
      if (retired || this.closing) throw new Error(retired ?? 'Extension session is closing.');
    });
  }

  shutdown(settle: () => Promise<void>, reason: Extract<ExtensionSessionEvent, { type: 'session_shutdown' }>['reason'], signal?: AbortSignal): Promise<void> {
    if (this.shuttingDown) return this.shuttingDown;
    this.closing = true;
    const failures: unknown[] = [];
    const settled = Promise.resolve().then(async () => {
      try {
        await settle();
        const started = this.started;
        if (started) {
          await started.catch(() => undefined);
          if (!this.admission()) await this.publish({ type: 'session_shutdown', sessionId: this.sessionId, workspaceRoot: this.root, reason }, signal);
        }
      } catch (error) { failures.push(error); }
      if (failures.length > 0) throw failures[0];
    });
    this.shuttingDown = settled;
    void settled.catch(() => {});
    try { quiesceExtensionHost(this.context, this.host); } catch (error) { failures.push(error); }
    return settled;
  }

  private async publish(event: ExtensionSessionEvent, signal?: AbortSignal): Promise<void> {
    await dispatchExtensionEvent(this.root, this.sessionId, event.type, Object.freeze(event), {
      runners: this.audience, admission: () => this.admission(), ...(signal ? { signal } : {}),
    });
  }
}
