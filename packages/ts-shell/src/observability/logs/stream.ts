import fs from 'node:fs';
import path from 'node:path';
import { assertProfileStorage, currentProfile, profilePath, profilePathOverride } from '../../core/paths/profile/context.js';

/** Capture the stream's diagnostic owner before any asynchronous frame reads. */
export function streamTracer(): (message: string) => void {
  const enabled = process.env.CHEERS_STREAM_TRACE === '1';
  const profile = currentProfile();
  const target = enabled ? profilePathOverride('CHEERS_STREAM_TRACE_PATH')
    ?? (profile && profile.id !== 'default' ? profilePath('logs/stream-trace.log', profile) : 'stream-trace.log') : undefined;
  return message => {
    if (!target) return;
    try {
      assertProfileStorage(target, profile);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      assertProfileStorage(target, profile);
      fs.appendFileSync(target, `[stream] ${message}\n`, 'utf8');
    } catch { /* Diagnostics cannot fail a provider turn. */ }
  };
}
