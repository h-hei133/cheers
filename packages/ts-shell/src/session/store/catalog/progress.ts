/** A source pulse wakes every subscriber without transferring cancellation ownership. */
export class CatalogProgress {
  revision = 0;
  changed: Promise<void>;
  private release!: () => void;

  constructor() { this.changed = this.pending(); }

  publish(): void {
    const previous = this.release;
    this.revision++;
    this.changed = this.pending();
    previous();
  }

  private pending(): Promise<void> {
    return new Promise(resolve => { this.release = resolve; });
  }
}
