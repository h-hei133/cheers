import type { TerminalDevice } from "../terminal.js";
import type { TerminalFrameProvider, TuiStartOptions } from "../render/frame.js";
import { TUI } from "../render/engine.js";
import { Container, type ViewComponent } from "./contract.js";
import { OverlayStack, type OverlayHandle, type OverlayOptions } from "./overlay.js";
import { ScrollView, type ScrollOptions } from "./scroll.js";

export interface SurfaceOptions {
  readonly terminal?: TerminalDevice;
  readonly deferInput?: boolean;
}

export class Surface extends Container {
  private readonly engine: TUI;
  private readonly overlays = new OverlayStack();
  private focused: ViewComponent | null = null;

  constructor(options: SurfaceOptions = {}) {
    super();
    this.engine = new TUI(options.terminal);
    void options.deferInput;
  }

  setFrameProvider(provider: TerminalFrameProvider | undefined): void {
    this.engine.setFrameProvider(
      provider === undefined
        ? undefined
        : {
            renderFrame: (dimensions) => {
              const plan = provider.renderFrame(dimensions);
              return {
                rows: this.overlays.composite([...plan.rows], dimensions.columns, dimensions.rows),
              };
            },
          },
    );
  }

  scroll(child: ViewComponent, options?: ScrollOptions): ScrollView {
    return new ScrollView(child, options);
  }

  showOverlay(component: ViewComponent, options?: OverlayOptions): OverlayHandle {
    const previous = this.focused;
    if (previous !== null) this.focused = component;
    const handle = this.overlays.show(component, options);
    const stack = this;
    return {
      hide() {
        handle.hide();
        if (stack.focused === component) stack.focused = previous;
        stack.engine.requestRender();
      },
      setHidden(hidden: boolean) {
        handle.setHidden(hidden);
        stack.engine.requestRender();
      },
      isHidden: () => handle.isHidden(),
      focus() {
        handle.focus();
        stack.focused = component;
        stack.engine.requestRender();
      },
      unfocus() {
        handle.unfocus();
        stack.focused = previous;
        stack.engine.requestRender();
      },
      isFocused: () => handle.isFocused(),
    };
  }

  setFocus(component: ViewComponent | null): void {
    this.focused = component;
  }

  get focus(): ViewComponent | null {
    return this.focused;
  }

  get overlayCount(): number {
    return this.overlays.count;
  }

  onInput(listener: (data: string) => void): () => void {
    return this.engine.onInput((data) => {
      this.focused?.handleInput?.(data);
      listener(data);
    });
  }

  start(options?: TuiStartOptions): void {
    this.engine.start(options);
  }

  stop(): void {
    this.engine.stop();
  }

  requestRender(options?: { readonly force?: boolean }): void {
    this.engine.requestRender(options);
  }

  renderNow(): void {
    this.engine.renderNow();
  }

  screenRows(): readonly string[] {
    return this.engine.screenRows();
  }
}
