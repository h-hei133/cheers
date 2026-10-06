import type { CommandReport } from '../../core/commands/report/contract.js';
import { createReport, reportText } from '../../core/commands/report/projection.js';

/**
 * Incremental output channel for prose.
 *
 * Command output and turn notices reach the user through this one object, which
 * writes to stdout by default. A full-screen host cannot let that happen: direct
 * writes would land wherever the cursor happens to sit and corrupt a differential
 * frame. Such a host installs a sink instead, and every line and chunk is handed
 * to it verbatim rather than written to the device.
 */

export interface RendererSink {
  /** One complete line, without its trailing newline. */
  line(text: string, report?: CommandReport): void;
  /** A partial chunk of a streaming line, with no newline implied. */
  chunk(text: string): void;
}

export class StreamingRenderer {
  private sink: RendererSink | undefined;

  /** Route output to `sink`; the returned function restores the previous sink. */
  setSink(sink: RendererSink): () => void {
    const previous = this.sink;
    this.sink = sink;
    return () => { this.sink = previous; };
  }

  clearSink(): void {
    this.sink = undefined;
  }

  /** Whether output is currently being captured rather than written to stdout. */
  get captured(): boolean {
    return this.sink !== undefined;
  }

  renderLine(line: string): void {
    if (this.sink) {
      this.sink.line(line);
      return;
    }
    process.stdout.write(`${line}\n`);
  }

  /** Semantic output is retained by TUI sinks; plain sinks receive the same text. */
  renderReport(report: CommandReport): void {
    const snapshot = createReport(report);
    const text = reportText(snapshot);
    if (this.sink) this.sink.line(text, snapshot);
    else this.renderLine(text);
  }

  renderChunk(chunk: string): void {
    if (this.sink) {
      this.sink.chunk(chunk);
      return;
    }
    process.stdout.write(chunk);
  }

  flush(): void {
    // Chunks are written straight through; nothing is buffered here.
  }

  /** Erase the current line, for hosts that own the cursor themselves. */
  clearLine(): void {
    if (this.sink) return;
    process.stdout.write("\r\x1b[K");
  }
}
