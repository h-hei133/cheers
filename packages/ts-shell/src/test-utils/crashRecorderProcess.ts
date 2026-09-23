/**
 * A process that fails on purpose, for the crash-recorder tests.
 *
 * The recorder's behaviour cannot be observed in-process: registering an
 * `uncaughtException` listener replaces Node's default of terminating, and
 * whether the process still dies is only visible from outside it. This runs as a
 * child process so the test can read the exit status.
 *
 * Usage: tsx crashRecorderProcess.ts <mode> <crash-file>
 * Prints nothing on success; the exit status is the result.
 */

import { installCrashRecorder } from "../observability/crashLog.js";

const [mode, filePath] = process.argv.slice(2);

installCrashRecorder({ cwd: process.cwd(), ...(filePath ? { filePath } : {}) });

if (mode === "throw") {
  // From a timer rather than at the top level, so the listener is installed and
  // the failure arrives the way a real crash does.
  setTimeout(() => {
    throw new Error("fatal from a timer");
  }, 5);
} else {
  Promise.reject(new Error("stray rejection"));
}

// Reached only when the process survived whatever happened above. 99 is the
// signal the test reads as "still running".
setTimeout(() => process.exit(99), 250);
