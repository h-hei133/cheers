import { spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";

export type SpawnCliForTest = (
  fakeHome: string,
  args?: string[],
  envOverrides?: Record<string, string>,
) => ChildProcess;

export type ClosedCliCommandResult = {
  code: number | null;
  output: string;
};

export type InteractiveStartupSmokeResult = {
  output: string;
  sessionId: string | null;
};

export type InteractiveLineSmokeResult = {
  output: string;
  sessionId: string | null;
};

export function createGitRepoFixture(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  const initialized = spawnSync("git", ["init", "-q"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (initialized.status !== 0) {
    throw new Error(
      `Failed to initialize git repo at ${root}: ${initialized.stderr || initialized.error?.message || "unknown error"}`,
    );
  }
}

export function normalizeCliOutput(output: string): string {
  return output.replace(/\\/g, "/");
}

export async function runCliCommandToClose(input: {
  spawnCli: SpawnCliForTest;
  fakeHome: string;
  args: string[];
  envOverrides?: Record<string, string>;
  timeoutMs?: number;
}): Promise<ClosedCliCommandResult> {
  const {
    spawnCli,
    fakeHome,
    args,
    envOverrides = {},
    timeoutMs = 30000,
  } = input;

  return await new Promise((resolve, reject) => {
    const cli = spawnCli(fakeHome, args, envOverrides);
    let output = "";
    const timeout = setTimeout(() => {
      cli.kill();
      reject(
        new Error(
          `Timed out waiting for CLI command: ${args.join(" ")}\nOutput so far:\n${output}`,
        ),
      );
    }, timeoutMs);

    cli.stdout?.on("data", (data) => {
      output += data.toString();
    });
    cli.stderr?.on("data", (data) => {
      output += data.toString();
    });
    cli.stdin?.end();
    cli.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
    cli.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

export async function runInteractiveStartupSmoke(input: {
  spawnCli: SpawnCliForTest;
  fakeHome: string;
  args?: string[];
  envOverrides?: Record<string, string>;
  readyMarker?: string;
  timeoutMs?: number;
}): Promise<InteractiveStartupSmokeResult> {
  const {
    spawnCli,
    fakeHome,
    args = [],
    envOverrides = {},
    readyMarker = "Ctrl+C cancels the current run. Ctrl+D exits.",
    timeoutMs = 15000,
  } = input;

  return await new Promise((resolve, reject) => {
    const cli = spawnCli(fakeHome, args, envOverrides);
    let output = "";
    let settled = false;

    const finish = (callback: () => InteractiveStartupSmokeResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const result = callback();
      cli.kill();
      resolve(result);
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      cli.kill();
      reject(error);
    };

    const timeout = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for interactive startup marker: ${readyMarker}\nOutput so far:\n${output}`,
        ),
      );
    }, timeoutMs);

    const onData = (data: Buffer) => {
      output += data.toString();
      if (!output.includes(readyMarker)) {
        return;
      }
      finish(() => {
        const matched = output.match(/Session:\s*(sess_[^\s\r\n]+)/);
        return {
          output,
          sessionId: matched?.[1] ?? null,
        };
      });
    };

    cli.stdout?.on("data", onData);
    cli.stderr?.on("data", onData);
    cli.on("error", fail);
  });
}

export async function runInteractiveLineSmoke(input: {
  spawnCli: SpawnCliForTest;
  fakeHome: string;
  line: string;
  waitFor: string;
  args?: string[];
  envOverrides?: Record<string, string>;
  readyMarker?: string;
  timeoutMs?: number;
}): Promise<InteractiveLineSmokeResult> {
  const {
    spawnCli,
    fakeHome,
    line,
    waitFor,
    args = [],
    envOverrides = {},
    readyMarker = "Ctrl+C cancels the current run. Ctrl+D exits.",
    timeoutMs = 20000,
  } = input;

  return await new Promise((resolve, reject) => {
    const cli = spawnCli(fakeHome, args, envOverrides);
    let output = "";
    let sessionId: string | null = null;
    let lineSent = false;
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      cli.kill();
      resolve({ output, sessionId });
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      cli.kill();
      reject(error);
    };

    const timeout = setTimeout(() => {
      fail(
        new Error(
          `Timed out waiting for interactive line marker: ${waitFor}\nOutput so far:\n${output}`,
        ),
      );
    }, timeoutMs);

    const onData = (data: Buffer) => {
      output += data.toString();
      if (!sessionId) {
        sessionId = output.match(/Session:\s*(sess_[^\s\r\n]+)/)?.[1] ?? null;
      }
      if (!lineSent && output.includes(readyMarker)) {
        lineSent = true;
        cli.stdin?.write(line.endsWith("\n") ? line : `${line}\n`);
        return;
      }
      if (lineSent && output.includes(waitFor)) {
        finish();
      }
    };

    cli.stdout?.on("data", onData);
    cli.stderr?.on("data", onData);
    cli.on("error", fail);
  });
}
