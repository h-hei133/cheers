import { textBlock, type Block } from "./blocks.js";

/** Local control output must not take over a running turn's streaming sink. */
export function transcriptLineRenderer(
  transcript: { append(block: Block): unknown },
  scheduler: { requestRender(): void },
  title: string,
): { renderLine(line: string): void } {
  return { renderLine: line => {
    transcript.append(textBlock("command", line, title));
    scheduler.requestRender();
  } };
}
