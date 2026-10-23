import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export const LOG_TAIL_BYTES = 512 * 1024;
export const LOG_DIRECTORY_ENTRIES = 256;
export const LOG_FILE_LIMIT = 32;
export const LOG_TOTAL_BYTES = 2 * 1024 * 1024;

/** Oldest first; callers choose a single live family or the full metrics history. */
export function orderedLogFiles(directory: string, currentPath: string, options: {
  familyOnly?: boolean; strict?: boolean; maxEntries?: number; maxFiles?: number;
  onUnavailable?: (target: 'directory' | 'file') => void; onTruncated?: () => void;
} = {}): string[] {
  let names: string[];
  try {
    if (options.maxEntries === undefined) names = fs.readdirSync(directory);
    else {
      names = [];
      const entries = fs.opendirSync(directory, { bufferSize: 32 });
      try {
        while (names.length < options.maxEntries) {
          const entry = entries.readSync();
          if (!entry) break;
          names.push(entry.name);
        }
        if (names.length === options.maxEntries && entries.readSync() !== null) options.onTruncated?.();
      } finally {
        entries.closeSync();
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    options.onUnavailable?.('directory');
    if (!options.strict) return [];
    throw error;
  }
  const base = path.basename(currentPath).replace(/\.log(?:\.\d+)?$/, ".log");
  const files = names.filter((name) => /\.log(?:\.\d+)?$/.test(name)
    && (!options.familyOnly || name === base || (name.startsWith(`${base}.`) && /^\d+$/.test(name.slice(base.length + 1)))))
    .flatMap((name) => {
      const file = path.join(directory, name);
      try { const stat = fs.statSync(file); return stat.isFile() ? [{ file, time: stat.mtimeMs }] : []; } catch (error) {
        options.onUnavailable?.('file');
        if (!options.strict || (error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })
    .sort((left, right) => left.time - right.time
      || Number(left.file === currentPath) - Number(right.file === currentPath)
      || left.file.localeCompare(right.file, undefined, { numeric: true }));
  if (options.maxFiles !== undefined && files.length > options.maxFiles) {
    options.onTruncated?.();
    return files.slice(-options.maxFiles).map(({ file }) => file);
  }
  return files.map(({ file }) => file);
}

/** A bounded tail, retaining only whole lines and respecting short reads. */
export function tailLines(file: string, maxBytes = LOG_TAIL_BYTES,
  options: { strict?: boolean; onBytes?: (bytes: number) => void } = {}): string[] {
  let handle: number | undefined;
  try {
    handle = fs.openSync(file, "r");
    const size = fs.fstatSync(handle).size;
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    let read = 0;
    while (read < buffer.length) {
      const count = fs.readSync(handle, buffer, read, buffer.length - read, start + read);
      if (count === 0) break;
      read += count;
    }
    options.onBytes?.(read);
    let text = buffer.toString("utf8", 0, read);
    if (start > 0) {
      const previous = Buffer.alloc(1);
      if (fs.readSync(handle, previous, 0, 1, start - 1) !== 1 || previous[0] !== 10) {
        const newline = text.indexOf("\n");
        text = newline < 0 ? "" : text.slice(newline + 1);
      }
    }
    return text.split("\n").filter((line) => line.trim().length > 0);
  } catch (error) { if (options.strict) throw error; return []; } finally { if (handle !== undefined) fs.closeSync(handle); }
}

/** Validate aliases before any output is opened, then publish the complete copy. */
export function exportLogFiles(files: readonly string[], target: string): void {
  const destination = path.resolve(target);
  const targetStat = fs.existsSync(destination) ? fs.statSync(destination) : undefined;
  for (const file of files) {
    const stat = fs.statSync(file);
    if (path.resolve(file) === destination || (targetStat?.dev === stat.dev && targetStat.ino === stat.ino)) {
      throw new Error("Export destination is an input log file.");
    }
  }
  const staging = `${destination}.tmp-${randomUUID()}`;
  const output = fs.openSync(staging, "wx");
  try {
    try {
      for (const file of files) copyLogFile(file, output);
      fs.fsyncSync(output);
    } finally { fs.closeSync(output); }
    fs.renameSync(staging, destination);
  } finally { fs.rmSync(staging, { force: true }); }
}

function copyLogFile(file: string, output: number): void {
  const input = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let lastByte: number | undefined;
    for (;;) {
      const count = fs.readSync(input, buffer, 0, buffer.length, null);
      if (count === 0) break;
      for (let written = 0; written < count;) written += fs.writeSync(output, buffer, written, count - written);
      lastByte = buffer[count - 1];
    }
    if (lastByte !== undefined && lastByte !== 10) fs.writeSync(output, "\n");
  } finally { fs.closeSync(input); }
}
