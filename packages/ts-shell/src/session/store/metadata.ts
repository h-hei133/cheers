import { projectSessionMetadata, type SessionMetadata } from '../schema/sessionMetadataCodec.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionStateSnapshot } from '../schema/sessionStateSnapshot.js';
import type { SessionActivationIdentity } from './activation.js';
import { prepareActivationMetadata } from './prompt/activation.js';
import type { SessionFileLayout } from './sessionFileLayout.js';
import { readJsonFileWithRetry, writeJsonFileAtomic } from './sessionFileStore.js';
import { withSessionMetadataLock } from './sessionStateStore.js';

export function writeSessionMetadataRecord(input: {
  readonly session: Session;
  readonly layout: Pick<SessionFileLayout, 'metadataPath' | 'stateLockPath'>;
  readonly requireHeld?: boolean;
}): void {
  withSessionMetadataLock(input.layout, () => writeJsonFileAtomic(input.layout.metadataPath,
    storedSessionMetadata(input.session, input.layout.metadataPath)), input.requireHeld);
}

export function prepareSessionActivationRecord(session: Session, layout: SessionFileLayout, identity: SessionActivationIdentity, state?: SessionStateSnapshot) {
  return withSessionMetadataLock(layout, () => prepareActivationMetadata(layout, identity,
    storedSessionMetadata(session, layout.metadataPath), state), true);
}

function storedSessionMetadata(session: Session, metadataPath: string): SessionMetadata {
  const metadata = projectSessionMetadata(session);
  // A concurrent metadata write can update the pin on a stale live session.
  // For a newly reserved session the existing metadata file is optional.
  const current = readJsonFileWithRetry<SessionMetadata>(metadataPath, {
    required: false,
    parseErrorDetail: 'Failed to load session metadata',
  });
  if (current?.id === metadata.id && current.createdAt === metadata.createdAt) {
    if (current.pinned === true) metadata.pinned = true;
    else delete metadata.pinned;
  }
  return metadata;
}
