import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "../session/SessionManager.js";
import { createWorkspaceWriteAuthority } from "../orchestration/patchResult/workspaceAuthority.js";
import { buildWorkspaceWriteRouteResult } from "../edit/result/workspace/workspaceWriteResult.js";
import { runWorkspaceWriteRoute } from "../orchestration/patchResult/workspaceWriteRoute.js";

type WriteEffectFixture = "unknown" | "unverified";

const targetPath = "src/app.ts";
const patchText = [
  "*** Begin Patch",
  "*** Update File: src/app.ts",
  "@@",
  "-status: draft",
  "+status: ready",
  "*** End Patch",
].join("\n");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.env.USERPROFILE = args.homeDir;
  process.env.HOME = args.homeDir;

  const projectRoot = path.join(
    args.homeDir,
    `selected-workspace-cross-process-${args.writeEffect}`,
  );
  fs.mkdirSync(path.join(projectRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, targetPath),
    "status: draft\nowner: user-workspace\n",
    "utf8",
  );

  const authority = createWorkspaceWriteAuthority(projectRoot);
  const route = await runWorkspaceWriteRoute({
    workspaceRoot: projectRoot,
    rawPatchText: patchText,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved",
    defaultProductionRejectionUnchanged: true,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile:
      args.writeEffect === "unknown"
        ? () => {
            throw new Error("simulated writer failure after start");
          }
        : () => {},
  });

  if (route.status !== "blocked" || route.writeEffect !== args.writeEffect) {
    throw new Error(
      `Expected blocked ${args.writeEffect} route, got status=${route.status} writeEffect=${route.writeEffect}`,
    );
  }

  const manager = new SessionManager();
  const session = manager.createNew(projectRoot, {
    rootMode: "direct",
    requestedWorkspaceRoot: projectRoot,
    targetPathBase: projectRoot,
    gitRoot: null,
  });
  const prompt = `apply patch to ${targetPath}`;
  manager.persistUserPromptBarrier(session.id, prompt);
  const result = buildWorkspaceWriteRouteResult({
    sessionId: session.id,
    prompt,
    route,
  });
  manager.appendQueryEvent(session.id, {
    type: "query.completed",
    result,
  });
  manager.saveError(session.id, result.stopReason ?? result.status, {
    terminalReason: result.terminalReason,
    terminalClassification: result.terminalClassification,
    lastContinuationReason: result.lastContinuationReason,
  });

  const codingResult = result.codingResult;
  process.stdout.write(
    JSON.stringify({
      projectRoot,
      sessionId: session.id,
      sessionDir: manager.getSessionDirPath(session.id),
      targetPath,
      writeEffect: args.writeEffect,
      stopReason: result.stopReason,
      nextAction: codingResult?.verification.nextAction ?? route.nextAction,
      changedFiles: codingResult?.changedFiles ?? [],
      seedChangedFiles: codingResult?.lastActionResultSeed?.changedFiles ?? [],
    }) + "\n",
  );
}

function parseArgs(args: readonly string[]): {
  readonly homeDir: string;
  readonly writeEffect: WriteEffectFixture;
} {
  const homeDir = valueAfter(args, "--home");
  const writeEffect = valueAfter(args, "--effect");
  if (!homeDir) {
    throw new Error("Missing --home");
  }
  if (writeEffect !== "unknown" && writeEffect !== "unverified") {
    throw new Error("Expected --effect unknown|unverified");
  }
  return { homeDir, writeEffect };
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

main().catch((error) => {
  process.stderr.write(
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
  process.stderr.write("\n");
  process.exitCode = 1;
});
