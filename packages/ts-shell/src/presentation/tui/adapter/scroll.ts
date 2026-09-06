import { Container, type ViewComponent } from "./contract.js";

export type ScrollFollow = "none" | "end";

export interface ScrollOptions {
  readonly follow?: ScrollFollow;
  readonly primary?: boolean;
}

export class ScrollView extends Container {
  private readonly child: ViewComponent;
  readonly followEnd: boolean;
  readonly primary: boolean;
  private scrollTop = 0;
  private contentHeight = 0;
  private viewportHeight = 0;
  private followingEnd: boolean;
  private onRender: (() => void) | undefined;

  constructor(child: ViewComponent, options: ScrollOptions = {}) {
    super();
    this.child = child;
    this.children.push(child);
    this.followEnd = (options.follow ?? "none") === "end";
    this.followingEnd = this.followEnd;
    this.primary = options.primary ?? false;
  }

  get offset(): number {
    return this.scrollTop;
  }

  get following(): boolean {
    return this.followingEnd;
  }

  override addChild(_component: ViewComponent): void {
    throw new Error("ScrollView has exactly one child");
  }

  override removeChild(_component: ViewComponent): void {
    throw new Error("ScrollView child cannot be removed");
  }

  override clear(): void {
    throw new Error("ScrollView child cannot be cleared");
  }

  toStart(): void {
    const changed = this.scrollTop !== 0;
    this.scrollTop = 0;
    this.followingEnd = this.followEnd && this.contentHeight <= this.viewportHeight;
    if (changed) this.onRender?.();
  }

  by(lines: number): number {
    const delta = Number.isFinite(lines) ? Math.trunc(lines) : 0;
    if (delta === 0) return 0;
    const maxTop = Math.max(0, this.contentHeight - this.viewportHeight);
    const start = this.followingEnd ? maxTop : this.scrollTop;
    const next = Math.max(0, Math.min(maxTop, start + delta));
    const moved = next - start;
    this.scrollTop = next;
    this.followingEnd = this.followEnd && next === maxTop;
    if (moved !== 0) this.onRender?.();
    return delta - moved;
  }

  to(top: number): void {
    const requested = Number.isFinite(top) ? Math.trunc(top) : this.scrollTop;
    const maxTop = Math.max(0, this.contentHeight - this.viewportHeight);
    const next = Math.max(0, Math.min(maxTop, requested));
    const following = this.followEnd && next === maxTop;
    if (next === this.scrollTop && following === this.followingEnd) return;
    this.scrollTop = next;
    this.followingEnd = following;
    this.onRender?.();
  }

  layout(contentHeight: number, viewportHeight: number, onRender: () => void): void {
    this.contentHeight = Math.max(0, Math.floor(contentHeight));
    this.viewportHeight = Math.max(0, Math.floor(viewportHeight));
    this.onRender = onRender;
    const maxTop = Math.max(0, this.contentHeight - this.viewportHeight);
    if (this.followingEnd) this.scrollTop = maxTop;
    else this.scrollTop = Math.max(0, Math.min(this.scrollTop, maxTop));
    if (this.followEnd && this.scrollTop === maxTop) this.followingEnd = true;
  }

  override render(width: number): string[] {
    return this.child.render(width);
  }

  visible(width: number, height: number): string[] {
    const lines = this.child.render(Math.max(1, width));
    this.contentHeight = lines.length;
    this.viewportHeight = Math.max(0, height);
    const maxTop = Math.max(0, this.contentHeight - this.viewportHeight);
    if (this.followingEnd) this.scrollTop = maxTop;
    else this.scrollTop = Math.max(0, Math.min(this.scrollTop, maxTop));
    if (height <= 0) return [];
    return lines.slice(this.scrollTop, this.scrollTop + height);
  }
}
