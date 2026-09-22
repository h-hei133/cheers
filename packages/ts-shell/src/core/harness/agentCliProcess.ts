import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  captureCliOutput,
  summarizeCliPrompt,
  type AgentCliProcessResult,
  type AgentCliProcessSpec,
} from "./agentCliScenarioModel.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../../../..");
const defaultCliPath = path.join(
  repoRoot,
  "packages",
  "ts-shell",
  "src",
  "entrypoints",
  "cli.tsx",
);
const tsxCliPath = path.join(
  repoRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

const SENSITIVE_ENV_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /credential/i,
  /^CHEERS_REAL_HOME$/i,
];

export interface BuildProjectCliProcessSpecInput {
  readonly prompt: string;
  readonly projectPath: string;
  readonly homeDir?: string;
  readonly cwd?: string;
  readonly timeoutMs?: number;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly cliPath?: string;
}

export function buildProjectCliProcessSpec(
  input: BuildProjectCliProcessSpecInput,
): AgentCliProcessSpec {
  const homeDir =
    input.homeDir ??
    fs.mkdtempSync(path.join(os.tmpdir(), "cheers-cli-scenario-home-"));
  fs.mkdirSync(homeDir, { recursive: true });
  const cliPath = input.cliPath ?? defaultCliPath;
  return {
    command: process.execPath,
    args: [
      tsxCliPath,
      cliPath,
      "--project",
      input.projectPath,
      "--print",
      ...(input.args ?? []),
      input.prompt,
    ],
    cwd: input.cwd ?? repoRoot,
    timeoutMs: input.timeoutMs ?? 10000,
    promptSummary: summarizeCliPrompt(input.prompt),
    env: {
      ...sanitizedProcessEnv(),
      USERPROFILE: homeDir,
      HOME: homeDir,
      CHEERS_PROVIDER_MODE: "disabled",
      CHEERS_REAL_HOME: undefined,
      NO_PROXY: "*",
      ...sanitizeEnvRecord(input.env),
    },
  };
}

export async function runAgentCliProcess(
  spec: AgentCliProcessSpec,
): Promise<AgentCliProcessResult> {
  const started = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: materializeEnv(spec.env),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, spec.timeoutMs);

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.stdin?.end(spec.stdin ?? "");
    child.on("error", (error) => {
      stderr += error.message;
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timeout);
      resolve({
        spec,
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        output: captureCliOutput({ stdout, stderr }),
        evidence: [
          "agent-cli-process:spawned",
          "agent-cli-process:no-provider-env",
          "agent-cli-process:node-tsx-cli",
        ],
        warnings: timedOut ? ["agent-cli-process:timeout"] : [],
        redactions: ["provider-env", "secret-looking-env"],
      });
    });
  });
}

function sanitizedProcessEnv(): Record<string, string> {
  return sanitizeEnvRecord(process.env) as Record<string, string>;
}

function sanitizeEnvRecord(
  env: Readonly<Record<string, string | undefined>> | undefined,
): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(
      ([key, value]) =>
        value !== undefined &&
        !SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(key)),
    ),
  );
}

function materializeEnv(
  env: Readonly<Record<string, string | undefined>> | undefined,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env ?? {}).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
}
