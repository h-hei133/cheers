import type { QueryEvent } from "../../core/query/runtime/events.js";
import type { CommandReport } from '../../core/commands/report/contract.js';
import { createReport, reportText } from '../../core/commands/report/projection.js';

/**
 * A run's events, written as they happen.
 *
 * One JSON object per line on stdout, so a program driving the CLI reads the run
 * as it unfolds instead of parsing prose meant for a person. Each line carries
 * its own schema version and the claim it does not make: an event stream observes
 * what happened, it never asserts that the work succeeded.
 *
 * Lines are not buffered until the end — a consumer that stops reading at the
 * first line already has everything up to that point.
 */

const SCHEMA_VERSION = "run-event-stream.v1";

/** Output without a model turn, including commands and startup diagnostics. */
export type JsonStreamEvent = QueryEvent | {
  readonly type: "cli.output";
  readonly text: string;
  /** Optional versioned semantics; text remains the compatible complete output. */
  readonly report?: CommandReport;
};

export interface JsonEventStreamLine {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  /** Position in this stream, from 1. */
  readonly order: number;
  /** Stable run correlation, when the event carries one. */
  readonly turnId?: string;
  /** Stable tool-call correlation, when the event carries one. */
  readonly toolCallId?: string;
  readonly eventType: JsonStreamEvent["type"];
  readonly facts: JsonStreamEvent;
  readonly truthfulness: {
    readonly observationOnly: true;
    readonly terminalSuccessClaim: false;
  };
}

/**
 * A writer that numbers the events it is handed.
 *
 * The counter lives here rather than at the call site because the order is the
 * stream's own property: a consumer that sorts by it must see one sequence, not
 * one per producer that happened to be writing.
 */
export function createJsonEventWriter(write: (line: string) => void): (event: JsonStreamEvent) => void {
  let order = 0;
  return (event: JsonStreamEvent): void => {
    // This is an output boundary: derive both representations from one safe
    // snapshot, even when a caller bypasses StreamingRenderer.
    if (event.type === 'cli.output' && event.report) {
      const report = createReport(event.report);
      event = { ...event, report, text: `${reportText(report)}\n` };
    }
    order += 1;
    const turnId = "turn" in event && typeof event.turn === "number" ? `turn:${event.turn}` : undefined;
    const toolCallId = "taskId" in event && typeof event.taskId === "string" ? event.taskId : undefined;
    const line: JsonEventStreamLine = {
      schemaVersion: SCHEMA_VERSION,
      order,
      ...(turnId ? { turnId } : {}),
      ...(toolCallId ? { toolCallId } : {}),
      eventType: event.type,
      facts: event,
      truthfulness: {
        observationOnly: true,
        terminalSuccessClaim: false,
      },
    };
    write(`${JSON.stringify(line)}\n`);
  };
}
