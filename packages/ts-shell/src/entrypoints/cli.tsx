#!/usr/bin/env node
import process from "node:process";
import path from 'node:path';
import { cliHelpText, isHelpRequested, isVersionRequested } from "../cli/options/early.js";
import { handleCliFatalError } from "../cli/errors/cliFatalErrorBoundary.js";
import { versionLabel } from "../core/version/current.js";
import { time } from "../observability/startupTiming.js";
import { startupEligible } from '../cli/interactive/startup/eligibility.js';

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
  let stopStartup: (() => void) | undefined;
  if (!process.env.CHEERS_PROFILE_HANDOFF && startupEligible(args, Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY))) {
    const startup = await import('../cli/interactive/startup.js');
    stopStartup = startup.stopStartupSurface;
    await startup.beginStartupSurface();
  }
  try {
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
      writeOutput: message => { stopStartup?.(); console.log(message); },
      writeError: message => { stopStartup?.(); console.error(message); },
      exit: code => { stopStartup?.(); process.exit(code); },
      profileSelected: profile => {
        installProcessProfile(profile);
        installCrashRecorder({ cwd: process.cwd(), filePath: path.join(profile.root, 'crashes.json') });
      },
    });
  } finally { stopStartup?.(); }
}

void main().catch((error) => {
  handleCliFatalError({
    error,
    writeError: console.error,
    exit: process.exit,
  });
});
