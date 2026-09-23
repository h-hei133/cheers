#!/usr/bin/env node
import process from "node:process";
import {
  runCliProcess,
} from "../cli/bootstrap/cliProcessRunner.js";
import {
  handleCliFatalError,
} from "../cli/errors/cliFatalErrorBoundary.js";
import { installCrashRecorder } from "../observability/crashLog.js";
import { time } from "../observability/startupTiming.js";

// Installed before anything else runs, so a failure during startup is recorded
// too — the moment a process is most likely to fall over is while it is still
// assembling itself.
installCrashRecorder({ cwd: process.cwd() });

// The first mark is the module graph finishing its load, not the process
// starting: `startupTiming.ts` is imported after several other modules, so the
// number is what is left of the load rather than all of it. Named for what it
// measures rather than for the moment it is called.
time("modules loaded");
runCliProcess({
  args: process.argv.slice(2),
  launchCwd: process.cwd(),
  stdin: process.stdin,
  process,
  writeOutput: console.log,
  writeError: console.error,
  exit: process.exit,
}).catch((error) => {
  handleCliFatalError({
    error,
    writeError: console.error,
    exit: process.exit,
  });
});
