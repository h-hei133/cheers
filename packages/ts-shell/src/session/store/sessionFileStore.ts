import * as fs from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import * as path from "node:path";
import { isLockStale, takeOverStaleLock } from "./lockStaleness.js";

const STATE_IO_MAX_ATTEMPTS = 6;
const STATE_IO_RETRY_DELAY_MS = 12;
const STATE_LOCK_TIMEOUT_MS = 1200;
const STATE_LOCK_RETRY_DELAY_MS = 20;

export function readJsonFileWithRetry<T>(
  filePath: string,
  options: { required: boolean; parseErrorDetail: string },
): T | undefined {
  for (let attempt = 1; attempt <= STATE_IO_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (!fs.existsSync(filePath)) {
        if (options.required && attempt === STATE_IO_MAX_ATTEMPTS) {
          throw new Error(`File missing at ${filePath}`);
        }
        if (!options.required) {
          return undefined;
        }
        sleepBlocking(STATE_IO_RETRY_DELAY_MS);
        continue;
      }
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (raw.length === 0) {
        if (options.required && attempt === STATE_IO_MAX_ATTEMPTS) {
          throw new Error(`File empty at ${filePath}`);
        }
        if (!options.required) {
          return undefined;
        }
        sleepBlocking(STATE_IO_RETRY_DELAY_MS);
        continue;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      if (!isTransientIoError(error) || attempt === STATE_IO_MAX_ATTEMPTS) {
        if (error instanceof Error && /Unexpected token|JSON/.test(error.message)) {
          if (!options.required) {
            return undefined;
          }
          throw new Error(`${options.parseErrorDetail}: ${error.message}`);
        }
        throw error;
      }
      sleepBlocking(STATE_IO_RETRY_DELAY_MS);
    }
  }
  return undefined;
}

export function withFileLock<T>(lockPath: string, action: () => T): T {
  const directory = path.dirname(lockPath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const startedAt = Date.now();
  let fd: number;
  while (true) {
    try {
      fd = fs.openSync(lockPath, "wx");
      break;
    } catch (error) {
      if (!isTransientLockError(error)) throw error;
      if (isLockStale(lockPath) && takeOverStaleLock(lockPath)) continue;
      if (Date.now() - startedAt >= STATE_LOCK_TIMEOUT_MS) {
        throw new Error(`Session state lock timeout at ${lockPath}`);
      }
      sleepBlocking(STATE_LOCK_RETRY_DELAY_MS);
    }
  }

  // Only acquisition is retried. An action may have partially written before
  // throwing an I/O error with the same code as a lock acquisition failure.
  const token = randomUUID();
  let recorded = false;
  let actionFailed = false;
  try {
    fs.writeFileSync(fd, JSON.stringify({ token, pid: process.pid, hostname: os.hostname(), createdAt: new Date().toISOString() }), "utf8");
    recorded = true;
    return action();
  } catch (error) {
    actionFailed = true;
    throw error;
  } finally {
    try {
      releaseOwnedLock(lockPath, fd, recorded ? token : undefined);
    } catch (error) {
      // Preserve the action's original failure, but never convert an otherwise
      // successful write into success when ownership or cleanup was lost.
      if (!actionFailed) throw error;
    }
  }
}

function releaseOwnedLock(lockPath: string, fd: number, token: string | undefined): void {
  let identity: fs.Stats;
  try {
    identity = fs.fstatSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const current = fs.lstatSync(lockPath);
  if (current.dev !== identity.dev || current.ino !== identity.ino || !current.isFile()) {
    throw new Error(`Session state lock ownership lost at ${lockPath}`);
  }
  if (token !== undefined) {
    const owner: unknown = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (!owner || typeof owner !== "object" || !("token" in owner) || owner.token !== token) {
      throw new Error(`Session state lock ownership lost at ${lockPath}`);
    }
  }
  fs.rmSync(lockPath, { force: true });
}

export function writeJsonFileAtomic(filePath: string, payload: unknown): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  const serialized = JSON.stringify(payload, null, 2);
  const tempFd = fs.openSync(tempPath, "wx");
  try {
    try {
      fs.writeFileSync(tempFd, serialized, "utf8");
      fs.fsyncSync(tempFd);
    } finally {
      fs.closeSync(tempFd);
    }
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tempPath, filePath);
        break;
      } catch (error) {
        // A busy destination may become replaceable, but must never be truncated.
        if (!isTransientIoError(error) || attempt >= STATE_IO_MAX_ATTEMPTS) throw error;
        sleepBlocking(STATE_IO_RETRY_DELAY_MS);
      }
    }
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

export function sleepBlocking(milliseconds: number): void {
  if (milliseconds <= 0) {
    return;
  }
  const slot = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(slot, 0, 0, milliseconds);
}

export function isTransientLockError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EEXIST" || code === "EPERM" || code === "EBUSY";
}

export function isTransientIoError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "ENOENT" ||
    code === "EPERM" ||
    code === "EBUSY" ||
    code === "EMFILE" ||
    code === "ENFILE"
  );
}
