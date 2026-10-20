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

export interface RendererSinkOptions {
  /**
   * Whether the sink is a transcript host that draws its own turn boundaries.
   * A routing sink such as the line loop forwards prose without owning chrome.
   */
  readonly ownsTranscript?: boolean;
}

export class StreamingRenderer {
  private sink: RendererSink | undefined;
  private transcriptOwner = false;

  /** Route output to `sink`; the returned function restores the previous sink. */
  setSink(sink: RendererSink, options: RendererSinkOptions = {}): () => void {
    const previous = this.sink;
    const previousTranscriptOwner = this.transcriptOwner;
    this.sink = sink;
    this.transcriptOwner = options.ownsTranscript ?? true;
    return () => {
      this.sink = previous;
      this.transcriptOwner = previousTranscriptOwner;
    };
  }

  clearSink(): void {
    this.sink = undefined;
    this.transcriptOwner = false;
  }

  /** Whether output is routed away from the process stdout device. */
  get captured(): boolean {
    return this.sink !== undefined;
  }

  /** Whether the host draws turn chrome itself instead of the plain runtime. */
  get transcriptOwned(): boolean {
    return this.transcriptOwner;
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

  /** Wait until writes already queued on the device have completed. */
  flush(): Promise<void> {
    if (this.sink) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        process.stdout.write("", (error) => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Erase the current line, for hosts that own the cursor themselves. */
  clearLine(): void {
    if (this.sink) return;
    process.stdout.write("\r\x1b[K");
  }
}
