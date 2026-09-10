import type { Transcript } from "../transcript/container.js";
import type { ViewComponent } from "./contract.js";

/**
 * The transcript as a component: every rendered row, with the block each came
 * from kept from the last render so a click on a row can reach its block.
 */
export class TranscriptView implements ViewComponent {
  private lastOwners: readonly number[] = [];

  constructor(private readonly transcript: Transcript) {}

  /** For each row of the last render, the index of the block that produced it. */
  get owners(): readonly number[] {
    return this.lastOwners;
  }

  /** Rows the whole transcript occupies at `width`, without rendering them. */
  rowCount(width: number): number {
    return this.transcript.rowCount(Math.max(1, Math.floor(width)));
  }

  invalidate(): void {}

  render(width: number): string[] {
    const rendered = this.transcript.render(Math.max(1, Math.floor(width)));
    this.lastOwners = rendered.owners;
    return [...rendered.rows];
  }
}
