import { CURSOR_MARKER } from "../render/paint.js";

export { CURSOR_MARKER };

export type PointerKind = "press" | "release" | "drag" | "wheel";

export interface PointerEvent {
  readonly kind: PointerKind;
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
}

export interface PointerResult {
  readonly handled?: boolean;
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
  return component !== null && "focused" in component;
}

export class Container implements ViewComponent {
  protected children: ViewComponent[] = [];

  addChild(component: ViewComponent): void {
    this.children.push(component);
  }

  removeChild(component: ViewComponent): void {
    const index = this.children.indexOf(component);
    if (index !== -1) this.children.splice(index, 1);
  }

  clear(): void {
    this.children = [];
  }

  invalidate(): void {
    for (const child of this.children) child.invalidate?.();
  }

  handlePointer(event: PointerEvent): PointerResult | undefined {
    if (event.y < 0 || event.y >= event.height) return undefined;
    let childY = 0;
    for (const child of this.children) {
      const height = child.render(event.width).length;
      if (event.y >= childY && event.y < childY + height) {
        const result = child.handlePointer?.({
          ...event,
          y: event.y - childY,
          height,
        });
        if (result?.handled || result?.focus) return result;
        return undefined;
      }
      childY += height;
    }
    return undefined;
  }

  render(width: number): string[] {
    const lines: string[] = [];
    for (const child of this.children) {
      for (const line of child.render(width)) lines.push(line);
    }
    return lines;
  }
}
