#!/usr/bin/env node
import process from "node:process";
import path from 'node:path';
import { installProcessProfile } from '../core/paths/profile/context.js';
import {
  runCliProcess,
} from "../cli/bootstrap/cliProcessRunner.js";
import {
  handleCliFatalError,
} from "../cli/errors/cliFatalErrorBoundary.js";
import { installCrashRecorder } from "../observability/crashLog.js";
import { time } from "../observability/startupTiming.js";

// The elapsed clock includes runtime startup and this entrypoint's dependency
// evaluation, regardless of when the timing module itself was imported.
time("modules loaded");
runCliProcess({
  args: process.argv.slice(2),
  launchCwd: process.cwd(),
  stdin: process.stdin,
  process,
  writeOutput: console.log,
  writeError: console.error,
  exit: process.exit,
  profileSelected: profile => {
    installProcessProfile(profile);
    installCrashRecorder({ cwd: process.cwd(), filePath: path.join(profile.root, 'crashes.json') });
  },
}).catch((error) => {
  handleCliFatalError({
    error,
    writeError: console.error,
    exit: process.exit,
  });
});
