import type { DraftSnapshot } from "../../../presentation/tui/editor/replacement.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";
import { catalogRequest, catalogSuggestions, type CatalogKind } from "./request.js";

interface Options {
  readonly identity: () => string;
  readonly draft: () => DraftSnapshot;
  readonly load: ((kind: CatalogKind, signal: AbortSignal, query?: string) => Promise<readonly Suggestion[]>) & { invalidate?: () => void };
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

  constructor(private readonly options: Options) {}

  cancel(): void {
    this.epoch++;
    this.abort?.abort();
    this.abort = undefined;
    clearTimeout(this.delay);
    clearTimeout(this.deadline);
  }

  invalidate(): void {
    this.cancel();
    this.cache.clear();
    this.options.load.invalidate?.();
  }

  update(snapshot: DraftSnapshot): boolean {
    this.cancel();
    const request = catalogRequest(snapshot);
    if (!request) return false;
    const identity = this.options.identity();
    if (identity !== this.identity) { this.cache.clear(); this.identity = identity; }
    const cached = this.cache.get(JSON.stringify([request.kind, request.query]));
    if (cached && cached.expires > Date.now()) {
      const matches = catalogSuggestions(request, cached.items ?? []);
      this.options.publish(matches, cached.error ?? (matches.length ? undefined : "No matching entries."));
      return true;
    }
    const epoch = this.epoch;
    const abort = new AbortController();
    this.abort = abort;
    this.options.publish(catalogSuggestions(request, []), "Loading command entries…");
    this.delay = setTimeout(() => {
      this.deadline = setTimeout(() => {
        abort.abort();
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, [], "Command entries timed out.");
        this.epoch++;
      }, 1500);
      void this.options.load(request.kind, abort.signal, request.query).then(items => {
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, items.slice(0, 5000));
      }, () => {
        if (!this.current(epoch, identity, snapshot)) return;
        this.finish(request, [], "Command entries unavailable.");
      });
    }, 75);
    return true;
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
