import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = process.cwd();
const baselinePath = path.join(repoRoot, "scripts", "real-shape-baseline.json");
const defaultRealHome = "D:/Test/home-sf";

function parseArgs(argv) {
  const filters = new Set();
  const matrixFiles = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--shape" && argv[index + 1]) {
      filters.add(String(argv[index + 1]));
      index += 1;
      continue;
    }
    if (arg === "--from-matrix" && argv[index + 1]) {
      matrixFiles.push(String(argv[index + 1]));
      index += 1;
    }
  }
  return { shapeFilters: filters, matrixFiles };
}

async function runCli(project, prompt) {
  const home = process.env.CHEERS_REAL_HOME || defaultRealHome;
  const args = [
    path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
    "src/entrypoints/cli.tsx",
    "--project",
    project,
    "--print",
    prompt,
  ];
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: path.join(repoRoot, "packages", "ts-shell"),
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = 180000;

    const timer = setTimeout(() => {
      if (!settled) {
        child.kill("SIGTERM");
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 8 * 1024 * 1024) {
        stdout = stdout.slice(-8 * 1024 * 1024);
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8 * 1024 * 1024) {
        stderr = stderr.slice(-8 * 1024 * 1024);
      }
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(`${stdout}${stderr}${stdout || stderr ? "\n" : ""}${String(error)}`);
    });

    child.on("close", (_code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (signal === "SIGTERM" && !stdout && !stderr) {
        resolve("Error: timed out waiting for CLI output");
        return;
      }
      resolve(`${stdout}${stderr}`);
    });

    child.stdin?.end();
  });
}

function parseCurrentSessionId(output) {
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^- ID:\s+/i.test(entry));
  if (!line) {
    return "";
  }
  return line.replace(/^- ID:\s+/i, "").trim();
}

function didSwitchSucceed(output, expectedSessionId) {
  if (/Failed to switch session:/i.test(output)) {
    return false;
  }
  const switchedSession = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^Switched session:/i.test(entry));
  if (switchedSession) {
    const match = switchedSession.match(/^Switched session:\s+(\S+)\s+->\s+(\S+)$/i);
    if (match && match[2] === expectedSessionId) {
      return true;
    }
    if (switchedSession.includes(expectedSessionId)) {
      return true;
    }
  }
  const legacySwitched = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^Switched to/i.test(entry));
  return Boolean(legacySwitched && legacySwitched.includes(expectedSessionId));
}

function parseResultLine(output) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => line.startsWith("Result:")) ?? "";
}

function classifySurface(output, canonicalBlocker) {
  if (output.includes(canonicalBlocker)) {
    return "canonical-blocker";
  }
  if (
    /Continuation follow-up is ambiguous for direct execution \(missing resolvable target\/transform evidence\)/i.test(
      output,
    ) ||
    /no active target\/failure context could be inherited/i.test(output)
  ) {
    return "read-type-blocker";
  }
  if (/Inspect step failed; mutation skipped\./i.test(output)) {
    return "internal-stopped";
  }
  if (/Result:\s+success \(completed\)/i.test(output)) {
    return "completed";
  }
  if (/Result:\s+stopped/i.test(output)) {
    return "stopped-other";
  }
  if (/Result:\s+error/i.test(output)) {
    return "error";
  }
  return "unknown";
}

function shouldRetry(output, retryOnContains) {
  return retryOnContains.some((needle) => output.includes(needle));
}

async function runWithRetry(project, prompt, retryConfig) {
  let attempt = 0;
  let lastOutput = "";
  while (attempt < retryConfig.maxAttempts) {
    attempt += 1;
    lastOutput = await runCli(project, prompt);
    if (!shouldRetry(lastOutput, retryConfig.retryOnContains)) {
      return { output: lastOutput, attempts: attempt, retried: attempt > 1 };
    }
  }
  return { output: lastOutput, attempts: attempt, retried: attempt > 1 };
}

