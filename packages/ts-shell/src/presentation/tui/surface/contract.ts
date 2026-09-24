import { Editor } from "../editor.js";
import { PasteStore } from "../pastes.js";
import type { AmbientContext } from "../chrome/hints.js";
import type { StatusFacts, StatusItemId } from "../chrome/items.js";
import { SuggestionList } from "../chrome/suggestions.js";
import type { TerminalFrameProvider } from "../render/frame.js";
import type { Block } from "../transcript/blocks.js";
import { Transcript } from "../transcript/container.js";
import type { TurnActivity } from "../transcript/live.js";
import type { SelectionPoint, SelectionSpan } from "../transcript/selection.js";
import type { ScrollbarGeometry } from "../transcript/viewport.js";

/**
 * The seam between the interactive host and its stateful presentation surface.
 *
 * The host owns lifecycle, business actions, and input decisions. The surface
 * owns the presentation model used to compose rows and answer geometry queries;
 * its mutable transcript, editor, paste, suggestion, and scroll state are kept
 * together so the view and pointer coordinates cannot drift apart.
 */

/** Models the host owns and every view projects. */
export interface ViewState {
  readonly transcript: Transcript;
  readonly editor: Editor;
  /**
   * Long pastes held aside behind placeholders. Lives with the editor because the
   * draft on screen and the text that will be sent are the same object's two
   * readings, and nothing else should have to know they differ.
   */
  readonly pastes: PasteStore;
  readonly suggestions: SuggestionList;
}

export function createViewState(): ViewState {
  return {
    transcript: new Transcript(),
    editor: new Editor(),
    pastes: new PasteStore(),
    suggestions: new SuggestionList(),
  };
}

/** Facts read at paint time. Thunks, so a view never holds a stale copy. */
export interface ViewContext {
  facts(): StatusFacts;
  statusItems(): readonly StatusItemId[];
  activity(): TurnActivity | undefined;
  busy(): boolean;
  /** Prompts waiting to run after the current turn. */
  queuedCount(): number;
  /** Prompts waiting to be steered into the current turn before its next step. */
  steeringCount?(): number;
  now(): number;
  /** Background facts for the row under the prompt. */
  ambient(): AmbientContext;
  /** Key that inserts a newline on this terminal. */
  newlineKey(): string;
  /** True while a second cancel press would exit. */
  cancelArmed(): boolean;
  /** True when an open picker or reader wants the whole screen. */
  overlayFullScreen(): boolean;
  /** Rows for an open picker, or none when none is open. */
  overlayRows(width: number, height: number): string[];
  /** Cells the pointer is currently covering, or none when it is not dragging. */
  selection(): SelectionSpan | undefined;
  /** Transient status notification (e.g. clipboard copy feedback). */
  toast?(): string | undefined;
  /** Active mouse selection within the composer / input box. */
  composerSelection?(): SelectionSpan | undefined;
  /** What an open search should show in the bar, or nothing when none is open. */
  searchBar?(): { readonly query: string; readonly matchCount: number; readonly currentNumber: number } | undefined;
  /** Style the matches in one rendered row of the transcript. */
  highlightSearchMatches?(row: string, contentRow: number): string;
}

/** What the host does in response to input. Routed by the keymap and the pointer. */
export interface ViewActions {
  /**
   * Submit the current draft. While a turn runs the disposition says where the
   * text goes: steered into the running turn before its next model step, or
   * queued to run after it. Idle submissions carry none and simply run.
   */
  submit(text: string, disposition?: "steer" | "followUp"): void;
  /** Escape while a turn is running. */
  interrupt(): void;
  /** Leave the session. */
  exit(): void;
  /** Repaint after a state change. */
  redraw(): void;
  /** Clear the visible transcript and the terminal's scrollback. */
  clearScreen(): void;
  /**
   * Schedule a repaint after `delayMs`. Used for hints that expire on a clock
   * rather than on an event: without it, "press again to exit" stays on screen
   * after the press would no longer exit.
   */
  redrawAfter(delayMs: number): void;
  /** Cycle the agent mode between planning and building. */
  cycleAgentMode(): void;
  /** Cycle how much a turn may do without asking. */
  cyclePermissionScope(): void;
  /** Move the transcript window; negative scrolls back. */
  scroll(rows: number): void;
  /** Move the transcript window by whole screens. */
  scrollPage(direction: -1 | 1): void;
  /** Jump to the newest rows. */
  scrollToEnd(): void;
  retry(): void;
  /** Offer an earlier point in the conversation to go back to. */
  openRewind(): void;
  /**
   * Open the transcript search.
   *
   * An action rather than a view method because opening it is not a change to the
   * view's own state: whoever receives keys has to start capturing them, and that
   * is the mode, not the surface.
   */
  openSearch(): void;
  /**
   * Recompute completions for the current draft. `mayOpen` is true only for the
   * gestures that should be able to *open* the list — typing and Tab. Every other
   * draft change may refine an open list but must never pop one up, or the list
   * steals the arrow keys from prompt-history recall.
   */
  syncSuggestions(mayOpen: boolean): void;
  /** Copy active mouse selection to clipboard and clear highlight. Returns true if copied. */
  copySelection?(): boolean;
  /** Collapse or expand the reasoning blocks, or the tool output. */
  toggleCollapsed(only: "thinking" | "tool"): void;
  /**
   * Hand the draft to an editor outside the terminal.
   *
   * Optional because only a surface that owns the terminal can release it, and a
   * caller that cannot must leave the key unclaimed rather than pretend.
   */
  openExternalEditor?(): void;
}

