import { describe, expect, it } from "vitest";
import { createJsonEventWriter, type JsonStreamEvent } from "./jsonEvents.js";
import type { CommandReport } from '../../core/commands/report/contract.js';
import { reportText } from '../../core/commands/report/projection.js';

/**
 * The shape of the event stream, which is a published contract.
 *
 * A consumer reads these lines to follow a run, so a field it depends on
 * disappearing or changing meaning is a breaking change. That makes the version
 * string and the per-event payload worth pinning: they are what a reader branches
 * on, and nothing else in the codebase asserts them.
 */

/**
 * One emitted line, read without assuming its shape.
 *
 * `JSON.parse` is untyped, so the result is taken as an unknown object and every
 * field is narrowed before use. Reading a field by casting would compile whatever
 * the assertion said and report nothing when the stream stopped matching it —
 * which is the failure this file exists to catch.
 */
function readLine(line: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(line);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`a stream line was not an object: ${line}`);
  }
  return parsed as Record<string, unknown>;
}

/** A field that must be an object, or a failure naming what was missing. */
function asObject(value: unknown, what: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} was not an object`);
  }
  return value as Record<string, unknown>;
}

function collect(): { readonly lines: string[]; readonly write: (event: JsonStreamEvent) => void } {
  const lines: string[] = [];
  return { lines, write: createJsonEventWriter((line) => lines.push(line)) };
}

describe("the event stream line", () => {
  it('carries safe report facts and derives compatible text from the same snapshot', () => {
    const { lines, write } = collect();
    const report: CommandReport = { version: 1, title: '\x1b[31mInventory\x1b[0m',
      columns: [{ label: 'Value', minWidth: 8, align: 'right' }],
      lines: [{ kind: 'columns', cells: [[{ text: 'unknown\x1b]0;title\x07', role: 'warning' }]] }],
      facts: { status: 'unavailable', clean: null, count: 0, label: '\x1b[31mred\x1b[0m', source: 'fixture\tvalue' } };
    write({ type: 'cli.output', text: 'stale output must not win', report });
    write({ type: 'cli.output', text: 'next\n' });
    const first = readLine(lines[0]!);
    const facts = asObject(first.facts, 'facts');
    const semantic = facts.report as CommandReport;
    expect(semantic.version).toBe(1);
    expect(semantic.title).toBe('Inventory');
    expect(semantic.facts).toEqual({ status: 'unavailable', clean: null, count: 0, label: 'red', source: 'fixture\\u0009value' });
    expect(semantic.lines).toEqual([{ kind: 'columns', cells: [[{ text: 'unknown', role: 'warning' }]] }]);
    expect(facts.text).toBe(`${reportText(semantic)}\n`);
    expect(JSON.stringify(facts)).not.toMatch(/\\u001b|\x1b/i);
    expect(first.truthfulness).toEqual({ observationOnly: true, terminalSuccessClaim: false });
    expect(readLine(lines[1]!)).toMatchObject({ order: 2, facts: { text: 'next\n' } });
    expect(asObject(readLine(lines[1]!).facts, 'facts')).not.toHaveProperty('report');
  });
  it("preserves command text without promoting it to a success claim", () => {
    const { lines, write } = collect();
    write({ type: "cli.output", text: 'line one\n"line two"\n' });
    write({ type: "query.started", sessionId: "s", prompt: "hello" });
    expect(readLine(lines[0]!)).toMatchObject({
      order: 1, eventType: "cli.output", facts: { text: 'line one\n"line two"\n' },
      truthfulness: { observationOnly: true, terminalSuccessClaim: false },
    });
    expect(readLine(lines[1]!).order).toBe(2);
    expect(lines[0]!.split("\n")).toHaveLength(2);
  });
  it("carries a version, a position, and the fact itself", () => {
    const { lines, write } = collect();
    write({ type: "query.started", sessionId: "s1", prompt: "hi" });

    const parsed = readLine(lines[0]!);
    expect(parsed.schemaVersion).toBe("run-event-stream.v1");
    expect(parsed.order).toBe(1);
    expect(parsed.eventType).toBe("query.started");
    expect(asObject(parsed.facts, "facts")).toMatchObject({ sessionId: "s1", prompt: "hi" });
  });

  it("derives stable turn and tool-call correlation fields when events carry them", () => {
    const { lines, write } = collect();
    write({ type: "turn.started", role: "assistant", turn: 3 });
    write({ type: "tool.started", toolName: "read", taskId: "call-7" });

    expect(readLine(lines[0]!).turnId).toBe("turn:3");
    expect(readLine(lines[1]!).toolCallId).toBe("call-7");
  });

  it("never claims the work succeeded", () => {
    // The stream reports what was observed. A consumer deciding whether a task
    // finished has to reach that conclusion from the events, not from a flag here
    // that would make it true by assertion.
    const { lines, write } = collect();
    write({ type: "query.started", sessionId: "s1", prompt: "hi" });

    expect(asObject(readLine(lines[0]!).truthfulness, "truthfulness")).toEqual({
      observationOnly: true,
      terminalSuccessClaim: false,
    });
  });

  it("counts positions from one across the run", () => {
    const { lines, write } = collect();
    write({ type: "query.started", sessionId: "s1", prompt: "a" });
    write({ type: "query.started", sessionId: "s1", prompt: "b" });

    expect(lines.map((line) => readLine(line).order)).toEqual([1, 2]);
  });

  it("passes the session path through when the emitter knows it", () => {
    // Added so a consumer can find the transcript without reconstructing the
    // directory layout, which would make that layout part of the contract by
    // accident.
    const { lines, write } = collect();
    write({
      type: "query.started",
      sessionId: "s1",
      prompt: "hi",
      sessionPath: "/home/u/.cheers/sessions/s1",
    });

    expect(asObject(readLine(lines[0]!).facts, "facts").sessionPath).toBe("/home/u/.cheers/sessions/s1");
  });

  it("leaves the session path out when there is none to report", () => {
    // Optional rather than always present: a session whose files are not where the
    // default layout says has nothing true to report, and an empty string would
    // read as a path.
    const { lines, write } = collect();
    write({ type: "query.started", sessionId: "s1", prompt: "hi" });

    const facts = asObject(readLine(lines[0]!).facts, "facts");
    expect(Object.prototype.hasOwnProperty.call(facts, "sessionPath")).toBe(false);
  });
});
