import { describe, expect, it } from "vitest";
import { TurnSink } from "./turnSink.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";

const WIDTH = 60;

function build(): { sink: TurnSink; transcript: Transcript; rows: () => string } {
  const transcript = new Transcript();
  let clock = 0;
  const sink = new TurnSink(transcript, () => {}, () => (clock += 100));
  return {
    sink,
    transcript,
    rows: () => transcript.renderViewport(WIDTH, 200).join("\n"),
  };
}

describe("streaming assistant text", () => {
  it("accumulates deltas into one block", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "Hel" } as QueryEvent);
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "lo" } as QueryEvent);
    expect(rows()).toContain("Hello");
  });

  it("estimates streamed tokens for the activity row", () => {
    const { sink } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "x".repeat(400) } as QueryEvent);
    const activity = sink.activity();
    expect(activity?.tokens).toBe(100);
    expect(activity?.estimated).toBe(true);
  });
});

describe("tool lifecycle", () => {
  it("opens a running card and resolves it on the result", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "read", taskId: "t1" } as QueryEvent);
    expect(sink.activity()?.label).toBe("read");
    expect(rows()).toContain("read");

    sink.handleEvent({ type: "tool.result", toolName: "read", taskId: "t1", success: true } as QueryEvent);
    expect(rows()).toContain("✔");
    expect(sink.activity()?.label).toBe("working");
  });

  it("records why a tool failed", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "t1" } as QueryEvent);
    sink.handleEvent({
      type: "tool.result",
      toolName: "bash",
      taskId: "t1",
      success: false,
      failureReason: "exit status 2",
    } as QueryEvent);
    expect(rows()).toContain("✗");
    expect(rows()).toContain("exit status 2");
  });

  it("notes an approval pause on the card that is waiting", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "write", taskId: "t1" } as QueryEvent);
    sink.handleEvent({ type: "approval.requested", toolName: "write", taskId: "t1" } as QueryEvent);
    expect(rows()).toContain("awaiting approval");
  });

  it("ignores a result for a task it never opened", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.result", toolName: "ghost", taskId: "zz", success: true } as QueryEvent);
    expect(rows()).not.toContain("ghost");
  });
});

describe("failure and interruption", () => {
  it("records a runtime error as its own block", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "lifecycle.error", error: "provider timeout" } as QueryEvent);
    expect(rows()).toContain("provider timeout");
  });

  it("says plainly that a turn was interrupted", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "lifecycle.cancelled", reason: "user" } as QueryEvent);
    expect(rows()).toContain("Interrupted");
  });

  it("stops implying progress once cancellation is requested", () => {
    const { sink } = build();
    sink.begin("turn", "turn");
    sink.markCancelling();
    expect(sink.activity()?.cancelling).toBe(true);
  });
});

describe("prose channel", () => {
  it("collects slash command output under the command name", () => {
    const { sink, rows } = build();
    sink.begin("command", "/help");
    sink.line("Available commands:");
    sink.line("/model");
    const rendered = rows();
    expect(rendered).toContain("/help");
    expect(rendered).toContain("Available commands:");
    expect(rendered).toContain("/model");
  });

  it("drops blank filler lines", () => {
    const { sink, transcript } = build();
    sink.begin("command", "/help");
    sink.line("");
    sink.line("   ");
    expect(transcript.renderViewport(WIDTH, 200)).toEqual([]);
  });

  it("keeps prose and streamed text in separate blocks", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.chunk("answer text");
    sink.line("blocked: needs approval");
    const rendered = rows();
    expect(rendered).toContain("answer text");
    expect(rendered).toContain("blocked: needs approval");
    expect(rendered.indexOf("answer text")).toBeLessThan(rendered.indexOf("blocked"));
  });
});

describe("turn boundaries", () => {
  it("reports no activity before a turn and after it ends", () => {
    const { sink } = build();
    expect(sink.activity()).toBeUndefined();
    sink.begin("turn", "turn");
    expect(sink.activity()).toBeDefined();
    sink.end();
    expect(sink.activity()).toBeUndefined();
  });

  it("finalizes everything so the turn can retire into scrollback", () => {
    const { sink, transcript } = build();
    sink.begin("turn", "turn");
    sink.chunk("streaming");
    expect(transcript.peekBatch(WIDTH, 0)).toBeUndefined();
    sink.end();
    expect(transcript.peekBatch(WIDTH, 0)).toBeDefined();
  });
});
