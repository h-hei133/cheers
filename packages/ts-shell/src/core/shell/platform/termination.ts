import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const GRACE_MS = 1_000;
const TASKKILL_TIMEOUT_MS = 5_000;

function validPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 1 && pid <= 2 ** 31 - 1;
}

function signal(target: number, value: NodeJS.Signals | 0): boolean {
  try {
    process.kill(target, value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function taskkillPath(): string {
  return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
}

/** Wait for the native Windows cascade, not just for the launcher to spawn. */
export function terminateWindowsTree(pid: number): Promise<void> {
  if (!validPid(pid)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const child = spawn(taskkillPath(), ["/F", "/T", "/PID", String(pid)], {
      stdio: "ignore", windowsHide: true,
    });
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      finish(new Error("Timed out waiting for taskkill; process termination is unverified."));
      try { child.kill("SIGKILL"); } catch { /* The timeout is already recorded. */ }
      child.unref();
    }, TASKKILL_TIMEOUT_MS);
    child.once("error", (error) => finish(error));
    child.once("close", (code) => finish(code === 0 ? undefined : new Error(`taskkill exited with code ${code ?? "unknown"}.`)));
  });
}

/**
 * Request a group shutdown, then escalate if the group still exists. A sent
 * signal is not exit evidence. Callers observe their child close separately.
 * Descendants that leave the process group are outside this guarantee.
 * Parent SIGKILL/OOM cannot run cleanup; descendant recovery is not guaranteed.
 */
export async function terminateProcessTree(pid: number): Promise<void> {
  if (!validPid(pid)) return;
  if (process.platform === "win32") return terminateWindowsTree(pid);
  // Both execution owners launch detached groups. An absent group must not
  // fall back to a direct PID that may have been reused after its leader exited.
  const target = -pid;
  if (!signal(target, "SIGTERM")) return;
  const deadline = Date.now() + GRACE_MS;
  while (signal(target, 0)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      signal(target, "SIGKILL");
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(25, remaining)));
  }
}

/** The Node exit event cannot await a grace period; this is its final fallback. */
export function forceProcessTree(pid: number): void {
  if (!validPid(pid)) return;
  if (process.platform !== "win32") {
    signal(-pid, "SIGKILL");
    return;
  }
  const result = spawnSync(taskkillPath(), ["/F", "/T", "/PID", String(pid)], {
    stdio: "ignore", windowsHide: true, timeout: 1_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`taskkill exited with code ${result.status ?? "unknown"}.`);
}