/**
 * A surface: composes the frame from host-owned state and answers questions
 * about the geometry of what it last composed.
 */
export interface InteractiveView extends TerminalFrameProvider {
  readonly transcript: Transcript;
  readonly editor: Editor;
  readonly pastes: PasteStore;
  readonly suggestions: SuggestionList;
  /** Whether the completion list is currently intercepting navigation keys. */
  readonly suggestionsOpen: boolean;
  setSuggesting(open: boolean): void;
  /** How far back the window is, in rows; 0 means it is following the newest. */
  readonly scrolledBack: number;
  /** Move the window by `rows` (negative scrolls back). Returns whether it moved. */
  scroll(rows: number): boolean;
  /** Scroll by whole screens, for PageUp and PageDown. */
  scrollPage(direction: -1 | 1): boolean;
  /** Jump to the newest rows, which is also what any new output implies. */
  scrollToEnd(): void;
  /**
   * Open the transcript search.
   *
   * An action rather than a view method because opening it is not a change to the
   * view's own state: whoever receives keys has to start capturing them, and that
   * is the mode, not the surface.
   */
  openSearch?(): void;
  /** Where the scrollbar was last drawn, or nothing when the content fit. */
  scrollbarGeometry(): ScrollbarGeometry | undefined;
  /** Move the window so the thumb's grab point sits on `pointerRow`. Returns whether it moved. */
  scrollToThumb(pointerRow: number, grabOffset?: number): boolean;
  /** Map a screen cell to a content cell in the full transcript. */
  screenToContent(row: number, column: number): SelectionPoint;
  /** A content-space selection on the current screen rows, or nothing when off screen. */
  contentToScreenSpan(span: SelectionSpan): SelectionSpan | undefined;
  /** Rendered rows of the full transcript at the last width, for selection copying. */
  contentRows(): readonly string[];
  /** The block under screen row `row`, for a click that lands on the transcript. */
  blockAtScreenRow(row: number): Block | undefined;
  /**
   * Collapse or expand the collapsible blocks on screen, and report whether any
   * changed.
   *
   * `only` narrows it to one block kind, which is what the two keys are for:
   * reasoning and tool output are read at different times, so one key that
   * toggled both would make each press undo the other's state.
   */
  toggleCollapsed(only?: "thinking" | "tool"): boolean;
  /** Screen row bounds and visual rows of the composer, for mouse drag selection. */
  composerGeometry?(): ComposerGeometry | undefined;
  /**
   * What the search bar should show, or nothing when no search is open.
   *
   * The surface renders it rather than owning it: the query and the position belong
   * to whoever receives the keys, and a second copy here could disagree with it.
   */
  searchBar?(): { readonly query: string; readonly matchCount: number; readonly currentNumber: number } | undefined;
  /**
   * Highlight the current search's matches in a rendered row.
   *
   * Applied by the pane, which is where the transcript rows are assembled — the
   * one point that sees a row before it is painted and after it is complete.
   */
  highlightSearchMatches?(row: string, contentRow: number): string;
  /**
   * Scroll so a content row is visible.
   *
   * Absent before this feature: the pane could scroll by a delta or to the end,
   * neither of which can put a particular row on screen. Cycling between matches
   * needs exactly that, or the user is told match 3 exists with no way to see it.
   */
  scrollToContentRow?(row: number): boolean;
}

export interface ComposerGeometry {
  readonly top: number;
  readonly bottom: number;
  readonly rows: readonly string[];
}
