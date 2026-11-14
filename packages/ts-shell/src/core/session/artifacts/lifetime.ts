import type { ArtifactCleanup, ArtifactCleanupReservation } from './cleanup.js';
import type { TextStaging } from './staging.js';
import { ArtifactPublicationError } from './publication.js';

/** A stage keeps the manager's reservation through every unsettled outcome. */
export function retainTextStaging(owner: ArtifactCleanup, reservation: ArtifactCleanupReservation,
  stage: TextStaging): TextStaging {
  return {
    write: bytes => owner.operation(reservation, () => stage.write(bytes)),
    close: () => owner.operation(reservation, () => stage.close()),
    async *read(): AsyncIterable<Uint8Array> {
      const release = owner.hold(reservation);
      let iterator: AsyncIterator<Uint8Array> | undefined;
      let complete = false;
      try {
        const active = stage.read()[Symbol.asyncIterator]();
        iterator = active;
        for (;;) {
          const result = await owner.operation(reservation, () => active.next());
          if (result.done) { complete = true; return; }
          yield result.value;
        }
      } catch (error) {
        owner.retain(reservation, error);
        if (error instanceof ArtifactPublicationError && error.cleanup === 'unknown') {
          throw new ArtifactPublicationError(error.publication, error.cleanup, error.target,
            { close: () => owner.dispose(reservation) });
        }
        throw error;
      }
      finally {
        let retiring = false;
        if (!complete) {
          owner.retain(reservation);
          try {
            if (iterator?.return) {
              const retirement = iterator.return();
              retiring = true;
              void Promise.resolve(retirement).then(release, release);
            }
          }
          catch { /* owner still holds the stage */ }
        }
        if (!retiring) release();
      }
    },
    dispose: () => owner.dispose(reservation),
  };
}
