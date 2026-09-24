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

const cwd = path.resolve("/tmp/cheers-cli-args");

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

  it("preserves provider, session, replay, print, and migration flags", () => {
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
      "ignored prompt",
    ]);

    expect(parsed.options).toMatchObject({
      sessionId: "sess_route24",
      provider: "openai-compatible",
      apiKey: "test-key",
      replayFile: "replay.txt",
      printMode: true,
      migrateSessionRoot: true,
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

describe("--no-context-files", () => {
  it("is off unless asked for", () => {
    expect(expectParsed([]).options.noContextFiles).toBe(false);
  });

  it("is set when the flag is given", () => {
    expect(expectParsed(["--no-context-files"]).options.noContextFiles).toBe(true);
  });

  it("does not consume the prompt that follows it", () => {
    // The flag takes no value, so the next token is still the prompt rather than
    // being swallowed as its argument.
    const parsed = expectParsed(["--no-context-files", "explain this repo"]);
    expect(parsed.options.promptArg).toBe("explain this repo");
  });
});

describe("--tools", () => {
  it("is absent unless asked for, which means no restriction", () => {
    // Absent is not the same as empty: absent leaves the pool alone.
    expect(expectParsed([]).options.allowedTools).toBeUndefined();
  });

  it("takes a comma-separated list", () => {
    expect(expectParsed(["--tools", "read,grep,glob"]).options.allowedTools).toEqual([
      "read",
      "grep",
      "glob",
    ]);
  });

  it("trims whitespace around names", () => {
    expect(expectParsed(["--tools", " read , grep "]).options.allowedTools).toEqual(["read", "grep"]);
  });

  it("does not consume the prompt that follows it", () => {
    const parsed = expectParsed(["--tools", "read", "review this repo"]);
    expect(parsed.options.allowedTools).toEqual(["read"]);
    expect(parsed.options.promptArg).toBe("review this repo");
  });

  it("refuses a missing value rather than reading the next flag as one", () => {
    expect(expectParseError(["--tools"]).message).toContain("Missing value for --tools");
    expect(expectParseError(["--tools", "--print"]).message).toContain("Missing value for --tools");
  });

  it("refuses a list with no names in it", () => {
    // `--tools ,,` is a typo, not a request for zero tools. Accepting it would
    // offer the model nothing and look like the agent had broken.
    expect(expectParseError(["--tools", ",,"]).message).toContain("No tool names in --tools");
  });
});

describe("--dangerously-bypass-hook-trust", () => {
  it("is off unless asked for", () => {
    expect(expectParsed([]).options.dangerouslyBypassHookTrust).toBe(false);
  });

  it("is set when the flag is given", () => {
    expect(expectParsed(["--dangerously-bypass-hook-trust"]).options.dangerouslyBypassHookTrust).toBe(true);
  });

  it("does not consume the prompt that follows it", () => {
    const parsed = expectParsed(["--dangerously-bypass-hook-trust", "run the tests"]);
    expect(parsed.options.promptArg).toBe("run the tests");
  });
});

describe("--skill and --no-skills", () => {
  it("are absent unless asked for", () => {
    expect(expectParsed([]).options.skillPaths).toBeUndefined();
    expect(expectParsed([]).options.noSkills).toBe(false);
  });

  it("collects a repeated --skill in order", () => {
    expect(
      expectParsed(["--skill", "./a.md", "--skill", "./b"]).options.skillPaths,
    ).toEqual(["./a.md", "./b"]);
  });

  it("lets both flags coexist", () => {
    // Discovery off with named paths still on is the combination the
    // semantics promise: the switch silences what was found, not what was
    // named.
    const parsed = expectParsed(["--no-skills", "--skill", "./a.md"]);
    expect(parsed.options.noSkills).toBe(true);
    expect(parsed.options.skillPaths).toEqual(["./a.md"]);
  });

  it("accepts the short form of --no-skills", () => {
    expect(expectParsed(["-ns"]).options.noSkills).toBe(true);
  });

  it("refuses a missing value rather than reading the next flag as one", () => {
    expect(expectParseError(["--skill"]).message).toContain("Missing value for --skill");
    expect(expectParseError(["--skill", "--print"]).message).toContain("Missing value for --skill");
  });

  it("does not consume the prompt that follows it", () => {
    const parsed = expectParsed(["--skill", "./a.md", "review this repo"]);
    expect(parsed.options.skillPaths).toEqual(["./a.md"]);
    expect(parsed.options.promptArg).toBe("review this repo");
  });
});
