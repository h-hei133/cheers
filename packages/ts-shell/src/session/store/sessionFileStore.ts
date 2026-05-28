import * as fs from "node:fs";
import * as path from "node:path";

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
  while (true) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(lockPath, "wx");
      try {
        return action();
      } finally {
        if (fd !== undefined) {
          fs.closeSync(fd);
          fd = undefined;
        }
        try {
          fs.rmSync(lockPath, { force: true });
        } catch {
          // ignore lock cleanup race
        }
      }
    } catch (error) {
      if (!isTransientLockError(error)) {
        throw error;
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed >= STATE_LOCK_TIMEOUT_MS) {
        throw new Error(`Session state lock timeout at ${lockPath}`);
      }
      sleepBlocking(STATE_LOCK_RETRY_DELAY_MS);
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // already closed
        }
      }
    }
  }
}

export function writeJsonFileAtomic(filePath: string, payload: unknown): void {
  const directory = path.dirname(filePath);
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const serialized = JSON.stringify(payload, null, 2);
  const tempFd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(tempFd, serialized, "utf8");
    fs.fsyncSync(tempFd);
  } finally {
    fs.closeSync(tempFd);
  }

  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (!isTransientIoError(error)) {
      throw error;
    }
    fs.writeFileSync(filePath, serialized, "utf8");
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
