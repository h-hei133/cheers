import { ComposedView } from "../../presentation/tui/adapter/view.js";
import type { TerminalFramePlan, TerminalFrameProvider, ViewportSize } from "../../presentation/tui/render/frame.js";
import { createViewState, type InteractiveView, type ViewContext, type ViewState } from "../../presentation/tui/view.js";
import { InteractiveSurface } from "./frameSurface.js";
import { DEFAULT_SURFACE, type SurfaceChoice } from "./tuiSettings.js";

export { DEFAULT_SURFACE, readSurfaceChoice, type SurfaceChoice } from "./tuiSettings.js";

/**
 * The one place a surface is chosen.
 *
 * Both surfaces take the same facts and the same host-owned state, so the host
 * can build either — and rebuild the default over the same state if the other
 * fails — without any part of it knowing which one is on screen.
 */

export const createView: ViewFactory = (choice, context, state) =>
  choice === "composed" ? new ComposedView(context, state) : new InteractiveSurface(context, state);

// The factory takes the choice as its first argument so the host can rebuild the
// default over the same state; the signature is widened here once.
export type ViewFactory = (choice: SurfaceChoice, context: ViewContext, state: ViewState) => InteractiveView;

export interface ViewHostOptions {
  readonly choice: SurfaceChoice;
  readonly context: ViewContext;
  readonly state?: ViewState;
  /** Builds a view for a choice; injectable so a test can hand in one that fails. */
  readonly factory?: ViewFactory;
  /** Called once when the chosen surface failed to paint and the default took over. */
  readonly onFallback?: (error: unknown, from: SurfaceChoice) => void;
}

/**
 * Holds the surface on screen and the state it projects.
 *
 * The engine asks this for frames, not the view, so a surface that throws while
 * composing is replaced by the default over the same state before the frame is
 * answered — the session keeps its transcript and draft, loses only the failed
 * surface's own scroll position, and never shows a half-switched screen. The
 * default surface gets no such net: a failure there is a defect to surface, not
 * something to paper over.
 */
export class ViewHost implements TerminalFrameProvider {
  readonly state: ViewState;
  private view: InteractiveView;
  private choice: SurfaceChoice;

  constructor(private readonly options: ViewHostOptions) {
    this.state = options.state ?? createViewState();
    this.choice = options.choice;
    this.view = this.build(this.choice);
  }

  /** The surface currently on screen. Read it per use: a fallback swaps it. */
  get current(): InteractiveView {
    return this.view;
  }

  get surface(): SurfaceChoice {
    return this.choice;
  }

  renderFrame(dimensions: ViewportSize): TerminalFramePlan {
    try {
      return this.view.renderFrame(dimensions);
    } catch (error) {
      if (this.choice === DEFAULT_SURFACE) throw error;
      const from = this.choice;
      this.choice = DEFAULT_SURFACE;
      this.view = this.build(DEFAULT_SURFACE);
      this.options.onFallback?.(error, from);
      return this.view.renderFrame(dimensions);
    }
  }

  private build(choice: SurfaceChoice): InteractiveView {
    return (this.options.factory ?? createView)(choice, this.options.context, this.state);
  }
}
