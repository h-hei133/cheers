import { bindExtensionUiFor, bindExtensionUiRefreshFor, extensionHostFor } from '../cli/runtime/extensions/host.js';
import type { ConfigPublication } from '../config/state.js';
import { configurationAdmission } from '../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../core/shell/runtimeContext.js';
import type { ExtensionHostBridge } from '../extensions/runtime/inProcessLoader.js';
import type { ExtensionUiHost } from '../extensions/runtime/ui.js';

interface RetainedUi {
  host?: ExtensionUiHost;
  readonly admission: () => string | undefined;
  publication: ConfigPublication;
  background: AbortSignal;
  release?: () => void;
}

/** New SDK calls acquire a current snapshot; admitted callbacks keep their old one. */
export class SessionUi {
  private retained?: RetainedUi;
  private closed = false;
  private reloading = false;
  private retireRefresh: () => void;

  constructor(private readonly context: ShellRuntimeContext, private shared: ExtensionHostBridge | undefined) {
    this.retireRefresh = bindExtensionUiRefreshFor(context, () => { this.current(); });
  }

  bind(host: ExtensionUiHost): () => void {
    this.release();
    if (this.closed) throw new Error('Agent session is disposed.');
    const context = this.context;
    const configuration = context.configuration;
    const configured = configurationAdmission(context);
    const revocation = configuration.revocationRevision;
    const { id, createdAt } = context.session;
    const cwd = context.cwd;
    const root = context.projectRoot;
    const retained: RetainedUi = {
      host, publication: configuration.current, background: configuration.backgroundSignal,
      admission: () => context.configuration !== configuration || extensionHostFor(context) !== this.shared
        || context.session.id !== id || context.session.createdAt !== createdAt || context.cwd !== cwd || context.projectRoot !== root
        ? 'Extension session or workspace changed.' : configuration.revocationRevision !== revocation
          ? 'Configuration authority was revoked; bind a new UI host.' : configured(),
    };
    this.retained = retained;
    this.install(retained);
    return () => this.release(retained);
  }

  dispose(): void { this.closed = true; this.retireRefresh(); this.release(); }

  /** Intentional host retirement keeps only the caller's still-live UI lease. */
  beginReload(): void { this.reloading = true; }

  rebind(shared: ExtensionHostBridge): void {
    if (this.closed) throw new Error('Agent session is disposed.');
    this.retireRefresh();
    this.shared = shared;
    this.reloading = false;
    this.retireRefresh = bindExtensionUiRefreshFor(this.context, () => { this.current(); });
    if (this.retained) this.install(this.retained);
  }

  abandonReload(): void { this.reloading = false; this.release(); }

  private admitted(retained: RetainedUi): boolean {
    try { return !this.closed && this.retained === retained && !retained.admission(); }
    catch { return false; }
  }

  private current(): void {
    const retained = this.retained;
    if (!retained) return;
    if (!this.admitted(retained)) { this.release(retained); return; }
    if (retained.background.aborted) {
      const publication = this.context.configuration.current;
      // Accepted publications replace config and use its diagnostics. A
      // rejection retains config and publishes separate refusal diagnostics.
      if (publication.config === retained.publication.config || !publication.config.configValidation.valid
        || publication.diagnostics !== publication.requested.configDiagnostics) {
        return;
      }
      this.install(retained);
    }
  }

  private install(retained: RetainedUi): void {
    const host = retained.host;
    if (!host || !this.admitted(retained)) { this.release(retained); return; }
    const background = this.context.configuration.backgroundSignal;
    retained.background = background;
    retained.publication = this.context.configuration.current;
    let retired = false;
    const release = bindExtensionUiFor(this.context, host, () => {
      retired = true;
      retained.release = undefined;
      // Publication aborts before its new state is installed. Renewal waits
      // for a fresh call; explicit replacement and binding retirement do not.
      if (!this.reloading && (!background.aborted || !this.admitted(retained))) this.release(retained);
    });
    if (!retired) retained.release = release;
  }

  private release(retained = this.retained): void {
    if (this.retained === retained) this.retained = undefined;
    const release = retained?.release;
    if (retained) { retained.host = undefined; retained.release = undefined; }
    release?.();
  }
}
