import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StreamingRenderer } from "../presentation/terminal/streaming.js";
import {
  buildCliCommandExecution,
  projectCliCommandExecution,
  type CliCommandExecutionBridge,
} from "./cliCommandExecutionBridge.js";
import type { CommandExecutionResult } from "../core/commands/types.js";
import { BROWSER_RECEIPT_CACHE_ROOT_ENV } from "../browser/receipt/manifest.js";
import { forgetSessionTodos, getSessionTodos, replayTodosFromMessages } from "../core/commands/todoCommandRuntime.js";
import type { SessionMessage } from "../session/schema/sessionMessage.js";
import { createMessageTranscriptEvent, transcriptEventToSessionMessage } from "../session/sessionEventCodec.js";

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

function bridge(result: CommandExecutionResult | null): CliCommandExecutionBridge {
  return {
    routeSlashCommand: async () => result,
  };
}

describe("CLI command execution bridge", () => {
  it("records only successful todo mutations and replays immutable state across aliases", async () => {
    const sessionId = "local-checklist";
    forgetSessionTodos(sessionId);
    const messages: SessionMessage[] = [];
    const output = renderer();
    const run = (prompt: string) => buildCliCommandExecution({
      prompt, cwd: "/workspace", renderer: output as StreamingRenderer, printMode: false, interactive: true, sessionId,
      onTurnMessage: (message) => messages.push(transcriptEventToSessionMessage(createMessageTranscriptEvent({ ...message, timestamp: "today" }))!),
    });
    await run('/todo add "durable checklist"');
    await run("/tasks start 1");
    await run("/checklist done 1");
    await run("/todo list");
    await run("/todo unknown");
    expect(messages).toHaveLength(3);
    expect(messages.every((message) => message.role === "user" && !message.tool_call_id)).toBe(true);
    forgetSessionTodos(sessionId);
    replayTodosFromMessages(sessionId, messages.slice(0, 1));
    expect(getSessionTodos(sessionId)).toEqual([{ id: 1, text: "durable checklist", status: "pending" }]);
    await run("/todo start 1");
    replayTodosFromMessages(sessionId, messages.slice(0, 1));
    expect(getSessionTodos(sessionId)[0]?.status).toBe("pending");
    messages.pop();
    replayTodosFromMessages(sessionId, messages);
    expect(getSessionTodos(sessionId)[0]?.status).toBe("done");
    await run("/todo clear");
    forgetSessionTodos(sessionId);
    replayTodosFromMessages(sessionId, messages);
    expect(getSessionTodos(sessionId)).toEqual([]);
  });

  it("does not render success if recording changed local state fails", async () => {
    const output = renderer();
    await expect(buildCliCommandExecution({
      prompt: "/todo clear", cwd: "/workspace", renderer: output as StreamingRenderer,
      printMode: false, interactive: true, sessionId: "failed-record",
      onTurnMessage: () => { throw new Error("disk full"); },
    })).rejects.toThrow("disk full");
    expect(output.lines).toEqual([]);
  });

  it("passes the live keyboard guide through to the hotkey command", async () => {
    const output = renderer();
    await buildCliCommandExecution({
      prompt: "/hotkey", cwd: "/workspace", renderer: output as StreamingRenderer,
      printMode: false, interactive: true, modifierKeysReported: true,
      keyGuide: [{ keys: ["ctrl+r"], does: "Retry the last prompt", group: "session" }],
    });
    expect(output.lines.join("\n")).toContain("`ctrl+r`");
    expect(output.lines.join("\n")).not.toContain("`f5`");
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

  it("passes session-scoped compact stores to slash commands", async () => {
    const output = renderer();
    const contextSeen: unknown[] = [];
    const resolved = await buildCliCommandExecution(
      {
        prompt: "/compact",
        cwd: "/workspace",
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
        sessionId: "sess_bridge",
        compactCheckpointStore: "checkpoint-store" as never,
        compactInjectionStateStore: "injection-store" as never,
      },
      {
        routeSlashCommand: async (_prompt, context) => {
          contextSeen.push(context);
          return { kind: "local", output: "compact output" };
        },
      },
    );

    expect(resolved).toEqual({ kind: "handled" });
    expect(contextSeen).toEqual([
      expect.objectContaining({
        cwd: "/workspace",
        sessionId: "sess_bridge",
        compactCheckpointStore: "checkpoint-store",
        compactInjectionStateStore: "injection-store",
      }),
    ]);
  });

  it("passes explicit browser receipt cache store from env to slash commands", async () => {
    const output = renderer();
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cli-browser-cache-"));
    const contextSeen: unknown[] = [];
    try {
      const resolved = await buildCliCommandExecution(
        {
          prompt: "/browser replay status",
          cwd: "/workspace",
          renderer: output as StreamingRenderer,
          printMode: false,
          interactive: true,
          env: {
            [BROWSER_RECEIPT_CACHE_ROOT_ENV]: cacheRoot,
          },
        },
        {
          routeSlashCommand: async (_prompt, context) => {
            contextSeen.push(context);
            return { kind: "local", output: "browser output" };
          },
        },
      );

      expect(resolved).toEqual({ kind: "handled" });
      expect(contextSeen).toEqual([
        expect.objectContaining({
          browserReceiptCacheStore: expect.objectContaining({
            manifest: expect.objectContaining({ cacheRoot }),
          }),
        }),
      ]);
    } finally {
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    }
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

  it("projects slash prompt expansions without rewriting the prompt", async () => {
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
      effectivePrompt: "Create python script demo in current directory",
    });
    expect(output.lines).toEqual([
      "\nSlash command expanded into prompt:\nCreate python script demo in current directory\n",
    ]);
  });

  it("keeps prompt projection as identity", () => {
    expect(projectCliCommandExecution({ prompt: "hello" })).toEqual({
      effectivePrompt: "hello",
    });
  });

  it("sends a plain line through as written, even when a template shares its first word", async () => {
    // Templates are invoked with a slash, so a file named `review.md` must not turn
    // the sentence "review this function" into its own body. Rewriting here deleted
    // words the user typed without anything asking.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-bridge-prompts-"));
    fs.mkdirSync(path.join(dir, ".agents", "prompts"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".agents", "prompts", "review.md"), "TEMPLATE BODY: $@", "utf8");

    const output = renderer();
    const resolved = await buildCliCommandExecution(
      {
        prompt: "review this function",
        cwd: dir,
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
      },
      bridge(null),
    );

    expect(resolved).toEqual({ kind: "execute", effectivePrompt: "review this function" });
    expect(output.lines).toEqual([]);
  });

  it("expands a template the user invoked with a slash", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-bridge-prompts-"));
    fs.mkdirSync(path.join(dir, ".agents", "prompts"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".agents", "prompts", "explain.md"), "Explain $@ closely.", "utf8");

    const output = renderer();
    const resolved = await buildCliCommandExecution(
      {
        prompt: "/explain the parser",
        cwd: dir,
        renderer: output as StreamingRenderer,
        printMode: false,
        interactive: true,
      },
    );

    expect(resolved).toEqual({ kind: "execute", effectivePrompt: "Explain the parser closely." });
  });
});
