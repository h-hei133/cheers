import { describe, expect, it } from "vitest";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { TurnSink } from "./turnSink.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import type { QueryEvent } from "../../core/query/runtime/events.js";
import { createProviderReadinessCliTerminalEvent } from "../../entrypoints/providerReadinessCliSurface.js";

const WIDTH = 60;

function build(): { sink: TurnSink; transcript: Transcript; rows: () => string } {
  const transcript = new Transcript();
  let clock = 0;
  const sink = new TurnSink(transcript, () => {}, () => (clock += 100));
  return {
    sink,
    transcript,
    rows: () => transcript.render(WIDTH).rows.join("\n"),
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

  it("shows no token figure while streaming", () => {
    // A count that ticks up per character is a guess; the band carries the
    // provider's own numbers once the request is accounted for.
    const { sink } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "x".repeat(400) } as QueryEvent);
    expect(sink.activity()?.tokens).toBe(0);
  });
});

describe("interruption", () => {
  it("records the interruption once when the turn ends without a terminal event", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "partial" } as QueryEvent);
    sink.markCancelling();
    sink.end();
    const text = rows();
    expect(text).toContain("partial");
    expect(text.split("Interrupted before completion.").length - 1).toBe(1);
    expect(sink.lastTurnFailed).toBe(true);
  });

  it("does not repeat the notice when the runtime already reported the cancellation", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.markCancelling();
    sink.handleEvent({ type: "lifecycle.cancelled", reason: "user" } as QueryEvent);
    sink.end();
    expect(rows().split("Interrupted before completion.").length - 1).toBe(1);
  });

  it("stays silent when the turn finished normally", () => {
    const { sink, rows } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "done" } as QueryEvent);
    sink.end();
    expect(rows()).not.toContain("Interrupted");
    expect(sink.lastTurnFailed).toBe(false);
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
  it("renders a readiness refusal even when no query or assistant message started", () => {
    const { sink, transcript, rows } = build();
    sink.begin("turn", "inspect notes");
    sink.handleEvent(createProviderReadinessCliTerminalEvent({
      sessionId: "stopped", prompt: "inspect notes", stopReason: "Authentication was rejected. Check the selected account.",
    }));
    sink.end();
    expect(rows()).toContain("Authentication was rejected.");
    expect(transcript.all().map(block => block.kind)).toEqual(["error"]);
    expect(sink.lastTurnFailed).toBe(true);
    expect(sink.retryTarget("inspect notes", sink.lastTurnFailed)).toBe("inspect notes");
  });

  it.each(["stopped_cycle", "stopped_max_turns", "stopped_invalid_handoff", "stopped_not_proven", "stopped_error"] as const)(
    "shows a stopped completion as a notice, preserving partial output: %s", status => {
      const { sink, transcript, rows } = build();
      sink.begin("turn", "inspect notes");
      sink.chunk("Partial answer");
      const event = createProviderReadinessCliTerminalEvent({ sessionId: "stopped", prompt: "inspect notes", stopReason: "Approval denied." });
      if (event.type !== "query.completed") throw new Error("Expected terminal event");
      sink.handleEvent({ ...event, result: { ...event.result, status, terminalReason: status, terminalClassification: "stopped" } });
      sink.end();
      expect(rows()).toContain("Partial answer");
      expect(rows()).toContain("Approval denied.");
      expect(transcript.all().map(block => block.kind)).toEqual(["assistant", "notice"]);
      expect(sink.lastTurnFailed).toBe(true);
    },
  );

  it("does not add a success footer or duplicate an already reported failure", () => {
    const { sink, transcript } = build();
    const event = createProviderReadinessCliTerminalEvent({ sessionId: "stopped", prompt: "inspect notes", stopReason: "Refused." });
    if (event.type !== "query.completed") throw new Error("Expected terminal event");
    sink.begin("turn", "inspect notes");
    sink.handleEvent({ ...event, result: { ...event.result, status: "completed", terminalReason: "completed", terminalClassification: "success" } });
    expect(transcript.all()).toHaveLength(0);
    expect(sink.lastTurnFailed).toBe(false);
    sink.handleEvent({ type: "query.failed", error: "Refused." });
    sink.handleEvent(event);
    sink.end();
    expect(transcript.all()).toHaveLength(1);
  });

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
    expect(transcript.render(WIDTH).rows).toEqual([]);
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

