import { configurationAdmission } from '../../../core/shell/configuration.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ExtensionUiHost } from '../../../extensions/runtime/ui.js';
import { bindExtensionUiFor, refreshExtensionsFor } from '../../runtime/extensions.js';

/** Recapture only at explicit host transitions; old extensions retain their old binding. */
export class ExtensionUiBinding {
  private releaseCurrent?: () => void;
  private closed = false;
  private admission: () => string | undefined = () => 'Extension UI is unavailable.';

  constructor(private readonly context: ShellRuntimeContext, private readonly cleared: () => void) {}

  admitted(): boolean { return Boolean(this.releaseCurrent) && !this.admission(); }
  needsRefresh(): boolean { return !this.releaseCurrent || Boolean(this.admission()); }

  refresh(host: ExtensionUiHost): void {
    if (this.closed) return;
    this.release();
    this.cleared();
    this.admission = configurationAdmission(this.context);
    if (this.admission()) return;
    refreshExtensionsFor(this.context);
    let retired = false;
    const release = bindExtensionUiFor(this.context, host, () => {
      retired = true;
      this.releaseCurrent = undefined;
      this.cleared();
    });
    if (!retired) this.releaseCurrent = release;
  }

  release(): void {
    const release = this.releaseCurrent;
    this.releaseCurrent = undefined;
    release?.();
  }

  dispose(): void { this.closed = true; this.release(); }
}
