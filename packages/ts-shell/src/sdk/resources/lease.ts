import type { ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
import type { ResourceGeneration, ResourceReloadLease, ResourceReloadOptions, ResourceReloadReceipt, ResourceSnapshot } from './contract.js';

/** The captured capabilities depend on lifetime operations, never ambient resource getters. */
interface ReloadOwner {
  assertGeneration(generation: ResourceGeneration, ...expectedHost: [ExtensionHostBridge?]): void;
  assertReservation(generation: ResourceGeneration): void;
  retire(generation: ResourceGeneration, state?: 'disposed' | 'reload' | 'superseded'): void;
  reloadReserved(generation: ResourceGeneration, options: ResourceReloadOptions): Promise<ResourceReloadReceipt>;
  bind(host: ExtensionHostBridge, acquireRetirement: (() => () => void) | undefined, generation: ResourceGeneration): () => void;
  captureReload(generation: ResourceGeneration): ResourceReloadLease;
}

export class ReloadLease implements ResourceReloadLease {
  private phase: 'live' | 'retiring' | 'ready' | 'spent' = 'live';

  constructor(private readonly owner: ReloadOwner, private readonly generation: ResourceGeneration) {}

  assertCurrent(...expectedHost: [ExtensionHostBridge?]): void {
    if (this.phase === 'ready' && !expectedHost.length) this.owner.assertReservation(this.generation);
    else if (this.phase === 'live') this.owner.assertGeneration(this.generation, ...expectedHost);
    else throw new Error('Resource reload lease was retired or consumed.');
  }

  retireForReload(expectedHost: ExtensionHostBridge): void {
    this.assertCurrent(expectedHost);
    this.phase = 'retiring';
    try {
      this.owner.retire(this.generation, 'reload');
      this.owner.assertReservation(this.generation);
      this.phase = 'ready';
    } catch (error) {
      this.phase = 'spent';
      throw error;
    }
  }

  async reload(options: ResourceReloadOptions = {}): Promise<ResourceReloadReceipt> {
    if (this.phase !== 'ready') throw new Error('Resource reload lease was not intentionally retired or was already consumed.');
    this.owner.assertReservation(this.generation);
    // Consume before caller option getters or admission can synchronously reenter.
    this.phase = 'spent';
    const signal = options.signal;
    const admission = options.admission;
    if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
    admission?.();
    if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
    this.owner.assertReservation(this.generation);
    return this.owner.reloadReserved(this.generation, { signal, admission });
  }
}

export class ReloadReceipt implements ResourceReloadReceipt {
  constructor(
    private readonly owner: ReloadOwner,
    private readonly generation: ResourceGeneration,
    readonly snapshot: ResourceSnapshot,
  ) {}

  bind(host: ExtensionHostBridge): () => void {
    this.assertCurrent();
    return this.owner.bind(host, undefined, this.generation);
  }

  assertCurrent(...expectedHost: [ExtensionHostBridge?]): void {
    this.owner.assertGeneration(this.generation, ...expectedHost);
  }

  retire(): void { this.owner.retire(this.generation); }

  captureReload(): ResourceReloadLease { return this.owner.captureReload(this.generation); }
}
