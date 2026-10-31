import { layoutComposer } from "../composer/layout.js";
import { composerStatus } from "../composer/status.js";
import { highlightComposer } from "../composer/projection.js";
import type { ComposerLayout } from "../composer/contract.js";
import { truncateToWidth } from "../text/layout.js";
import { renderHints } from "../chrome/hints.js";
import { renderPendingInput } from "../chrome/pendingInput.js";
import { renderSearchBar } from "../chrome/searchBar.js";
import { renderActivity } from "../transcript/live.js";
import type { InteractiveView, ViewContext } from "./contract.js";
import { MIN_TRANSCRIPT_ROWS, composerRowBudget } from "./budget.js";

/** The bottom rows, composed from the current host facts and draft. */
export interface ChromeLayout {
  readonly rows: string[];
  /** Rows of waiting input drawn directly above the composer. */
  readonly pendingRows: number;
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
  const inputRows = context.overlayInputActive?.() ? 1 : 0;
  const chromeCapacity = Math.max(1, height - MIN_TRANSCRIPT_ROWS);
  const maxComposerRows = Math.min(composerRowBudget(height), Math.max(0, chromeCapacity - inputRows));
  const activityRows = renderActivity(context.activity(), context.now(), width);
  const composerLayout = layoutComposer(
    view.editor,
    { busy, shape: context.composerShape?.() ?? "default", status: composerStatus(context.facts(), context.statusItems(), width) },
    width,
    maxComposerRows,
  );
  const composerRows = highlightComposer(composerLayout, context.composerSelection?.());
  let remaining = chromeCapacity - composerRows.length;
  // Waiting input sits directly above the prompt, where the eye goes after
  // typing: it is the answer to "what did that Enter just do?". It is bounded
  // and yields to everything else, because it is a reminder rather than content.
  const pendingRows = renderPendingInput(context.pendingInput?.() ?? [], width).slice(0, Math.max(0, remaining));
  remaining -= pendingRows.length;
  const hintStatus = context.hintStatus?.();
  const completionStatus = hintStatus?.completion;
  const suggestionRows = view.suggestionsOpen ? view.suggestions.render(width, Math.max(0, remaining - inputRows - Number(!!completionStatus))) : [];
  remaining -= suggestionRows.length;
  // The search bar takes the hint row rather than adding one: an open search is
  // itself the hint, and the composer above it is where the user's text lives, so
  // taking that row instead would lose whatever they had typed.
  const searchBar = context.searchBar?.();
  const hintContext = {
    busy,
    suggesting: view.suggestionsOpen,
    cancelArmed: context.cancelArmed(),
    queued: context.queuedCount(),
    steering: context.steeringCount?.() ?? 0,
    toast: hintStatus?.toast ?? context.toast?.(),
    completionStatus,
  };
  let hints = (searchBar ? renderSearchBar(searchBar, width) : renderHints(hintContext, undefined, width))
    .slice(0, Math.max(0, remaining - inputRows));
  remaining -= hints.length;
  let overlayRows = context.overlayRows(width, height, Math.max(inputRows, remaining - activityRows.length));
  // Rendering decides a pager's form from the actual composer capacity. Only
  // acquire background facts when their row can still be shown. If a fact adds
  // a row, measure again so an inline report cannot overlap the composer.
  if (!searchBar && !hints.length && remaining > inputRows && !context.overlayFullScreen()) {
    hints = renderHints(hintContext, context.ambient(), width);
    remaining -= hints.length;
    if (hints.length) overlayRows = context.overlayRows(width, height, Math.max(inputRows, remaining - activityRows.length));
  }
  const statusRows = [...activityRows, ...overlayRows];
  const visibleStatus = remaining > 0 ? statusRows.slice(-remaining) : [];
  const droppedStatus = statusRows.length - visibleStatus.length;
  // Pending entries sit between the transcript and the prompt, so the composer
  // offset counts them: geometry answered for the composer must be the rows the
  // pointer will actually find it on.
  return {
    rows: [...visibleStatus, ...pendingRows, ...composerRows, ...suggestionRows, ...hints].map(row => truncateToWidth(row, width)),
    pendingRows: pendingRows.length,
    composerOffset: visibleStatus.length + pendingRows.length, composerRows, composerLayout,
    overlayOffset: activityRows.length - droppedStatus, overlayHeight: overlayRows.length, overlayRows, suggestionRows: suggestionRows.length,
  };
}
