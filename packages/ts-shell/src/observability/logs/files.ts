import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

export const LOG_TAIL_BYTES = 512 * 1024;

/** Oldest first; callers choose a single live family or the full metrics history. */
export function orderedLogFiles(directory: string, currentPath: string, familyOnly = false): string[] {
  let names: string[];
  try { names = fs.readdirSync(directory); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const base = path.basename(currentPath).replace(/\.log(?:\.\d+)?$/, ".log");
  return names.filter((name) => /\.log(?:\.\d+)?$/.test(name)
    && (!familyOnly || name === base || (name.startsWith(`${base}.`) && /^\d+$/.test(name.slice(base.length + 1)))))
    .flatMap((name) => {
      const file = path.join(directory, name);
      try { const stat = fs.statSync(file); return stat.isFile() ? [{ file, time: stat.mtimeMs }] : []; } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
    })
    .sort((left, right) => left.time - right.time
      || Number(left.file === currentPath) - Number(right.file === currentPath)
      || left.file.localeCompare(right.file, undefined, { numeric: true }))
    .map(({ file }) => file);
}

/** A bounded tail, retaining only whole lines and respecting short reads. */
export function tailLines(file: string, maxBytes = LOG_TAIL_BYTES): string[] {
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
    let text = buffer.toString("utf8", 0, read);
    if (start > 0) {
      const previous = Buffer.alloc(1);
      if (fs.readSync(handle, previous, 0, 1, start - 1) !== 1 || previous[0] !== 10) {
        const newline = text.indexOf("\n");
        text = newline < 0 ? "" : text.slice(newline + 1);
      }
    }
    return text.split("\n").filter((line) => line.trim().length > 0);
  } catch { return []; } finally { if (handle !== undefined) fs.closeSync(handle); }
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
