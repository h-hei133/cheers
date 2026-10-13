import fs, { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeReadHandle, ReadCleanupError } from '../read.js';
import { planNativeRead } from '../../../sandbox/read.js';
import { materializeView, type ViewSelection } from './tree.js';
import { ViewSources, type NativeViewInput } from './source.js';
import { verifyNativeExit } from './status.js';

export { ViewSourceError } from './source.js';
export type { NativeViewInput } from './source.js';
export type NativeReadPlan = ReturnType<typeof planNativeRead> & { readonly verifyExit: (exitCode: number | null) => Promise<void> };

/** A private, read-only metadata view is scoped to one native query lifecycle. */
export async function withNativeReadView<T>(input: NativeViewInput, consume: (sources: ViewSources,
  plan: (command: string, args: readonly string[], directory: string, detached?: boolean) => NativeReadPlan,
  materialize: (selection: ViewSelection) => Promise<void>) => Promise<T>): Promise<T> {
  input.budget.check();
  const root = fs.realpathSync(input.root);
  input.assertFileAccess(root);
  const mirror = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheers-native-read-'));
  try {
    const sources = new ViewSources({ ...input, root }, mirror);
    const handle = await fsp.open(mirror, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY);
    try {
      const statusFile = path.join(mirror, '.native-status');
      const status = await fsp.open(statusFile, 'ax+');
      try {
        // Only the launcher receives this writable receipt descriptor. Its
        // unlinked file is absent from the mounted workspace and child argv.
        await fsp.unlink(statusFile);
        const plan = (command: string, args: readonly string[], directory: string, detached = false): NativeReadPlan => {
          sources.target(directory);
          sources.verify();
          fs.ftruncateSync(status.fd, 0);
          return { ...planNativeRead({ command, args, root, directory: detached ? '/' : directory,
            descriptor: handle.fd, statusDescriptor: status.fd }), verifyExit: code => verifyNativeExit(status, code) };
        };
        const result = await consume(sources, plan, selection => materializeView(sources, selection));
        // Absence and fallback decisions also depend on the captured sources.
        sources.verify();
        return result;
      } finally { await closeReadHandle(status); }
    } finally { await closeReadHandle(handle); }
  } finally {
    try { await fsp.rm(mirror, { recursive: true, force: true }); }
    catch { throw new ReadCleanupError(); }
  }
}
