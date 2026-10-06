import type { Editor } from "../editor.js";
import { truncateToWidth } from "../text/layout.js";
import type { ComposerLayout, ComposerLayoutRow, ComposerShapeId, ComposerState } from "./contract.js";
import { bottomChrome, composerChrome, composerFrame, topChrome } from "./frame.js";
import { contentRow, hasCursorTail, scrollbarRows } from "./row.js";
import { COMPOSER_SHAPES } from "./shapes.js";

/** The editor uses the same content width as the chosen shape's cell mapping. */
export function composerTextWidth(width: number, shape: ComposerShapeId = "default", scrolling = false): number {
  return composerFrame(width, COMPOSER_SHAPES[shape], scrolling).text;
}

/** One editor viewport supplies every shape, its source map and scrollbar. */
export function layoutComposer(editor: Editor, state: ComposerState, width: number, maxRows?: number): ComposerLayout {
  const shape = COMPOSER_SHAPES[state.shape ?? "default"];
  let frame = composerFrame(width, shape, false);
  // Start with the optional bottom reserved. Removing it can only reveal rows
  // after the caret, so an unchanged EOL frame cannot alternate its geometry.
  let chrome = composerChrome(shape, state, frame.width, maxRows, shape.bottom === "merge");
  if (shape.bottom === "merge" || shape.side === "rail") {
    const preview = editor.layout(frame.text, chrome.contentRows, { preview: true });
    const last = preview.rows.at(-1);
    if (shape.bottom === "merge" && last && !hasCursorTail(last, preview.source)) {
      chrome = composerChrome(shape, state, frame.width, maxRows, false);
    }
    if (shape.side === "rail" && preview.totalRows > preview.rows.length) {
      frame = composerFrame(width, shape, true);
    }
  }
  const source = editor.layout(frame.text, chrome.contentRows);
  const rows: ComposerLayoutRow[] = [];
  if (source.rows.length > 0) {
    if (chrome.top) rows.push({ kind: "decoration", screenRow: rows.length, rendered: topChrome(shape, state, frame.width) });
    const thumb = scrollbarRows(source, shape, frame);
    for (let index = 0; index < source.rows.length; index++) {
      rows.push(contentRow(source.rows[index]!, source.source, shape, frame, state, rows.length, index === 0, index === source.rows.length - 1, thumb.has(index)));
    }
    if (chrome.bottom) rows.push({ kind: "decoration", screenRow: rows.length, rendered: bottomChrome(shape, frame.width) });
    if (chrome.gap) rows.push({ kind: "decoration", screenRow: rows.length, rendered: "" });
    if (chrome.footer) rows.push({ kind: "decoration", screenRow: rows.length, rendered: truncateToWidth(chrome.footer, frame.width) });
  }
  return {
    shape: shape.id,
    source: source.source, sourceRevision: source.sourceRevision, viewportStart: source.viewportStart,
    width: frame.width, rows, height: rows.length,
  };
}
