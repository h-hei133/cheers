import { render } from "grok-mermaid";
import { defaultTheme } from "../../theme/theme.js";
import { visibleWidth } from "../text/measure.js";

/**
 * Diagrams in the transcript.
 *
 * A `mermaid` fence is a picture the author meant to be looked at, and the
 * terminal cannot show one. The library draws it in box-drawing characters,
 * which is the only rendering every terminal can display: no graphics protocol
 * is assumed, so the same output works over ssh and in a pipe.
 *
 * Three things have to hold for this to be worth having.
 *
 * It must not make streaming slower than it already is. Assistant text is
 * re-rendered from scratch on every delta, so a diagram inside a growing answer
 * would be drawn again for each character — on the main thread, between
 * keystrokes. The cache is what prevents that: a fence whose source has not
 * changed is not drawn twice.
 *
 * It must not become the reason a large answer stalls. The library does real
 * work proportional to the diagram, so the source is bounded before the call
 * rather than after.
 *
 * And it must never make a diagram disappear. Every way this can fail ends with
 * the fenced block rendered as code, which is what the reader would have seen
 * without the feature.
 */

/**
 * How a diagram is shown.
 *
 * Two settings rather than three. The reference has a third that defers drawing
 * until an answer stops arriving, because its parser can hand it an unterminated
 * fence and draw a half-formed diagram. Ours cannot: a fence without its closing
 * line is trimmed before parsing, so there is no half-formed diagram to defer.
 */
export type DiagramMode = "off" | "streaming";

/** The fence language this renders. A user writes it; we do not invent it. */
export const DIAGRAM_LANGUAGE = "mermaid";

/**
 * The largest diagram source worth attempting, in characters.
 *
 * Sized against the library's own cost rather than a guess: a 120-node diagram
 * measures at about 3.5ms, and the text for one is a few kilobytes. This leaves
 * room for a genuinely large diagram while refusing one whose drawing would be
 * felt as a stall.
 */
const MAX_DIAGRAM_CHARS = 16_000;

/** The largest number of lines worth attempting, for the same reason. */
const MAX_DIAGRAM_LINES = 400;

let mode: DiagramMode = "streaming";

/**
 * Set the mode for the process.
 *
 * A module-level setting rather than an argument threaded through every render
 * call, matching how the theme works: the value is chosen once at startup and
 * read wherever rendering happens, and passing it down would put it in the
 * signature of every intermediate function that has nothing to do with it.
 */
export function setDiagramMode(next: DiagramMode): void {
  mode = next;
  // A mode change invalidates nothing cached, but it does change what the cache
  // is for, so it is cleared rather than left to describe a different setting.
  cache.clear();
}

/** The mode currently in effect. */
export function diagramMode(): DiagramMode {
  return mode;
}

/**
 * Drawn diagrams, keyed by the source that produced them.
 *
 * Bounded because the sources are model output: an answer can contain any number
 * of diagrams, and an unbounded map would hold every one of them for the life of
 * the process. Clearing wholesale on overflow is enough — the entries are cheap
 * to recompute and the alternative is a size bookkeeping problem.
 */
const cache = new Map<string, readonly string[]>();
const MAX_CACHED_DIAGRAMS = 64;

/**
 * A diagram as terminal rows, or nothing when it should be shown as code.
 *
 * Nothing is returned for every reason this cannot be drawn — switched off, too
 * large, unparseable, wider than the space it has — because the caller's answer
 * is the same in all of them: render the fenced block. The reasons are not
 * distinguished here because the reader sees the same thing either way; the one
 * case that does deserve a word is a source the library rejects, and that is
 * reported alongside the code.
 */
export function renderDiagram(source: string, cells: number): readonly string[] | undefined {
  if (mode === "off") return undefined;

  const body = source.trimEnd();
  if (!body.trim()) return undefined;
  if (body.length > MAX_DIAGRAM_CHARS) return undefined;
  if (body.split("\n").length > MAX_DIAGRAM_LINES) return undefined;

  // A diagram drawn at its natural width, then refused if it does not fit, would
  // be wasted work on every delta of an answer that can never show it.
  const key = `${cells}\u0000${body}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let art: ReturnType<typeof render>;
  try {
    art = render(body);
  } catch {
    // The library returns nothing for input it cannot parse; this covers a
    // defect in the library itself, which must not take the transcript down.
    return undefined;
  }
  if (!art) return undefined;
  if (art.width > cells) return undefined;

  const rows = art.styled.map((row) =>
    row.map((span) => styleSpan(span)).join(""),
  );

  if (cache.size >= MAX_CACHED_DIAGRAMS) cache.clear();
  cache.set(key, rows);
  return rows;
}

/**
 * One styled run of a diagram row.
 *
 * The classes the library reports are mapped onto the tokens this renderer
 * already reads. An unknown class is shown unstyled rather than dropped: the
 * characters are the diagram, and losing them to an unrecognised label would
 * leave a gap in the picture.
 */
function styleSpan(span: { readonly text: string; readonly cls: string }): string {
  switch (span.cls) {
    case "border":
      return defaultTheme.fg("border", span.text);
    case "text":
      return defaultTheme.fg("text", span.text);
    case "edge":
      return defaultTheme.fg("accent", span.text);
    case "edgeLabel":
      return defaultTheme.fg("muted", span.text);
    case "title":
      return defaultTheme.fg("accent", defaultTheme.bold(span.text));
    default:
      return span.text;
  }
}

/** The visible width of the widest row, for a caller that has to frame it. */
export function diagramWidth(rows: readonly string[]): number {
  return rows.reduce((widest, row) => Math.max(widest, visibleWidth(row)), 0);
}
