/**
 * Scroll position of a window over content that grows at its end.
 *
 * Following the end is the default: a conversation is read at its end, and new
 * output should bring the newest rows into view. An explicit scroll away from
 * the end is a statement that the user is reading something else, and from then
 * on the window keeps its absolute content row — new output must not move it.
 * Scrolling back down to the last row resumes following.
 */
export class ScrollModel {
  private top = 0;
  private contentHeight = 0;
  private viewportHeight = 0;
  private followingEnd = true;

  /** First content row in the window. */
  get scrollTop(): number {
    return this.top;
  }

  /** Whether the window tracks the newest rows. */
  get isFollowingEnd(): boolean {
    return this.followingEnd;
  }

  /** Content and viewport sizes for the next frame; clamps the window to them. */
  updateLayout(contentHeight: number, viewportHeight: number): void {
    this.contentHeight = Math.max(0, Math.floor(contentHeight));
    this.viewportHeight = Math.max(0, Math.floor(viewportHeight));
    const maxTop = this.maxTop();
    this.top = this.followingEnd ? maxTop : Math.max(0, Math.min(this.top, maxTop));
    if (this.top === maxTop) this.followingEnd = true;
  }

  /**
   * Move by `lines` (negative scrolls back), bounded by the content. Returns the
   * part of the request that could not be honoured, so a caller can tell a key
   * that had nowhere to go from one that moved.
   */
  scrollBy(lines: number): number {
    const delta = Number.isFinite(lines) ? Math.trunc(lines) : 0;
    if (delta === 0) return 0;
    const maxTop = this.maxTop();
    const start = this.followingEnd ? maxTop : this.top;
    const next = Math.max(0, Math.min(maxTop, start + delta));
    this.top = next;
    this.followingEnd = next === maxTop;
    return delta - (next - start);
  }

  /** Put content row `top` at the top of the window, clamped into the content. */
  scrollTo(top: number): void {
    const requested = Number.isFinite(top) ? Math.trunc(top) : this.top;
    const maxTop = this.maxTop();
    this.top = Math.max(0, Math.min(maxTop, requested));
    this.followingEnd = this.top === maxTop;
  }

  scrollToStart(): void {
    this.top = 0;
    this.followingEnd = this.contentHeight <= this.viewportHeight;
  }

  scrollToEnd(): void {
    this.top = this.maxTop();
    this.followingEnd = true;
  }

  private maxTop(): number {
    return Math.max(0, this.contentHeight - this.viewportHeight);
  }
}
