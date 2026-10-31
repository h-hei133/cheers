import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { withFileLock } from '../../../session/store/sessionFileStore.js';
import { assertProfileIdentity } from '../../../core/paths/profile/context.js';
import { assertUnlinkedPath } from '../../../core/paths/profile/identity.js';
import { readConfigSnapshot } from '../../document.js';
import { CREDENTIAL_FILE_MODE } from '../../secret.js';
import { assertExportTarget, exportCapture, type ExportPlan } from './plan.js';

export interface ExportOutcome {
  readonly status: 'complete' | 'rejected' | 'unknown';
}

function assertPublishedFile(file: string, expected: fs.Stats): void {
  assertUnlinkedPath(file);
  const current = fs.lstatSync(file);
  if (!current.isFile() || current.dev !== expected.dev || current.ino !== expected.ino
    || process.platform !== 'win32' && (current.mode & 0o777) !== CREDENTIAL_FILE_MODE) throw new Error('Export file identity changed.');
}

/** Stage owner-only bytes, then publish exclusively; a racing destination is never overwritten. */
export function applyExport(plan: ExportPlan, confirmation: string, admission: () => string | undefined = () => undefined): ExportOutcome {
  if (confirmation !== plan.digest) return { status: 'rejected' };
  let started = false;
  let cleanupFailed = false;
  try {
    const capture = exportCapture(plan);
    const { target, content } = capture;
    const lockName = '.profile-export.lock';
    const lock = path.join(target.root, lockName);
    const check = () => {
      if (admission()) throw new Error('Export admission changed.');
      capture.check(); assertUnlinkedPath(lock);
    };
    check(); assertExportTarget(target);
    return withFileLock(lock, () => {
      check(); assertExportTarget(target, lockName);
      const destination = path.join(target.root, 'config.json');
      const stage = path.join(target.root, `.config-export-${randomUUID()}`);
      let staged: fs.Stats | undefined;
      try {
        assertUnlinkedPath(stage);
        const fd = fs.openSync(stage, 'wx', CREDENTIAL_FILE_MODE);
        try {
          staged = fs.fstatSync(fd);
          fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        assertPublishedFile(stage, staged);
        check();
        if (fs.readdirSync(target.root).some(name => name !== lockName && name !== path.basename(stage))) throw new Error('Export target changed.');
        if (readConfigSnapshot(stage)?.text !== content) throw new Error('Export stage is unverified.');
        assertUnlinkedPath(destination);
        started = true;
        fs.linkSync(stage, destination);
        check();
        assertPublishedFile(destination, staged);
        const saved = readConfigSnapshot(destination);
        assertPublishedFile(destination, staged);
        if (saved?.text !== content
          || fs.readdirSync(target.root).some(name => ![lockName, path.basename(stage), 'config.json'].includes(name))) throw new Error('Export readback is unverified.');
      } finally {
        try {
          assertProfileIdentity(target); assertUnlinkedPath(stage);
          if (staged) { assertPublishedFile(stage, staged); fs.rmSync(stage); }
          if (!started) assertExportTarget(target, lockName);
        } catch { cleanupFailed = true; throw new Error('Export stage cleanup is unverified.'); }
      }
      check(); assertPublishedFile(destination, staged!);
      if (fs.readdirSync(target.root).some(name => name !== lockName && name !== 'config.json')
        || readConfigSnapshot(destination)?.text !== content) throw new Error('Export completion is unverified.');
      assertPublishedFile(destination, staged!);
      return { status: 'complete' as const };
    }, { createParent: false, recovery: 'local-dead', onReleaseError: () => { cleanupFailed = true; } });
  } catch {
    return { status: started || cleanupFailed ? 'unknown' : 'rejected' };
  }
}
