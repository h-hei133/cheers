import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readRevision } from '../../runtime/execution/read.js';
import { readBinarySnapshot } from '../../runtime/execution/snapshot.js';

/** Bounded dependency capture, including absent candidates and physical link targets. */
export function capturePromptSources() {
  const captured = new Map<string, string>();
  const contents = new Map<string, { readonly digest: string; readonly bytes: number }>();
  let contentBytes = 0;
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
  const track = (target: string, content?: string | Buffer) => {
    const absolute = path.resolve(target);
    if (captured.has(absolute)) {
      if (captured.get(absolute) !== revision(absolute)) throw new Error('Prompt source changed during capture.');
    } else {
      if (captured.size >= 512) throw new Error('Prompt source tracking exceeded its limit.');
      captured.set(absolute, revision(absolute));
    }
    if (content === undefined) return;
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (bytes.length > 512 * 1024 || (!contents.has(absolute) && contentBytes + bytes.length > 8 * 1024 * 1024)) throw new Error('Prompt source content exceeded its byte limit.');
    const digest = createHash('sha256').update(bytes).digest('hex');
    const previous = contents.get(absolute);
    if (previous) {
      if (previous.digest !== digest) throw new Error('Prompt source bytes changed during capture.');
      return;
    }
    contents.set(absolute, { digest, bytes: bytes.length }); contentBytes += bytes.length;
  };
  const verify = () => {
    for (const [target, before] of captured) if (revision(target) !== before) throw new Error('Prompt source changed after capture.');
  };
  const verifyContent = async (signal: AbortSignal) => {
    signal.throwIfAborted(); verify();
    for (const [target, expected] of contents) {
      signal.throwIfAborted();
      const real = fs.realpathSync(target);
      const bytes = await readBinarySnapshot({ absolutePath: real, workspaceRoot: path.dirname(real), abortSignal: signal }, expected.bytes);
      if (createHash('sha256').update(bytes).digest('hex') !== expected.digest) throw new Error('Prompt source bytes changed after capture.');
    }
    signal.throwIfAborted(); verify();
  };
  return { track, verify, verifyContent };
}
