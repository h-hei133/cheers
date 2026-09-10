import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryEvent } from "./runtime/events.js";
import { runAutonomousReActLoop } from "./agentLoop.js";

/**
 * A cancelled turn must end quietly: no network failure invented from the
 * aborted request, no synthesized answer pretending the model finished. The
 * runtime records the interruption; the loop's only job is to stop.
 */

function abortError(): Error {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}

describe("interrupted turns", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "loop-interrupt-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function collect(controller: AbortController): Promise<QueryEvent[]> {
    const events: QueryEvent[] = [];
    for await (const event of runAutonomousReActLoop({
      sessionId: "sess_interrupt",
      prompt: "do something",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
      abortSignal: controller.signal,
    })) {
      events.push(event);
    }
    return events;
  }

  it("does not report a cancelled request as a network failure", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        controller.abort();
        throw abortError();
      }),
    );
    const events = await collect(controller);
    expect(events.some((event) => event.type === "query.failed")).toBe(false);
    expect(events.some((event) => event.type === "query.completed")).toBe(false);
    expect(events.some((event) => event.type === "message.delta")).toBe(false);
  });

  it("does not invent an answer when cancelled after a tool round", async () => {
    const target = path.join(tmpDir, "note.txt");
    await fs.writeFile(target, "contents", "utf8");
    const controller = new AbortController();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls++;
        if (calls > 1) throw abortError();
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    { id: "call_read", type: "function", function: { name: "read", arguments: JSON.stringify({ path: target }) } },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
        };
      }),
    );
    const events: QueryEvent[] = [];
    for await (const event of runAutonomousReActLoop({
      sessionId: "sess_interrupt_tool",
      prompt: "read the note",
      workspaceRoot: tmpDir,
      permissionScope: "ask",
      realProvider: { apiKey: "mock-key", baseUrl: "https://mock.api", model: "mock-model" },
      maxTurns: 5,
      abortSignal: controller.signal,
    })) {
      events.push(event);
      // The user cancels as soon as the tool has run, before the next request.
      if (event.type === "tool.result") controller.abort();
    }
    expect(events.some((event) => event.type === "tool.result")).toBe(true);
    const deltas = events.filter((event) => event.type === "message.delta").map((event) => (event as { delta: string }).delta);
    expect(deltas.join("")).not.toContain("no answer followed");
    expect(events.some((event) => event.type === "query.completed")).toBe(false);
    expect(events.some((event) => event.type === "query.failed")).toBe(false);
  });
});
