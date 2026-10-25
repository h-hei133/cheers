import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(currentDir, "..", "..", "..", "..", "..");
export const cliPath = path.join(currentDir, "..", "..", "entrypoints", "cli.tsx");

/**
 * A connected MCP server backed by the stdio fixture.
 *
 * The fixtures used to declare an unimplemented transport and attach `mockTools`,
 * which made a server look connected without anything able to serve it. That is
 * the behaviour the client no longer reports, so the fixtures use the transport
 * that works and the tool the fixture server actually exposes.
 */
export function stdioServerFixture(): { transport: string; command: string; args: string[] } {
  return {
    transport: "stdio",
    command: process.execPath,
    args: [path.join(repoRoot, "packages", "ts-shell", "src", "core", "mcp", "fixtures", "mockMcpServer.mjs")],
  };
}

export const tsxCliPath = path.join(
  repoRoot,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);
export const nodeExe = process.execPath;

export type ParsedTranscriptEntry = {
  type?: string;
  event?: {
    type?: string;
    prompt?: string;
    toolName?: string;
    success?: boolean;
      result?: {
        status?: string;
        terminalClassification?: string;
        codingResult?: {
          taskKind?: string;
          changedFiles?: string[];
          failedFiles?: Array<{ path?: string; reason?: string }>;
          evidence?: string[];
          changeSet?: {
            changedFiles?: string[];
          };
          lastActionResultSeed?: {
            target?: string;
            changedFiles?: string[];
            writerStarted?: boolean;
            writeEffect?: string;
            requiresUserInspection?: boolean;
          };
        };
        sharedContext?: {
          notes?: string[];
      };
    };
  };
};

export function parseTranscriptJsonl(filePath: string): ParsedTranscriptEntry[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as ParsedTranscriptEntry];
      } catch {
        // Ignore partial trailing lines if the process is still flushing.
        return [];
      }
    });
}

export function isReadableJsonFile(filePath: string): boolean {
  try {
    const content = fs.readFileSync(filePath, "utf8").trim();
    if (!content) {
      return false;
    }
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}

export function readJsonFileEventually<T>(filePath: string, attempts = 20): T {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content) {
        return JSON.parse(content) as T;
      }
    } catch (error) {
      lastError = error;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for readable JSON file: ${filePath}`);
}

// This helper intentionally drives the CLI through child_process pipes.
// It is interactive-style coverage, not true PTY / terminal fidelity coverage.
export function spawnCli(
  fakeHome: string,
  args: string[] = [],
  envOverrides: Record<string, string> = {},
): ChildProcess {
  const hostHome = process.env.USERPROFILE ?? process.env.HOME;
  const hostCargoHome =
    process.env.CARGO_HOME ??
    (hostHome ? path.join(hostHome, ".cargo") : undefined);
  const hostRustupHome =
    process.env.RUSTUP_HOME ??
    (hostHome ? path.join(hostHome, ".rustup") : undefined);

  return spawn(nodeExe, [tsxCliPath, cliPath, ...args], {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(hostCargoHome ? { CARGO_HOME: hostCargoHome } : {}),
      ...(hostRustupHome ? { RUSTUP_HOME: hostRustupHome } : {}),
      USERPROFILE: fakeHome,
      HOME: fakeHome,
      ...envOverrides,
    },
  });
}

export function whenOutputContains(
  cli: ChildProcess,
  needle: string,
  callback: () => void,
): void {
  let triggered = false;
  const handler = (data: Buffer) => {
    if (triggered) {
      return;
    }
    if (data.toString().includes(needle)) {
      triggered = true;
      callback();
    }
  };

  cli.stdout?.on("data", handler);
  cli.stderr?.on("data", handler);
}

export function removeWithRetry(target: string): void {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // ENOTEMPTY and EBUSY mean a writer is mid-flight; anything else is a
      // real problem and should not be swallowed.
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "ENOENT") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
