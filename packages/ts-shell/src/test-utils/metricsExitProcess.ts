/**
 * A process that records metrics and then exits without finishing a turn.
 *
 * The exit flush cannot be observed in-process: `process.exit` ends the run that
 * would read the result. This runs as a child process so the test can inspect the
 * log the child left behind.
 *
 * Usage: tsx metricsExitProcess.ts <exit-mode>
 * Prints nothing; the log directory comes from CHEERS_LOG_DIR.
 */

import { recordCount } from "../observability/metrics.js";

const [mode] = process.argv.slice(2);

// Two calls under one name and tag set, so the written line proves the batch
// preserved its count rather than only that something was written.
recordCount("cli.prompts", 1, { sessionId: "s1" });
recordCount("cli.prompts", 1, { sessionId: "s1" });

if (mode === "throw") {
  // A crash, which is the other way a turn ends without unwinding.
  throw new Error("fatal while a turn was in flight");
}
process.exit(0);
