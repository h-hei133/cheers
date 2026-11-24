import { expect, it } from "vitest";
import { concludeRun, TurnProjection } from "./projection.js";
import { Transcript } from '../presentation/tui/transcript/container.js';
import { TurnSink } from '../cli/interactive/turnSink.js';

it.each(['stop', 'error', 'aborted'] as const)('closes assistant display on message_end without claiming %s success', stopReason => {
  const projection = new TurnProjection();
  const message = { role: 'assistant' as const, content: 'partial', stopReason };
  expect(projection.project({ type: 'message_start', message })).toEqual([]);
  expect(projection.project({ type: 'message_end', message })).toEqual([{ type: 'message.finished', role: 'coder' }]);
  // A user message reaching the kernel is a delivery, not a silent no-op: this
  // is the fact a surface draws a user block from.
  expect(projection.project({ type: 'message_end', message: { role: 'user', content: 'q' } }))
    .toEqual([{ type: 'message.delivered', role: 'user', text: 'q' }]);
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

it('preserves a bare nested approval denial as the terminal run outcome', () => {
  expect(concludeRun([
    { role: 'user', content: 'inspect safely' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'script', type: 'function', function: { name: 'codemode', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'script', content: 'Script failed', metadata: { toolStop: 'approval-denied' } },
  ], 'inspect safely', 'sess_script_stop', 1)).toMatchObject({
    kind: 'completed', completed: { result: {
      status: 'stopped_error', terminalClassification: 'stopped',
      stopReason: 'The user denied a nested tool approval and stopped script execution.',
    } },
  });
  expect(concludeRun([
    { role: 'user', content: 'continue after an explained denial' },
    { role: 'tool', tool_call_id: 'script', content: 'denied', metadata: { nestedCalls: { complete: true } } },
    { role: 'assistant', content: 'I will use the permitted alternative.' },
  ], 'continue after an explained denial', 'sess_script_feedback', 1)).toMatchObject({
    completed: { result: { status: 'completed' } },
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

it("carries a tool result's pictures to its card, and only when there are some", () => {
  const projection = new TurnProjection();
  const picture = { type: "image" as const, data: "QUJD", mimeType: "image/png" };
  projection.project({ type: "tool_execution_start", toolCallId: "shot", toolName: "browser", args: {} });
  const [withPicture] = projection.project({ type: "message_end", message: { role: "tool", tool_call_id: "shot",
    content: [{ type: "text", text: "captured" }, picture] } });
  expect(withPicture).toMatchObject({ type: "tool.result", output: "captured", images: [picture] });

  projection.project({ type: "tool_execution_start", toolCallId: "plain", toolName: "bash", args: {} });
  const [withoutPicture] = projection.project({ type: "message_end", message: { role: "tool", tool_call_id: "plain",
    content: "done" } });
  expect(withoutPicture).toMatchObject({ type: "tool.result", output: "done" });
  expect((withoutPicture as { images?: unknown }).images).toBeUndefined();
});

it('keeps a tool-calling assistant out of semantic navigation before its tool starts', () => {
  const projection = new TurnProjection();
  const transcript = new Transcript();
  const sink = new TurnSink(transcript, () => {});
  sink.begin('turn', 'inspect');
  sink.chunk('Inspecting the file.');
  const toolCalls = [{ id: 'read-source', type: 'function' as const, function: { name: 'read', arguments: '{"path":"source.ts"}' } }];
  const finished = projection.project({ type: 'message_end', message: { role: 'assistant', content: 'Inspecting the file.', tool_calls: toolCalls } });
  expect(finished).toEqual([{ type: 'message.finished', role: 'coder', hasToolCalls: true }]);
  for (const event of finished) sink.handleEvent(event);
  const block = transcript.last()!;
  expect(block).toMatchObject({ finalized: true, hasToolCalls: true });
  expect(transcript.render(60).rows.join('')).not.toContain('\x1b]133;A');
  for (const event of projection.project({ type: 'tool_execution_start', toolCallId: 'read-source', toolName: 'read', args: { path: 'source.ts' } })) sink.handleEvent(event);
  sink.handleEvent({ type: 'message.started', role: 'coder' });
  sink.chunk('Completed answer.');
  for (const event of projection.project({ type: 'message_end', message: { role: 'assistant', content: 'Completed answer.' } })) sink.handleEvent(event);
  expect(transcript.render(60).rows.filter(row => /^\x1b\]133;A\x07/.test(row))).toHaveLength(1);
  expect(block.text).toBe('Inspecting the file.');
});
