import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getApprovalMode,
  getWorkspaceSelection,
  isContinueRequested,
  isPrintModeRequested,
  isProviderReadinessRequested,
  isStdinModeRequested,
  parseCliArgs,
} from "./cliArgs.js";

const cwd = path.resolve("/tmp/private-agents-cli-args");

function expectParsed(args: readonly string[]) {
  const result = parseCliArgs(args, { cwd });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.args;
}

function expectParseError(args: readonly string[]) {
  const result = parseCliArgs(args, { cwd });
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error("Expected CLI arg parse to fail");
  }
  return result.error;
}

describe("cli args parser", () => {
  it("preserves version-only detection without parsing later modes", () => {
    const parsed = expectParsed(["--version"]);

    expect(parsed.versionRequested).toBe(true);
    expect(parsed.doctorRequested).toBe(false);
    expect(parsed.options).toEqual({});
  });

  it("preserves workspace selection aliases and removes project path from prompt", () => {
    const projectRoot = path.join(cwd, "fixture-project");
    const parsed = expectParsed([
      "--attach",
      projectRoot,
      "--print",
      "summarize",
      "src/app.ts",
    ]);

    expect(getWorkspaceSelection(parsed)).toBe(projectRoot);
    expect(parsed.options.projectPath).toBe(projectRoot);
    expect(parsed.options.printMode).toBe(true);
    expect(parsed.options.promptArg).toBe("summarize src/app.ts");
  });

  it("preserves doctor precedence after project parsing", () => {
    const parsed = expectParsed(["--doctor", "--provider", "bad-provider"]);

    expect(parsed.doctorRequested).toBe(true);
    expect(parsed.options.provider).toBeUndefined();
    expect(expectParseError(["--doctor", "--project"]).message).toBe(
      "Missing value for --project. Example: --project D:\\path\\to\\your-project",
    );
  });

  it("preserves npm forwarded positional project fallback", () => {
    const parsed = expectParsed(["nested/project", "explain", "status"]);

    expect(parsed.options.projectPath).toBe("nested/project");
    expect(parsed.options.promptArg).toBe("explain status");
  });

  it("preserves absolute path positional project fallback", () => {
    const parsed = expectParsed(["/tmp/project", "explain", "status"]);

    expect(parsed.options.projectPath).toBe("/tmp/project");
    expect(parsed.options.promptArg).toBe("explain status");
  });

  it.each([
    "/continue",
    "/sessions",
    "/mcp",
    "/resume",
    "/workspace",
    "/help",
    "/pwd",
  ])("keeps reserved slash command %s out of project fallback", (command) => {
    const parsed = expectParsed([command, "last"]);

    expect(parsed.options.projectPath).toBeUndefined();
    expect(parsed.options.promptArg).toBe(`${command} last`);
  });

  it("does not parse /continue last as project=/continue", () => {
    const parsed = expectParsed(["/continue", "last"]);

    expect(parsed.options.projectPath).toBeUndefined();
    expect(parsed.options.promptArg).toBe("/continue last");
    expect(isContinueRequested(parsed)).toBe(true);
  });

  it("preserves provider, session, replay, print, migration, and apply-patch flags", () => {
    const parsed = expectParsed([
      "--session-id",
      "sess_route24",
      "--provider",
      "OPENAI-COMPATIBLE",
      "--api-key",
      "test-key",
      "--replay-file",
      "replay.txt",
      "-p",
      "--migrate-session-root",
      "--apply-patch-runtime-route",
      "--apply-patch-workspace-write",
      "--planning-mutation-confirm",
      "--planning-mutation-controlled-workspace",
      "--planning-mutation-proposal",
      "proposal.json",
      "ignored prompt",
    ]);

    expect(parsed.options).toMatchObject({
      sessionId: "sess_route24",
      provider: "openai-compatible",
      apiKey: "test-key",
      replayFile: "replay.txt",
      printMode: true,
      migrateSessionRoot: true,
      applyPatchRuntimeRoute: true,
      applyPatchWorkspaceWrite: true,
      planningMutationConfirm: true,
      planningMutationControlledWorkspace: true,
      planningMutationProposalPath: "proposal.json",
      promptArg: "ignored prompt",
    });
    expect(isPrintModeRequested(parsed)).toBe(true);
    expect(isProviderReadinessRequested(parsed)).toBe(true);
  });

  it("preserves non-interactive approval values and aliases", () => {
    expect(
      getApprovalMode(expectParsed(["--non-interactive-approval", "deny"])),
    ).toBe("deny");
    expect(
      getApprovalMode(expectParsed(["--non-interactive-approval", "y"])),
    ).toBe("allow-once");
    expect(
      getApprovalMode(expectParsed(["--non-interactive-approval=a"])),
    ).toBe("allow-always");
  });

  it("preserves mode-relevant classification helpers without dispatching modes", () => {
    const continueArgs = expectParsed([
      "--project",
      "fixture",
      "--print",
      "/continue",
      "finish",
    ]);
    const stdinArgs = expectParsed(["ask", "from", "stdin"]);

    expect(isContinueRequested(continueArgs)).toBe(true);
    expect(
      isStdinModeRequested({ stdinIsTty: false, cliArgs: stdinArgs }),
    ).toBe(true);
    expect(
      isStdinModeRequested({ stdinIsTty: true, cliArgs: stdinArgs }),
    ).toBe(false);
  });

  it("preserves -- sentinel prompt normalization", () => {
    const parsed = expectParsed([
      "--project",
      "fixture",
      "--",
      "--literal",
      "-p",
      "prompt",
    ]);

    expect(parsed.options.promptArg).toBe("--literal -p prompt");
  });

  it("returns existing parse errors without exiting or printing", () => {
    expect(expectParseError(["--project"]).message).toBe(
      "Missing value for --project. Example: --project D:\\path\\to\\your-project",
    );
    expect(expectParseError(["--replay-file"]).message).toBe(
      "Missing value for --replay-file. Example: --replay-file .\\replay.txt",
    );
    expect(expectParseError(["--planning-mutation-proposal"]).message).toBe(
      "Missing value for --planning-mutation-proposal. Provide a JSON file with exact old/new proposal targets.",
    );
    expect(expectParseError(["--provider", "bad-provider"]).message).toBe(
      "Invalid --provider value: bad-provider. Expected openai, anthropic, openai-compatible, google, antigravity, or claudecode.",
    );
    expect(
      expectParseError(["--non-interactive-approval", "maybe"]).message,
    ).toBe(
      "Invalid --non-interactive-approval value: maybe. Use deny, allow-once, or allow-always.",
    );
  });
});