async function main() {
  const raw = await fs.readFile(baselinePath, "utf8");
  const baseline = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const args = parseArgs(process.argv);
  const selectedShapes =
    args.shapeFilters.size > 0
      ? baseline.shapes.filter((shape) => args.shapeFilters.has(shape.id))
      : baseline.shapes;

  const results = [];
  const failures = [];
  const now = new Date();

  if (args.matrixFiles.length > 0) {
    const matrixRows = [];
    for (const file of args.matrixFiles) {
      const rawMatrix = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(rawMatrix.replace(/^\uFEFF/, ""));
      if (Array.isArray(parsed)) {
        matrixRows.push(...parsed);
      }
    }

    for (const shape of selectedShapes) {
      for (const cue of baseline.cueFamily) {
        const hit = matrixRows.find(
          (row) => row?.shape === shape.id && row?.cue === cue,
        );
        const observed =
          typeof hit?.surface === "string" &&
          hit.surface.includes(baseline.canonicalBlockerContains)
            ? "canonical-blocker"
            : typeof hit?.result === "string" &&
                hit.result.includes(baseline.canonicalBlockerContains)
              ? "canonical-blocker"
              : typeof hit?.result === "string" &&
                  /provider-readiness:network/i.test(hit.result)
                ? "network-transient"
            : typeof hit?.result === "string" && /Result:\s+success \(completed\)/i.test(hit.result)
              ? "completed"
              : "missing";
        const pass =
          observed === shape.expectedCueOutcome || observed === "network-transient";
        results.push({
          kind: "cue",
          source: "matrix-artifact",
          shape: shape.id,
          cue,
          expected: shape.expectedCueOutcome,
          observed,
          pass,
          resultLine: hit?.result ?? "",
        });
        if (!pass) {
          failures.push({
            shape: shape.id,
            stage: "cue",
            cue,
            expected: shape.expectedCueOutcome,
            observed,
            resultLine: hit?.result ?? "",
          });
        }
      }
    }

    const report = {
      generatedAt: now.toISOString(),
      baselineVersion: baseline.version,
      selectedShapeCount: selectedShapes.length,
      cueFamily: baseline.cueFamily,
      canonicalBlockerContains: baseline.canonicalBlockerContains,
      mode: "matrix-artifact",
      inputFiles: args.matrixFiles,
      pass: failures.length === 0,
      failureCount: failures.length,
      failures,
      results,
    };

    const outputDir = "D:/Test/test-results";
    await fs.mkdir(outputDir, { recursive: true });
    const ts = now.toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(outputDir, `${ts}-real-shape-baseline-report.json`);
    await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`real-shape-baseline: ${report.pass ? "PASS" : "FAIL"}`);
    console.log(`report: ${outputPath}`);
    console.log(`failureCount: ${report.failureCount}`);
    if (!report.pass) {
      process.exitCode = 1;
    }
    return;
  }

  for (const shape of selectedShapes) {
    const switchPrompt = `/sessions switch ${shape.sessionId}`;
    const switchRun = await runWithRetry(shape.project, switchPrompt, baseline.networkRetry);
    const switchHardFailure = /Failed to switch session:/i.test(switchRun.output);
    const switchAccepted = didSwitchSucceed(switchRun.output, shape.sessionId);
    const currentRun = await runWithRetry(
      shape.project,
      "/sessions current",
      baseline.networkRetry,
    );
    const currentSessionId = parseCurrentSessionId(currentRun.output);
    const switched = !switchHardFailure && currentSessionId === shape.sessionId;

    results.push({
      kind: "switch",
      shape: shape.id,
      project: shape.project,
      sessionId: shape.sessionId,
      pass: switched,
      attempts: switchRun.attempts,
      switchSignalSeen: switchAccepted,
      switchHardFailureSeen: switchHardFailure,
      observedCurrentSessionId: currentSessionId || undefined,
      switchOutputPreview: switchRun.output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 8),
      resultLine: parseResultLine(switchRun.output),
    });
    if (!switched) {
      failures.push({
        shape: shape.id,
        stage: "switch",
        reason: "session switch did not succeed",
      });
      continue;
    }

    for (const cue of baseline.cueFamily) {
      const run = await runWithRetry(shape.project, cue, baseline.networkRetry);
      const surface = classifySurface(run.output, baseline.canonicalBlockerContains);
      const resultLine = parseResultLine(run.output);
      const pass = shape.expectedCueOutcome === surface;
      results.push({
        kind: "cue",
        shape: shape.id,
        cue,
        expected: shape.expectedCueOutcome,
        observed: surface,
        pass,
        attempts: run.attempts,
        retried: run.retried,
        resultLine,
      });
      if (!pass) {
        failures.push({
          shape: shape.id,
          stage: "cue",
          cue,
          expected: shape.expectedCueOutcome,
          observed: surface,
          resultLine,
        });
      }
    }

    if (shape.plainChatProbe) {
      const run = await runWithRetry(shape.project, shape.plainChatProbe, baseline.networkRetry);
      const surface = classifySurface(run.output, baseline.canonicalBlockerContains);
      const resultLine = parseResultLine(run.output);
      const pass = surface === "completed" && !run.output.includes(baseline.canonicalBlockerContains);
      results.push({
        kind: "plain-chat",
        shape: shape.id,
        prompt: shape.plainChatProbe,
        observed: surface,
        pass,
        attempts: run.attempts,
        retried: run.retried,
        resultLine,
      });
      if (!pass) {
        failures.push({
          shape: shape.id,
          stage: "plain-chat",
          observed: surface,
          resultLine,
        });
      }
    }

    if (shape.explicitReopen) {
      const targetContent = await fs.readFile(shape.explicitReopen.targetFile, "utf8");
      const candidate = shape.explicitReopen.transforms.find((entry) =>
        targetContent.includes(entry.from),
      );
      if (!candidate) {
        results.push({
          kind: "explicit-reopen",
          shape: shape.id,
          pass: false,
          reason: "no matching transform source found in target file",
          targetFile: shape.explicitReopen.targetFile,
        });
        failures.push({
          shape: shape.id,
          stage: "explicit-reopen",
          reason: "no matching transform source found in target file",
        });
      } else {
        const relativeTarget = path
          .relative(shape.project, shape.explicitReopen.targetFile)
          .replace(/\\/g, "/");
        const prompt = `replace ${candidate.from} with ${candidate.to} in ${relativeTarget}`;
        const run = await runWithRetry(shape.project, prompt, baseline.networkRetry);
        const resultLine = parseResultLine(run.output);
        const pass = /Result:\s+success \(completed\)/i.test(resultLine);
        results.push({
          kind: "explicit-reopen",
          shape: shape.id,
          pass,
          prompt,
          attempts: run.attempts,
          retried: run.retried,
          resultLine,
        });
        if (!pass) {
          failures.push({
            shape: shape.id,
            stage: "explicit-reopen",
            resultLine,
          });
        }
      }
    }
  }

  const report = {
    generatedAt: now.toISOString(),
    baselineVersion: baseline.version,
    selectedShapeCount: selectedShapes.length,
    cueFamily: baseline.cueFamily,
    canonicalBlockerContains: baseline.canonicalBlockerContains,
    pass: failures.length === 0,
    failureCount: failures.length,
    failures,
    results,
  };

  const outputDir = "D:/Test/test-results";
  await fs.mkdir(outputDir, { recursive: true });
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `${ts}-real-shape-baseline-report.json`);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  const summaryLines = [
    `real-shape-baseline: ${report.pass ? "PASS" : "FAIL"}`,
    `report: ${outputPath}`,
    `failureCount: ${report.failureCount}`,
  ];
  for (const line of summaryLines) {
    console.log(line);
  }
  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
