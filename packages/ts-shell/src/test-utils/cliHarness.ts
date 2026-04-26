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
