#!/usr/bin/env node
import process from "node:process";
import {
  runCliProcess,
} from "../cli/bootstrap/cliProcessRunner.js";
import {
  handleCliFatalError,
} from "../cli/errors/cliFatalErrorBoundary.js";

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
