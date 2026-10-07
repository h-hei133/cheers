import type { DraftSnapshot } from "../../../presentation/tui/editor/replacement.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import { catalogRequest, catalogSuggestions, type CatalogKind } from "./request.js";
import type { CatalogProgress, CatalogProgressSink } from './result.js';

interface Options {
  readonly identity: () => string;
  readonly draft: () => DraftSnapshot;
  readonly load: ((kind: CatalogKind, signal: AbortSignal, query?: string, progress?: CatalogProgressSink) => Promise<readonly Suggestion[]>) & {
    invalidate?: () => void;
    observe?: (kind: CatalogKind, query: string | undefined, changed: () => void) => (() => void) | undefined;
  };
  readonly publish: (items: readonly Suggestion[], status?: string) => void;
}
interface Cache { readonly items?: readonly Suggestion[]; readonly error?: string; readonly expires: number }

/** One surface owns requests; neither late results nor another session can populate its menu. */
export class CatalogController {
  private epoch = 0;
  private abort?: AbortController;
  private delay?: ReturnType<typeof setTimeout>;
  private deadline?: ReturnType<typeof setTimeout>;
  private identity = "";
  private readonly cache = new Map<string, Cache>();
  private readonly observers = new Map<string, () => void>();
  private observerEpoch = 0;
  private active?: { key: string; snapshot: DraftSnapshot; identity: string };

  constructor(private readonly options: Options) {}

  cancel(): void {
    this.active = undefined;
    this.epoch++;
    this.abort?.abort();
    this.abort = undefined;
    clearTimeout(this.delay);
    clearTimeout(this.deadline);
  }

  invalidate(): void {
    this.observerEpoch++;
    this.cancel();
    this.cache.clear();
    for (const close of this.observers.values()) close();
    this.observers.clear();
    this.options.load.invalidate?.();
  }

  update(snapshot: DraftSnapshot): boolean {
    this.cancel();
    const request = catalogRequest(snapshot);
    if (!request) return false;
    const identity = this.options.identity();
    if (identity !== this.identity) { this.invalidate(); this.identity = identity; }
    const key = JSON.stringify([request.kind, request.query]);
    this.active = { key, snapshot, identity };
    this.observe(request, key);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      const matches = catalogSuggestions(request, cached.items ?? []);
      this.options.publish(matches, cached.error ?? (matches.length ? undefined : "No matching entries."));
      return true;
    }
    const epoch = this.epoch;
    const abort = new AbortController();
    this.abort = abort;
    this.options.publish(catalogSuggestions(request, []), request.kind === "reference" ? "Loading file references…" : "Loading command entries…");
    this.delay = setTimeout(() => {
      let partial: CatalogProgress | undefined;
      let settled = false;
      const progress: CatalogProgressSink = update => {
        if (settled || abort.signal.aborted || !this.current(epoch, identity, snapshot)) return;
        partial = { items: update.items.slice(0, 5000), status: update.status };
        this.options.publish(catalogSuggestions(request, partial.items), partial.status);
      };
      this.deadline = setTimeout(() => {
        settled = true;
        abort.abort();
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, partial?.items ?? [], partial ? 'Command entries timed out; results are incomplete.'
          : request.kind === "reference" ? "File references timed out." : "Command entries timed out.");
        this.epoch++;
      }, 1500);
      void this.options.load(request.kind, abort.signal, request.query, progress).then(items => {
        settled = true;
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, items.slice(0, 5000), partial?.status);
      }, () => {
        settled = true;
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, partial?.items ?? [], partial ? 'Some command entries are unavailable; results are incomplete.'
          : request.kind === "reference" ? "File references unavailable." : "Command entries unavailable.");
      });
    }, 75);
    return true;
  }

  private observe(request: NonNullable<ReturnType<typeof catalogRequest>>, key: string): void {
    if (this.observers.has(key)) return;
    const generation = this.observerEpoch;
    let disposed = false;
    const close = this.options.load.observe?.(request.kind, request.query, () => {
      if (disposed || generation !== this.observerEpoch) return;
      this.cache.delete(key);
      const active = this.active;
      if (!active || active.key !== key || !this.current(this.epoch, active.identity, active.snapshot)) return;
      this.options.load.invalidate?.();
      this.update(active.snapshot);
    });
    if (!close) return;
    this.observers.set(key, () => { disposed = true; close(); });
    if (this.observers.size > 64) {
      const oldest = this.observers.keys().next().value!;
      this.observers.get(oldest)!(); this.observers.delete(oldest); this.cache.delete(oldest);
    }
  }

  private current(epoch: number, identity: string, snapshot: DraftSnapshot): boolean {
    const current = this.options.draft();
    return this.epoch === epoch && this.options.identity() === identity &&
      current.revision === snapshot.revision && current.cursor === snapshot.cursor && current.text === snapshot.text;
  }

  private finish(request: NonNullable<ReturnType<typeof catalogRequest>>, items: readonly Suggestion[], error?: string): void {
    clearTimeout(this.deadline);
    const key = JSON.stringify([request.kind, request.query]);
    this.cache.delete(key);
    this.cache.set(key, { items, error, expires: Date.now() + (error ? 3000 : 15000) });
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
    const matches = catalogSuggestions(request, items);
    this.options.publish(matches, error ?? (matches.length ? undefined : "No matching entries."));
  }
}
