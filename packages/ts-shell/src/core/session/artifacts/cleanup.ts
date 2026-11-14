import { ArtifactPublicationError } from './publication.js';

export interface ArtifactCleanupResource { close(): Promise<void> }
export interface ArtifactCleanupReservation {
  readonly operations: Set<Promise<unknown>>;
  resource?: ArtifactCleanupResource;
  pending: boolean;
  flight?: Promise<boolean>;
}

const CLEANUP_WAIT_MS = 2000;
const MAX_OWNED_RESOURCES = 16;
class ArtifactWaitError extends Error {}

/** Bounded waits keep ownership: timeouts never discard a live cleanup capability. */
export class ArtifactCleanup {
  private readonly owned = new Set<ArtifactCleanupReservation>();

  constructor(private readonly target: string) {}

  reserve(): ArtifactCleanupReservation {
    if ([...this.owned].some(reservation => reservation.pending)) throw this.unavailable();
    if (this.owned.size >= MAX_OWNED_RESOURCES) throw new ArtifactPublicationError('not-published', 'complete', this.target);
    const reservation = { operations: new Set<Promise<unknown>>(), pending: false };
    this.owned.add(reservation);
    return reservation;
  }

  release(reservation: ArtifactCleanupReservation): void { this.owned.delete(reservation); }

  hold(reservation: ArtifactCleanupReservation): () => void {
    if (!this.owned.has(reservation) || reservation.pending) throw this.unavailable();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    reservation.operations.add(pending);
    return () => {
      reservation.operations.delete(pending); release();
      if (reservation.pending) void this.attempt(reservation);
    };
  }

  bind(reservation: ArtifactCleanupReservation, resource: ArtifactCleanupResource): void {
    if (!this.owned.has(reservation)) return;
    reservation.resource = resource;
    if (reservation.pending) void this.attempt(reservation);
  }

  retain(reservation: ArtifactCleanupReservation, error?: unknown): void {
    if (!this.owned.has(reservation)) return;
    reservation.pending = true;
    if (error instanceof ArtifactPublicationError) {
      if (error.cleanup === 'complete' && !reservation.resource) { this.release(reservation); return; }
      if (!reservation.resource && error.cleanupResource) reservation.resource = error.cleanupResource;
    }
  }

  /** Operations stay observed after the caller's deadline and own their slot. */
  async operation<T>(reservation: ArtifactCleanupReservation, start: () => Promise<T>,
    accepted?: (value: T) => void, wait: (pending: Promise<T>) => Promise<T> = boundedArtifactWait,
    publication: 'not-published' | 'unverified' = 'not-published'): Promise<T> {
    if (!this.owned.has(reservation) || reservation.pending) throw this.unavailable();
    const original = Promise.resolve().then(start);
    reservation.operations.add(original);
    const observed = original.then(value => {
      reservation.operations.delete(original);
      accepted?.(value);
      if (reservation.pending) void this.attempt(reservation);
      return value;
    }, error => {
      reservation.operations.delete(original);
      this.retain(reservation, error);
      const wasWaiting = reservation.flight;
      if (wasWaiting) void wasWaiting.then(() => { if (this.owned.has(reservation)) void this.attempt(reservation); });
      if (error instanceof ArtifactPublicationError && error.cleanup === 'unknown') {
        throw new ArtifactPublicationError(error.publication, error.cleanup, error.target,
          { close: async () => { if (await this.retry() === 'unknown') throw new Error('Artifact cleanup is unconfirmed.'); } });
      }
      throw error;
    });
    try { return await wait(observed); }
    catch (error) {
      this.retain(reservation, error);
      if (error instanceof ArtifactWaitError) throw this.unavailable(publication);
      throw error;
    }
  }

  async dispose(reservation: ArtifactCleanupReservation): Promise<void> {
    if (!this.owned.has(reservation)) return;
    this.retain(reservation);
    const outcome = await boundedArtifactWait(this.attempt(reservation)).catch(() => false);
    if (!outcome) throw this.unavailable();
  }

  /** One shared deadline for all pending owners, with no overlapping close calls. */
  async retry(): Promise<'complete' | 'unknown'> {
    const pending = [...this.owned].filter(reservation => reservation.pending);
    if (!pending.length) return 'complete';
    await boundedArtifactWait(Promise.all(pending.map(reservation => this.attempt(reservation)))).catch(() => {});
    return [...this.owned].some(reservation => reservation.pending) ? 'unknown' : 'complete';
  }

  async admit(): Promise<void> {
    if (await this.retry() === 'unknown') throw this.unavailable();
  }

  private attempt(reservation: ArtifactCleanupReservation): Promise<boolean> {
    if (!this.owned.has(reservation)) return Promise.resolve(true);
    if (reservation.flight) return reservation.flight;
    const flight = (async (): Promise<boolean> => {
      if (reservation.operations.size) await Promise.allSettled([...reservation.operations]);
      if (!this.owned.has(reservation)) return true;
      if (!reservation.resource) return false;
      try {
        await reservation.resource.close();
        this.release(reservation);
        return true;
      } catch { return false; }
    })();
    reservation.flight = flight;
    void flight.then(() => { if (reservation.flight === flight) reservation.flight = undefined; });
    return flight;
  }

  private unavailable(publication: 'not-published' | 'unverified' = 'not-published'): ArtifactPublicationError {
    return new ArtifactPublicationError(publication, 'unknown', this.target,
      { close: async () => { if (await this.retry() === 'unknown') throw new Error('Artifact cleanup is unconfirmed.'); } });
  }
}

export async function boundedArtifactWait<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ArtifactWaitError('Artifact operation settlement is unconfirmed.')), CLEANUP_WAIT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

/** Publication keeps its caller deadline; abort allows a bounded cleanup grace. */
export async function waitArtifactPublication<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      const expire = (): void => reject(new ArtifactWaitError('Artifact publication settlement is unconfirmed.'));
      abort = (): void => { clearTimeout(timer); timer = setTimeout(expire, CLEANUP_WAIT_MS); };
      if (signal) {
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      } else timer = setTimeout(expire, 30_000);
    })]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  }
}
