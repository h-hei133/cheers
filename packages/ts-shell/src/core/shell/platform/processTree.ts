import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Cross-Platform Process Tree & Orphan Daemon Manager
 *
 * Implements:
 * 1. Global detached child PID tracking registry
 * 2. Windows taskkill cascade killing (`/F /T /PID <pid>`)
 * 3. POSIX process group cascade killing (`process.kill(-pid, "SIGKILL")`)
 * 4. Automatic signal lifecycle handlers (SIGINT, SIGTERM, SIGHUP, exit)
 */

class ProcessTreeManager {
  private static instance?: ProcessTreeManager;
  private readonly trackedPids = new Set<number>();
  private handlersInstalled = false;

  // Handlers are installed on first use rather than on construction, because
  // construction happens when the module is imported. Registering signal handlers
  // then would change how the whole process responds to an interrupt from the
  // moment it starts, for a capability it may never use.


  static getShared(): ProcessTreeManager {
    if (!ProcessTreeManager.instance) {
      ProcessTreeManager.instance = new ProcessTreeManager();
    }
    return ProcessTreeManager.instance;
  }

  trackPid(pid: number): void {
    this.installSignalHandlers();
    if (pid && Number.isFinite(pid) && pid > 0) {
      this.trackedPids.add(pid);
    }
  }

  untrackPid(pid: number): void {
    this.trackedPids.delete(pid);
  }

  getTrackedCount(): number {
    return this.trackedPids.size;
  }

  killProcessTree(pid: number): void {
    if (!pid || !Number.isFinite(pid) || pid <= 0) return;

    if (process.platform === "win32") {
      try {
        const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
        const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
        const child = spawn(taskkill, ["/F", "/T", "/PID", String(pid)], {
          stdio: "ignore",
          windowsHide: true,
        });
        child.once("error", () => {});
      } catch {
        // Best-effort kill on Windows
      }
    } else {
      try {
        // Kill the whole POSIX process group first
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          // Fallback to direct PID kill
          process.kill(pid, "SIGKILL");
        } catch {
          // Process already terminated
        }
      }
    }

    this.untrackPid(pid);
  }

  killAllTracked(): void {
    for (const pid of this.trackedPids) {
      this.killProcessTree(pid);
    }
    this.trackedPids.clear();
  }

  private installSignalHandlers(): void {
    if (this.handlersInstalled) return;
    this.handlersInstalled = true;

    const cleanup = () => {
      this.killAllTracked();
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGHUP", cleanup);
    process.once("exit", cleanup);
  }
}

export const processTree = ProcessTreeManager.getShared();
export function trackChildPid(pid: number): void {
  processTree.trackPid(pid);
}
export function untrackChildPid(pid: number): void {
  processTree.untrackPid(pid);
}
export function killProcessTree(pid: number): void {
  processTree.killProcessTree(pid);
}
export function killAllTrackedProcesses(): void {
  processTree.killAllTracked();
}