describe("fenced diffs in command output", () => {
  const OUTPUT = [
    "### Modified changes",
    "",
    "```diff",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "-const old = 1;",
    "+const next = 2;",
    "```",
  ].join("\n");

  it("renders a diff fence as a diff rather than as literal backticks", () => {
    const { sink, rows } = build();
    sink.begin("command", "/undo");
    for (const line of OUTPUT.split("\n")) sink.line(line);
    sink.end();

    // Intra-line emphasis puts escapes inside the changed span, so the text is
    // only a substring once the styling is stripped.
    const rendered = stripAnsi(rows());
    expect(rendered).not.toContain("```");
    expect(rendered).toContain("const next = 2;");
  });

  it("keeps the prose around the diff", () => {
    const { sink, rows } = build();
    sink.begin("command", "/undo");
    for (const line of OUTPUT.split("\n")) sink.line(line);
    sink.end();

    expect(rows()).toContain("Modified changes");
  });

  it("leaves output with no fence untouched", () => {
    const { sink, rows } = build();
    sink.begin("command", "/workspace");
    sink.line("- Target: /workspace");
    sink.end();

    expect(rows()).toContain("Target: /workspace");
  });
});

describe("out-of-band notices", () => {
  it("records a fact that is not turn output as its own finalized block", () => {
    const { sink, transcript, rows } = build();
    sink.notify("Copied 42 characters.");

    expect(rows()).toContain("Copied 42 characters.");
    expect(transcript.last()?.finalized).toBe(true);
  });

  it("does not open a turn, so the activity row stays quiet", () => {
    const { sink } = build();
    sink.notify("Copied 42 characters.");

    expect(sink.activity()).toBeUndefined();
  });

  it("replaces a recent notice with the same tag in-place instead of creating multiple rows", () => {
    const { sink, transcript, rows } = build();
    sink.notify("Copied 10 characters.", "clipboard");
    sink.notify("Copied 20 characters.", "clipboard");
    sink.notify("Copied 30 characters.", "clipboard");

    expect(rows()).toContain("Copied 30 characters.");
    expect(rows()).not.toContain("Copied 10 characters.");
    expect(rows().split("\n").filter((r) => r.includes("Copied")).length).toBe(1);
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

  it("finalizes everything, so rendering is stable and cacheable", () => {
    const { sink, transcript } = build();
    sink.begin("turn", "turn");
    sink.chunk("streaming");
    expect(transcript.last()?.finalized).toBe(false);
    sink.end();
    expect(transcript.last()?.finalized).toBe(true);
  });
});

describe("what a tool card says it is doing", () => {
  it("shows the command a shell call was given, not just the word bash", () => {
    const { sink, rows } = build();
    sink.handleEvent({
      type: "tool.started",
      toolName: "bash",
      taskId: "t1",
      args: { command: "npm test -- --silent" },
    });
    // The tool's name says a command ran; it does not say which one.
    expect(stripAnsi(rows())).toContain("npm test -- --silent");
  });

  it("shows the path for a read and the pattern for a search", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "read", taskId: "t1", args: { path: "src/index.ts" } });
    sink.handleEvent({
      type: "tool.started",
      toolName: "grep",
      taskId: "t2",
      args: { pattern: "TODO", path: "src" },
    });

    expect(stripAnsi(rows())).toContain("src/index.ts");
    expect(stripAnsi(rows())).toContain("TODO in src");
  });

  it("falls back to the first string argument for a tool it does not know", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "invented", taskId: "t1", args: { target: "somewhere" } });

    expect(rows()).toContain("somewhere");
  });

  it("keeps a call with no arguments legible rather than blank", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "t1" });

    expect(rows()).toContain("bash");
  });

  it("folds a successful call's output behind a row that says how much there is", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "t1", args: { command: "ls" } });
    sink.handleEvent({
      type: "tool.result",
      toolName: "bash",
      taskId: "t1",
      success: true,
      output: "one\ntwo\nthree",
    });

    expect(rows()).toContain("3 lines · click to expand");
    expect(rows()).not.toContain("three");
  });

  it("opens a failed call, because its output is the reason it failed", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "t1", args: { command: "false" } });
    sink.handleEvent({
      type: "tool.result",
      toolName: "bash",
      taskId: "t1",
      success: false,
      failureReason: "exit 1",
      output: "command not found: nope",
    });

    expect(rows()).toContain("command not found: nope");
  });

  it("keeps a pause visible while the call is still waiting", () => {
    const { sink, rows } = build();
    sink.handleEvent({ type: "tool.started", toolName: "write", taskId: "t1", args: { path: "a.ts" } });
    sink.handleEvent({ type: "approval.requested", toolName: "write", taskId: "t1" });

    // Folding this away would hide that the turn is waiting for the user.
    expect(rows()).toContain("awaiting approval");
  });
});

