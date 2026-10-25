import { layoutComposer } from "../composer/layout.js";
import { composerStatus } from "../composer/status.js";
import { highlightComposer } from "../composer/projection.js";
import type { ComposerLayout } from "../composer/contract.js";
import { truncateToWidth } from "../text/layout.js";
import { renderHints } from "../chrome/hints.js";
import { renderSearchBar } from "../chrome/searchBar.js";
import { renderActivity } from "../transcript/live.js";
import type { InteractiveView, ViewContext } from "./contract.js";
import { MIN_TRANSCRIPT_ROWS, composerRowBudget } from "./budget.js";

/** The bottom rows, composed from the current host facts and draft. */
export interface ChromeLayout {
  readonly rows: string[];
  readonly composerOffset: number;
  readonly composerRows: string[];
  readonly composerLayout: ComposerLayout;
  readonly overlayOffset: number;
  readonly overlayHeight: number;
  readonly overlayRows: readonly string[];
  readonly suggestionRows: number;
}

/** Activity and overlays share the space left above the composer and hints. */
export function renderChrome(
  context: ViewContext,
  view: Pick<InteractiveView, "editor" | "suggestions" | "suggestionsOpen">,
  width: number,
  height: number,
): ChromeLayout {
  const busy = context.busy();
  const chromeCapacity = Math.max(1, height - MIN_TRANSCRIPT_ROWS);
  const maxComposerRows = composerRowBudget(height);
  const activityRows = renderActivity(context.activity(), context.now(), width);
  const composerLayout = layoutComposer(
    view.editor,
    { busy, shape: context.composerShape?.() ?? "default", status: composerStatus(context.facts(), context.statusItems(), width) },
    width,
    maxComposerRows,
  );
  const composerRows = highlightComposer(composerLayout, context.composerSelection?.());
  let remaining = chromeCapacity - composerRows.length;
  const hintStatus = context.hintStatus?.();
  const completionStatus = hintStatus?.completion;
  const suggestionRows = view.suggestionsOpen ? view.suggestions.render(width, Math.max(0, remaining - Number(!!completionStatus))) : [];
  remaining -= suggestionRows.length;
  // The search bar takes the hint row rather than adding one: an open search is
  // itself the hint, and the composer above it is where the user's text lives, so
  // taking that row instead would lose whatever they had typed.
  const searchBar = context.searchBar?.();
  const hints = (searchBar ? renderSearchBar(searchBar, width) : renderHints(
      {
        busy,
        suggesting: view.suggestionsOpen,
        cancelArmed: context.cancelArmed(),
        queued: context.queuedCount(),
        steering: context.steeringCount?.() ?? 0,
        toast: hintStatus?.toast ?? context.toast?.(),
        completionStatus,
      },
      context.ambient(),
      width,
    )).slice(0, remaining);
  remaining -= hints.length;
  const overlayRows = context.overlayRows(width, height, Math.max(0, remaining - activityRows.length));
  const statusRows = [...activityRows, ...overlayRows];
  const visibleStatus = remaining > 0 ? statusRows.slice(-remaining) : [];
  const droppedStatus = statusRows.length - visibleStatus.length;
  return {
    rows: [...visibleStatus, ...composerRows, ...suggestionRows, ...hints].map(row => truncateToWidth(row, width)),
    composerOffset: visibleStatus.length, composerRows, composerLayout,
    overlayOffset: activityRows.length - droppedStatus, overlayHeight: overlayRows.length, overlayRows, suggestionRows: suggestionRows.length,
  };
}
