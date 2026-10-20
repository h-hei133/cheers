import { expect, it } from "vitest";
import { concludeRun } from "./projection.js";

it("does not report a completed turn after the newest tool failed", () => {
  const outcome = concludeRun([
    { role: "user", content: "run the command" },
    { role: "tool", tool_call_id: "call-1", content: "command failed", metadata: { status: "failed" } },
    { role: "assistant", content: "The command failed." },
  ], "run the command", "sess_failed", 1);

  expect(outcome).toMatchObject({
    kind: "completed",
    completed: {
      result: {
        status: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "command failed",
      },
    },
  });
});

it("does not let an older failure override a newer successful tool", () => {
  const outcome = concludeRun([
    { role: "user", content: "recover" },
    { role: "tool", tool_call_id: "call-1", content: "old failure", metadata: { status: "failed" } },
    { role: "tool", tool_call_id: "call-2", content: "new success", metadata: { status: "completed" } },
    { role: "assistant", content: "Recovered." },
  ], "recover", "sess_recovered", 1);

  expect(outcome).toMatchObject({
    kind: "completed",
    completed: { result: { terminalClassification: "success" } },
  });
});