describe("the activity row across a reasoning answer", () => {
  it("stops reading thinking once the answer starts streaming", () => {
    const { sink } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "reasoning.delta", role: "coder", delta: "working it out" } as QueryEvent);
    expect(sink.activity()?.label).toBe("thinking");

    // The answer arrives as deltas, which never travel through the prose path.
    // This used to leave the row reading "thinking" for the whole answer.
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "Here it is" } as QueryEvent);
    expect(sink.activity()?.label).toBe("working");
  });

  it("settles the worked-through block so it stops rendering as live", () => {
    const { sink, transcript } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "reasoning.delta", role: "coder", delta: "working it out" } as QueryEvent);
    sink.handleEvent({ type: "message.delta", role: "coder", delta: "Here it is" } as QueryEvent);

    const thinking = transcript.recent(10).find((block) => block.kind === "thinking");
    expect(thinking?.finalized).toBe(true);
  });
});

describe("a tool card when its call settles", () => {
  it("stops looking busy before its output arrives", () => {
    const { sink, transcript } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "c1", args: {} } as QueryEvent);
    const card = transcript.last();
    expect(card?.kind).toBe("tool");
    expect(card?.status).toBe("running");

    // The call is over; the batch's result messages are not assembled yet.
    sink.handleEvent({ type: "tool.settled", toolName: "bash", taskId: "c1", success: true } as QueryEvent);
    expect(card?.status).toBe("ok");
  });

  it("keeps the card open until the output arrives", () => {
    const { sink, transcript } = build();
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "c1", args: {} } as QueryEvent);
    sink.handleEvent({ type: "tool.settled", toolName: "bash", taskId: "c1", success: true } as QueryEvent);
    const card = transcript.last();
    // Settling must not finalize: the output still has to land on the card.
    expect(card?.finalized).toBe(false);

    sink.handleEvent({
      type: "tool.result",
      toolName: "bash",
      taskId: "c1",
      success: true,
      output: "printed this",
    } as QueryEvent);
    expect(card?.finalized).toBe(true);
    expect(card?.text).toContain("printed this");
  });
});

describe("live output from a running tool", () => {
  it("shows output as it arrives rather than only at the end", () => {
    const transcript = new Transcript();
    let clock = 0;
    const sink = new TurnSink(transcript, () => {}, () => (clock += 200));
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "c1", args: {} } as QueryEvent);
    sink.handleEvent({ type: "tool.output", toolName: "bash", taskId: "c1", chunk: "line one" } as QueryEvent);

    const card = transcript.last();
    expect(card?.status).toBe("running");
    expect(card?.text).toContain("line one");
  });

  it("keeps every chunk even when repaints are rate-limited", () => {
    const transcript = new Transcript();
    let clock = 0;
    let repaints = 0;
    // A clock that does not advance: every chunk after the first is buffered.
    const sink = new TurnSink(transcript, () => { repaints += 1; }, () => clock);
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "c1", args: {} } as QueryEvent);
    const afterStart = repaints;
    for (let index = 0; index < 20; index += 1) {
      sink.handleEvent({ type: "tool.output", toolName: "bash", taskId: "c1", chunk: `c${index}` } as QueryEvent);
    }
    // Repaints were held back — that is the point of the buffer.
    expect(repaints - afterStart).toBeLessThan(20);

    // The result closes the card, which flushes what was still buffered.
    sink.handleEvent({
      type: "tool.result",
      toolName: "bash",
      taskId: "c1",
      success: true,
      // No canonical final body: preserve the buffered stream.
    } as QueryEvent);
    const card = transcript.last();
    // c0 repaints immediately and c19 arrives on the result, so neither would
    // notice a lost buffer. c10 exists only in it: if the flush is gone, it is gone.
    expect(card?.text).toContain("c0");
    expect(card?.text).toContain("c10");
    expect(card?.text).toContain("c19");
    expect(card?.finalized).toBe(true);
  });

  it("bounds the live body so a chatty command cannot push the view over", () => {
    const transcript = new Transcript();
    let clock = 0;
    const sink = new TurnSink(transcript, () => {}, () => (clock += 200));
    sink.begin("turn", "turn");
    sink.handleEvent({ type: "tool.started", toolName: "bash", taskId: "c1", args: {} } as QueryEvent);
    for (let index = 0; index < 200; index += 1) {
      sink.handleEvent({ type: "tool.output", toolName: "bash", taskId: "c1", chunk: `line ${index}` } as QueryEvent);
    }
    const body = transcript.last()?.text ?? "";
    expect(body.split("\n").length).toBeLessThanOrEqual(40);
    // The newest output is what is kept.
    expect(body).toContain("line 199");
  });
});
