import { forceProcessTree, terminateProcessTree } from "./termination.js";

/** Tracked command process groups. Catchable shutdowns await bounded cleanup. */
class ProcessTreeManager {
  private static instance?: ProcessTreeManager;
  private readonly trackedPids = new Set<number>();
  private handlersInstalled = false;
  private readonly pendingKills = new Map<number, Promise<void>>();

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
    if (Number.isInteger(pid) && pid > 1 && pid <= 2 ** 31 - 1) {
      this.trackedPids.add(pid);
    }
  }

  untrackPid(pid: number): void {
    // A leader can close while its group still needs escalation.
    if (this.pendingKills.has(pid) && process.platform !== "win32") return;
    this.trackedPids.delete(pid);
  }

  getTrackedCount(): number {
    return this.trackedPids.size;
  }

  killProcessTree(pid: number): Promise<void> {
    const pending = this.pendingKills.get(pid);
    if (pending) return pending;
    const result = terminateProcessTree(pid)
      .then(() => { this.trackedPids.delete(pid); })
      .finally(() => { this.pendingKills.delete(pid); });
    this.pendingKills.set(pid, result);
    return result;
  }

  async killAllTracked(): Promise<void> {
    const pids = new Set([...this.trackedPids, ...this.pendingKills.keys()]);
    const results = await Promise.allSettled([...pids].map((pid) => this.killProcessTree(pid)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Tracked process cleanup failed");
  }

  private forceAllTracked(): void {
    const pids = process.platform === "win32" ? this.trackedPids
      : new Set([...this.trackedPids, ...this.pendingKills.keys()]);
    for (const pid of pids) {
      try { forceProcessTree(pid); } catch { /* No asynchronous recovery is possible during exit. */ }
    }
  }

  private installSignalHandlers(): void {
    if (this.handlersInstalled) return;
    this.handlersInstalled = true;

    const cleanup = () => {
      void this.killAllTracked().catch(() => { /* CLI shutdown observes and reports cleanup failures. */ });
    };

    process.once("SIGINT", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGHUP", cleanup);
    process.once("exit", () => this.forceAllTracked());
  }
}

export const processTree = ProcessTreeManager.getShared();
export function trackChildPid(pid: number): void {
  processTree.trackPid(pid);
}
export function untrackChildPid(pid: number): void {
  processTree.untrackPid(pid);
}
export function killProcessTree(pid: number): Promise<void> {
  return processTree.killProcessTree(pid);
}
export function killAllTrackedProcesses(): Promise<void> {
  return processTree.killAllTracked();
}
