import { CURSOR_MARKER } from "../render/paint.js";

export { CURSOR_MARKER };

export type PointerKind = "press" | "release" | "drag" | "move" | "click" | "wheel";

export type PointerButton = "left" | "middle" | "right" | "none";

export interface PointerEvent {
  readonly kind: PointerKind;
  readonly button?: PointerButton;
  readonly x: number;
  readonly y: number;
  readonly screenX: number;
  readonly screenY: number;
  readonly width: number;
  readonly height: number;
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly wheelDelta?: number;
  readonly clickCount?: number;
}

export interface PointerResult {
  readonly handled?: boolean;
  readonly capture?: boolean;
  readonly focus?: boolean;
  readonly render?: boolean;
}

export interface ViewComponent {
  render(width: number): string[];
  handleInput?(data: string): void;
  handlePointer?(event: PointerEvent): PointerResult | undefined;
  wantsKeyRelease?: boolean;
  invalidate(): void;
}

export interface Focusable {
  focused: boolean;
}

export function isFocusable(component: ViewComponent | null): component is ViewComponent & Focusable {
  return component !== null && typeof (component as Partial<Focusable>).focused === "boolean";
}

export class Container implements ViewComponent {
  protected children: ViewComponent[] = [];
  private pointerLayout: { readonly width: number; readonly heights: readonly number[] } | null = null;

  addChild(component: ViewComponent): void {
    this.children.push(component);
    this.pointerLayout = null;
  }

  removeChild(component: ViewComponent): void {
    const index = this.children.indexOf(component);
    if (index !== -1) this.children.splice(index, 1);
    this.pointerLayout = null;
  }

  clear(): void {
    this.children = [];
    this.pointerLayout = null;
  }

  invalidate(): void {
    for (const child of this.children) child.invalidate?.();
  }

  handlePointer(event: PointerEvent): PointerResult | undefined {
    if (event.y < 0 || event.y >= event.height) return undefined;
    const heights = this.childHeights(event.width);
    let childY = 0;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index]!;
      const height = heights[index]!;
      if (event.y >= childY && event.y < childY + height) {
        const result = child.handlePointer?.({
          ...event,
          y: event.y - childY,
          height,
        });
        if (result?.handled || result?.capture || result?.focus) return result;
        return undefined;
      }
      childY += height;
    }
    return undefined;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const heights: number[] = [];
    for (const child of this.children) {
      const childLines = child.render(width);
      heights.push(childLines.length);
      for (const line of childLines) lines.push(line);
    }
    this.pointerLayout = { width, heights };
    return lines;
  }

  /** Child heights at `width`, reusing the last render when it matches. */
  private childHeights(width: number): readonly number[] {
    if (this.pointerLayout?.width === width) return this.pointerLayout.heights;
    return this.children.map((child) => child.render(width).length);
  }
}
