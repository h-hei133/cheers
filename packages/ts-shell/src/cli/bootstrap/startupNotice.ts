import type { StructuredLogger } from "../../observability/structuredLogger.js";
import type { StreamingRenderer } from "../../presentation/terminal/streaming.js";

export interface StartupNoticeRouter {
  setFullScreenHost(fullScreenHost: boolean): void;
  setTranscriptWriter(writer: ((line: string) => void) | undefined): void;
  publish(line: string): void;
}

/**
 * Route startup prose to the surface that owns the first frame.
 *
 * A full-screen host must receive notices through its transcript; writing
 * directly to stdout would land outside the managed frame.
 */
export function createStartupNoticeRouter(input: {
  readonly renderer: Pick<StreamingRenderer, "renderLine">;
  readonly logger: Pick<StructuredLogger, "warn">;
}): StartupNoticeRouter {
  let fullScreenHost = false;
  let transcriptWriter: ((line: string) => void) | undefined;

  return {
    setFullScreenHost(value) {
      fullScreenHost = value;
    },
    setTranscriptWriter(writer) {
      transcriptWriter = writer;
    },
    publish(line) {
      if (!fullScreenHost) {
        input.renderer.renderLine(line);
        return;
      }
      if (transcriptWriter) {
        transcriptWriter(line);
        return;
      }
      try {
        input.logger.warn("Startup notice could not reach the interactive transcript");
      } catch {
        // A missing route is already reflected by the absent transcript line.
      }
    },
  };
}
