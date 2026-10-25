import fs from 'node:fs';
import path from 'node:path';
import { readRevision } from '../../runtime/execution/read.js';

/** Bounded dependency capture, including absent candidates and physical link targets. */
export function capturePromptSources() {
  const captured = new Map<string, string>();
  const revision = (target: string): string => {
    try {
      const entry = fs.lstatSync(target, { bigint: true });
      const real = fs.realpathSync(target);
      return JSON.stringify([readRevision(entry), entry.mode.toString(), real, readRevision(fs.statSync(real, { bigint: true }))]);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      let parent = path.dirname(target);
      for (;;) {
        try { return JSON.stringify(['absent', parent, fs.realpathSync(parent), readRevision(fs.statSync(parent, { bigint: true }))]); }
        catch (parentError) {
          const parentCode = (parentError as NodeJS.ErrnoException).code;
          if (parentCode !== 'ENOENT' && parentCode !== 'ENOTDIR') throw parentError;
          const next = path.dirname(parent); if (next === parent) throw parentError; parent = next;
        }
      }
    }
  };
  const track = (target: string) => {
    const absolute = path.resolve(target);
    if (captured.has(absolute)) {
      if (captured.get(absolute) !== revision(absolute)) throw new Error('Prompt source changed during capture.');
      return;
    }
    if (captured.size >= 512) throw new Error('Prompt source tracking exceeded its limit.');
    captured.set(absolute, revision(absolute));
  };
  const verify = () => {
    for (const [target, before] of captured) if (revision(target) !== before) throw new Error('Prompt source changed after capture.');
  };
  return { track, verify };
}
