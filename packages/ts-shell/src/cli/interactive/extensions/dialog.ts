import type { ExtensionUiDialogOptions } from '../../../extensions/runtime/ui.js';
import type { OverlayStack } from '../../../presentation/tui/render/overlayStack.js';
import type { DialogComponent } from './components.js';

/** Owns one input lease, including its cancellation and deadline. */
export class ExtensionDialogs {
  private cancelPending?: () => void;

  constructor(private readonly overlays: OverlayStack, private readonly changed: () => void,
    private readonly admitted: () => boolean, private readonly onSettled?: () => void) {}

  get active(): boolean { return this.cancelPending !== undefined; }

  open(dialog: DialogComponent, options?: ExtensionUiDialogOptions): Promise<string | undefined> {
    if (this.active) return Promise.reject(new Error('Extension UI is unavailable.'));
    if (options?.signal?.aborted) return Promise.resolve(undefined);
    if (options?.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout <= 0)) {
      return Promise.reject(new Error('Extension UI timeout must be positive and finite.'));
    }
    return new Promise(resolve => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (value: string | undefined) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        options?.signal?.removeEventListener('abort', cancel);
        this.cancelPending = undefined;
        handle.hide();
        resolve(this.admitted() ? value : undefined);
        this.changed();
        this.onSettled?.();
      };
      const cancel = () => finish(undefined);
      dialog.connect(finish, cancel);
      this.cancelPending = cancel;
      const handle = this.overlays.push(dialog.component, { width: '90%', maxHeight: '90%', anchor: 'center' });
      options?.signal?.addEventListener('abort', cancel, { once: true });
      if (options?.signal?.aborted) cancel();
      else if (options?.timeout !== undefined && Number.isFinite(options.timeout)) {
        timer = setTimeout(cancel, Math.min(options.timeout, 2_147_483_647));
        timer.unref?.();
      }
      this.changed();
    });
  }

  cancel(): void { this.cancelPending?.(); }
}
