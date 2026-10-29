import { expect, it } from "vitest";
import { concludeRun, TurnProjection } from "./projection.js";

it.each(['stop', 'error', 'aborted'] as const)('closes assistant display on message_end without claiming %s success', stopReason => {
  const projection = new TurnProjection();
  const message = { role: 'assistant' as const, content: 'partial', stopReason };
  expect(projection.project({ type: 'message_start', message })).toEqual([]);
  expect(projection.project({ type: 'message_end', message })).toEqual([{ type: 'message.finished', role: 'coder' }]);
  expect(projection.project({ type: 'message_end', message: { role: 'user', content: 'q' } })).toEqual([]);
});

it.each(['', ' \n\t'])('does not count an unanswered assistant as successful: %j', content => {
  const outcome = concludeRun([{ role: 'assistant', content, errorMessage: 'No answer followed.', stopReason: 'stop' }],
    'question', 'silent', 1);
  expect(outcome).toMatchObject({ kind: 'completed', finalOutput: 'No answer followed.', explained: true,
    completed: { result: { status: 'stopped_error', terminalClassification: 'stopped', stopReason: 'No answer followed.' } } });
});

it('preserves an explicit step limit and the whitespace of a nonempty answer', () => {
  expect(concludeRun([{ role: 'assistant', content: '', stopReason: 'stop' }], 'q', 'limited', 1, true))
    .toMatchObject({ completed: { result: { status: 'stopped_max_turns', terminalClassification: 'stopped' } } });
  expect(concludeRun([{ role: 'assistant', content: '  Answer\n', stopReason: 'stop' }], 'q', 'answered', 1))
    .toMatchObject({ finalOutput: '  Answer\n', explained: false, completed: { result: { status: 'completed' } } });
});

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
