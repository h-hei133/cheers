import type { ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
import type { ResourceGeneration, ResourceReloadLease, ResourceReloadOptions, ResourceReloadReceipt, ResourceSnapshot } from './contract.js';
import { ReloadLease, ReloadReceipt } from './lease.js';

/** Publication identity survives retirement, preventing an external reload/release ABA. */
export class ResourceGenerations {
  private current: ResourceGeneration | undefined;
  private latest: ResourceGeneration | undefined;
  snapshot: ResourceSnapshot;

  constructor(
    private host: ExtensionHostBridge | undefined,
    private readonly empty: ResourceSnapshot,
    private readonly collect: (generation: ResourceGeneration) => Promise<ResourceSnapshot>,
  ) {
    this.snapshot = empty;
  }

  assertGeneration(generation: ResourceGeneration, ...expectedHost: [ExtensionHostBridge?]): void {
    if (this.current !== generation || this.latest !== generation
      || (generation.state !== 'loading' && generation.state !== 'active')) {
      throw new Error('Resource generation changed or was retired.');
    }
    generation.controller.signal.throwIfAborted();
    if (expectedHost.length && generation.host !== expectedHost[0]) {
      throw new Error('Resource generation host changed.');
    }
  }

  assertReservation(generation: ResourceGeneration): void {
    if (this.current !== undefined || this.host !== undefined || this.latest !== generation
      || generation.state !== 'reload' || !generation.controller.signal.aborted) {
      throw new Error('Resource reload reservation changed or was retired.');
    }
  }

  bind(
    host: ExtensionHostBridge,
    acquireRetirement?: () => () => void,
    generation = this.current,
  ): () => void {
    if (generation?.controlled && (generation.state !== 'active'
      || (acquireRetirement !== undefined && generation.host === undefined))) {
      throw new Error('Controlled resource generation must be bound through its reload receipt.');
    }
    const bound = generation?.host ?? this.host;
    if (bound !== undefined && bound !== host) {
      throw new Error('Resource loader is already bound to another host. Call reload(host) or create a new loader before binding another session.');
    }
    if (generation) this.assertGeneration(generation);
    const retire = acquireRetirement ? acquireRetirement() : this.captureRetirement(generation);
    if (this.current !== generation || (generation?.host ?? this.host) !== bound) {
      throw new Error('Resource generation changed during host binding.');
    }
    if (generation) this.assertGeneration(generation);
    if (generation) generation.host = host;
    this.host = host;
    return retire;
  }

  captureBinding(
    bind: (host: ExtensionHostBridge) => void | (() => void),
    acquireRetirement: () => () => void,
  ): (host: ExtensionHostBridge) => () => void {
    const generation = this.current;
    const retire = acquireRetirement();
    return host => {
      if (!generation || this.current !== generation || generation.controller.signal.aborted) {
        throw new Error('Resource generation changed during session initialization.');
      }
      const release = bind(host);
      return typeof release === 'function' ? release : retire;
    };
  }

  captureRetirement(generation = this.current): () => void {
    return () => { if (generation) this.retire(generation); };
  }

  captureReload(generation = this.current): ResourceReloadLease {
    if (!generation || generation.state !== 'active' || !generation.snapshot) {
      throw new Error('Resource generation is not loaded.');
    }
    this.assertGeneration(generation);
    return new ReloadLease(this, generation);
  }

  retire(generation: ResourceGeneration, state: 'disposed' | 'reload' | 'superseded' = 'disposed'): void {
    // An ordinary release revokes an intentional reservation even after it cleared current.
    if (generation.state !== 'disposed') generation.state = state;
    if (this.current === generation) {
      this.current = undefined;
      this.host = undefined;
    }
    generation.host = undefined;
    generation.controller.abort(new Error(state === 'superseded'
      ? 'Resource reload was superseded.' : 'Resource consumer is retired.'));
  }

  private start(host: ExtensionHostBridge | undefined, controlled = false): ResourceGeneration {
    const predecessor = this.current;
    const generation: ResourceGeneration = { controller: new AbortController(), controlled, host, state: 'loading' };
    // Publish before abort callbacks can synchronously install an external successor.
    this.current = generation;
    this.latest = generation;
    this.host = host;
    this.snapshot = this.empty;
    if (predecessor) this.retire(predecessor, 'superseded');
    this.assertGeneration(generation);
    return generation;
  }

  async reload(host?: ExtensionHostBridge): Promise<void> {
    const generation = this.start(host ?? this.host);
    await this.load(generation);
  }

  async reloadReserved(generation: ResourceGeneration, options: ResourceReloadOptions): Promise<ResourceReloadReceipt> {
    this.assertReservation(generation);
    // A successor initializes unbound, never through the quiesced predecessor's host.
    const successor = this.start(undefined, true);
    return this.load(successor, options);
  }

  private async load(generation: ResourceGeneration, options: ResourceReloadOptions = {}): Promise<ResourceReloadReceipt> {
    const signal = options.signal;
    const admission = options.admission;
    const onAbort = () => this.retire(generation);
    try {
      if (signal) {
        AbortSignal.prototype.throwIfAborted.call(signal);
        EventTarget.prototype.addEventListener.call(signal, 'abort', onAbort, { once: true });
        AbortSignal.prototype.throwIfAborted.call(signal);
      }
      this.assertGeneration(generation);
      const snapshot = await this.collect(generation);
      this.assertGeneration(generation);
      if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
      admission?.();
      if (signal) AbortSignal.prototype.throwIfAborted.call(signal);
      this.assertGeneration(generation);
      generation.snapshot = snapshot;
      generation.state = 'active';
      this.snapshot = snapshot;
      return new ReloadReceipt(this, generation, snapshot);
    } catch (error) {
      // Identity-guarded retirement preserves a concurrently published external generation.
      this.retire(generation);
      throw error;
    } finally {
      if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', onAbort);
    }
  }
}
