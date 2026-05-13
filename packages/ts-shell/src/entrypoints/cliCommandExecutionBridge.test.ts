import { describe, expect, it } from "vitest";
import type { StreamingRenderer } from "../renderer/StreamingRenderer.js";
import {
  buildCliCommandExecution,
  normalizePromptForExecution,
  projectCliCommandExecution,
  type CliCommandExecutionBridge,
} from "./cliCommandExecutionBridge.js";

function renderer(): Pick<StreamingRenderer, "renderLine"> & {
  readonly lines: string[];
} {
  const lines: string[] = [];
  return {
    lines,
    renderLine: (line: string) => {
      lines.push(line);
    },
  };
}

function bridge(
  result: Awaited<ReturnType<CliCommandExecutionBridge["routeSlashCommand"]>>,
  repoAwareResponse: string | null = null,
): CliCommandExecutionBridge {
  return {
    routeSlashCommand: async () => result,
    resolveRepoAwarePromptResponse: () => repoAwareResponse,
  };
}

describe("CLI command execution bridge", () => {
  it("renders repo-aware handled responses with print-mode formatting", async () => {
    const output = renderer();
    const resolved = await buildCliCommandExecution(
      {
        prompt: "where am I?",
        cwd: "/workspace",
        renderer: output as StreamingRenderer,
        printMode: true,
        interactive: false,
      },
      bridge(null, "Current working directory: /workspace"),
    );

    expect(resolved).toEqual({ kind: "handled" });
    expect(output.lines).toEqual(["Current working directory: /workspace"]);
  });

  it("renders local slash command output with interactive spacing", async () => {
    const output = renderer();
    const resolved = await buildCliCommandExecution(
      {
        prompt: "/pwd",
        cwd: "/workspace",
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
      },
      bridge({ kind: "local", output: "Project root: /workspace" }),
    );

    expect(resolved).toEqual({ kind: "handled" });
    expect(output.lines).toEqual(["\nProject root: /workspace\n"]);
  });

  it("passes shell actions back to cli.tsx without executing them", async () => {
    const output = renderer();
    const slashResult = {
      kind: "shell-action",
      action: "show-help",
    } as const;
    const resolved = await buildCliCommandExecution(
      {
        prompt: "/help",
        cwd: "/workspace",
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
      },
      bridge(slashResult),
    );

    expect(resolved).toEqual({ kind: "shell-action", slashResult });
    expect(output.lines).toEqual([]);
  });

  it("projects slash prompt expansions and normalized execution prompts", async () => {
    const output = renderer();
    const resolved = await buildCliCommandExecution(
      {
        prompt: "/diagnose",
        cwd: "/workspace",
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
      },
      bridge({
        kind: "prompt",
        prompt: "Create python script demo in current directory",
      }),
    );

    expect(resolved).toEqual({
      kind: "execute",
      effectivePrompt:
        "Create a python script at ./demo.py with a minimal hello world implementation.",
    });
    expect(output.lines).toEqual([
      "\nSlash command expanded into prompt:\nCreate python script demo in current directory\n",
    ]);
  });

  it("keeps prompt normalization available as a pure projection", () => {
    expect(projectCliCommandExecution({ prompt: "hello" })).toEqual({
      effectivePrompt: "hello",
    });
    expect(
      normalizePromptForExecution("Create python script demo in current directory"),
    ).toBe(
      "Create a python script at ./demo.py with a minimal hello world implementation.",
    );
  });
});
