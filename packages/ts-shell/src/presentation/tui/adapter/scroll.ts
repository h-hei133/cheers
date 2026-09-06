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
  private currentScrollTop = 0;
  private contentHeight = 0;
  private currentViewportHeight = 0;
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

  get scrollTop(): number {
    return this.currentScrollTop;
  }

  get isFollowingEnd(): boolean {
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

  scrollToStart(): void {
    const changed = this.currentScrollTop !== 0;
    this.currentScrollTop = 0;
    this.followingEnd = this.followEnd && this.contentHeight <= this.currentViewportHeight;
    if (changed) this.onRender?.();
  }

  scrollToEnd(): void {
    const maxTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const following = this.followEnd;
    if (this.currentScrollTop === maxTop && this.followingEnd === following) return;
    this.currentScrollTop = maxTop;
    this.followingEnd = following;
    this.onRender?.();
  }

  scrollBy(lines: number): number {
    const delta = Number.isFinite(lines) ? Math.trunc(lines) : 0;
    if (delta === 0) return 0;
    const maxTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const start = this.followingEnd ? maxTop : this.currentScrollTop;
    const next = Math.max(0, Math.min(maxTop, start + delta));
    const moved = next - start;
    this.currentScrollTop = next;
    this.followingEnd = this.followEnd && next === maxTop;
    if (moved !== 0) this.onRender?.();
    return delta - moved;
  }

  scrollTo(top: number): void {
    const requested = Number.isFinite(top) ? Math.trunc(top) : this.currentScrollTop;
    const maxTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    const next = Math.max(0, Math.min(maxTop, requested));
    const following = this.followEnd && next === maxTop;
    if (next === this.currentScrollTop && following === this.followingEnd) return;
    this.currentScrollTop = next;
    this.followingEnd = following;
    this.onRender?.();
  }

  updateLayout(contentHeight: number, viewportHeight: number, onRender: () => void): void {
    this.contentHeight = Math.max(0, Math.floor(contentHeight));
    this.currentViewportHeight = Math.max(0, Math.floor(viewportHeight));
    this.onRender = onRender;
    const maxTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    if (this.followingEnd) this.currentScrollTop = maxTop;
    else this.currentScrollTop = Math.max(0, Math.min(this.currentScrollTop, maxTop));
    if (this.followEnd && this.currentScrollTop === maxTop) this.followingEnd = true;
  }

  override render(width: number): string[] {
    return this.child.render(width);
  }

  visible(width: number, height: number): string[] {
    const lines = this.child.render(Math.max(1, width));
    this.contentHeight = lines.length;
    this.currentViewportHeight = Math.max(0, height);
    const maxTop = Math.max(0, this.contentHeight - this.currentViewportHeight);
    if (this.followingEnd) this.currentScrollTop = maxTop;
    else this.currentScrollTop = Math.max(0, Math.min(this.currentScrollTop, maxTop));
    if (height <= 0) return [];
    return lines.slice(this.currentScrollTop, this.currentScrollTop + height);
  }
}
