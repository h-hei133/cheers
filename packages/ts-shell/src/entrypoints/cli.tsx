#!/usr/bin/env node
import process from "node:process";
import path from 'node:path';
import { cliHelpText, isHelpRequested, isVersionRequested } from "../cli/options/early.js";
import { handleCliFatalError } from "../cli/errors/cliFatalErrorBoundary.js";
import { versionLabel } from "../core/version/current.js";
import { time } from "../observability/startupTiming.js";

// The elapsed clock includes runtime startup and this entrypoint's dependency
// evaluation, regardless of when the timing module itself was imported.
async function main(): Promise<void> {
  time("modules loaded");
  const args = process.argv.slice(2);
  if (isVersionRequested(args)) {
    process.stdout.write(`${versionLabel()}\n`);
    return;
  }
  if (isHelpRequested(args)) {
    process.stdout.write(`${cliHelpText()}\n`);
    return;
  }
  const [
    { runCliProcess },
    { installProcessProfile },
    { installCrashRecorder },
  ] = await Promise.all([
    import("../cli/bootstrap/cliProcessRunner.js"),
    import("../core/paths/profile/context.js"),
    import("../observability/crashLog.js"),
  ]);
  await runCliProcess({
    args,
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
  });
}

void main().catch((error) => {
  handleCliFatalError({
    error,
    writeError: console.error,
    exit: process.exit,
  });
});
