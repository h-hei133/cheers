import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogController } from "./controller.js";
import { catalogRequest } from "./request.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

afterEach(() => vi.useRealTimers());
function harness() {
  vi.useFakeTimers();
  let draft = { text: "/theme d", cursor: 8, revision: 1 };
  let identity = "session-a";
  const pending: Array<(items: readonly Suggestion[]) => void> = [];
  const load = vi.fn((_kind, _signal, _query?: string) => new Promise<readonly Suggestion[]>(resolve => pending.push(resolve)));
  const publish = vi.fn();
  const controller = new CatalogController({ identity: () => identity, draft: () => draft, load, publish });
  return { controller, load, publish, pending, draft: () => draft,
    change(text: string, cursor = text.length) { draft = { text, cursor, revision: draft.revision + 1 }; },
    switch() { identity = "session-b"; } };
}
const dark = [{ value: "dark", label: "dark" }];

describe("catalog request lifecycle", () => {
  it("debounces edits, refreshes without another key and reuses bounded cached entries", async () => {
    const h = harness();
    h.controller.update(h.draft());
    h.change("/theme da"); h.controller.update(h.draft());
    await vi.advanceTimersByTimeAsync(75);
    expect(h.load).toHaveBeenCalledTimes(1);
    h.pending[0]!(dark); await vi.advanceTimersByTimeAsync(0);
    expect(h.publish.mock.lastCall?.[0][0]).toMatchObject({ value: "dark", edit: { snapshot: h.draft(), text: "dark " } });
    h.change("/theme dar"); h.controller.update(h.draft());
    expect(h.load).toHaveBeenCalledTimes(1);
    h.controller.invalidate();
  });

  it.each(["edit", "cursor", "context", "cancel", "invalidate"])("discards a late result after %s", async kind => {
    const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
    if (kind === "edit") h.change("/theme l");
    if (kind === "cursor") h.change("/theme d", 7);
    if (kind === "context") h.switch();
    if (kind === "cancel") h.controller.cancel();
    if (kind === "invalidate") h.controller.invalidate();
    h.publish.mockClear(); h.pending[0]!(dark); await vi.advanceTimersByTimeAsync(0);
    expect(h.publish).not.toHaveBeenCalled(); h.controller.invalidate();
  });

  it("bounds waiting and ignores success after the timeout", async () => {
    const h = harness(); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(1575);
    expect(h.publish.mock.lastCall).toEqual([[], "Command entries timed out."]);
    expect(h.load.mock.calls[0]?.[1].aborted).toBe(true);
    h.publish.mockClear(); h.pending[0]!(dark); await vi.advanceTimersByTimeAsync(0);
    expect(h.publish).not.toHaveBeenCalled(); h.controller.invalidate();
  });

  it("reports failure without exposing upstream details and caches the failure briefly", async () => {
    const h = harness(); h.load.mockRejectedValueOnce(new Error("private upstream body"));
    h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
    expect(h.publish.mock.lastCall).toEqual([[], "Command entries unavailable."]);
    h.change("/theme da"); h.controller.update(h.draft());
    expect(h.load).toHaveBeenCalledTimes(1);
    h.controller.invalidate();
  });

  it("caps the visible menu and preserves quoted names", async () => {
    const h = harness(); h.change('/theme "Dark'); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
    h.pending[0]!(Array.from({ length: 6000 }, (_, i) => ({ value: `Dark ${i}`, label: `Dark ${i}` })));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.publish.mock.lastCall?.[0]).toHaveLength(100);
    expect(h.publish.mock.lastCall?.[0][0]?.edit.text).toMatch(/^"Dark \d+" $/);
    h.controller.invalidate();
  });

  it("only reads catalogs at supported entity positions and resolves aliases", () => {
    for (const text of ["/theme dark extra", "/tools --unknown", "/review text", "/theme", "theme dark", "tools read"]) {
      expect(catalogRequest({ text, cursor: text.length, revision: 1 })).toBeUndefined();
    }
    expect(catalogRequest({ text: "/skills ", cursor: 8, revision: 1 })?.kind).toBe("skill");
    expect(catalogRequest({ text: "/tools -- --f", cursor: 13, revision: 1 })?.kind).toBe("tools");
  });
});

it("caches each path directory separately while sharing basename prefixes", async () => {
  const h = harness(); h.change("/cd one/a"); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(h.load.mock.calls[0]?.[2]).toBe("one/");
  h.pending[0]!([{ value: "one/alpha/", label: "one/alpha/" }]); await vi.advanceTimersByTimeAsync(0);
  h.change("/cd one/al"); h.controller.update(h.draft());
  expect(h.load).toHaveBeenCalledTimes(1);
  h.change("/cd two/a"); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  expect(h.load.mock.calls[1]?.[2]).toBe("two/");
  h.pending[1]!([{ value: "two/another/", label: "two/another/" }]); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish.mock.lastCall?.[0].map((item: Suggestion) => item.value)).toEqual(["two/another/"]);
  h.controller.invalidate();
});

it("refreshes active directory events but never reopens cancelled drafts or accepts disposed observers", async () => {
  const h = harness();
  const changes: Array<() => void> = [];
  const closes: Array<ReturnType<typeof vi.fn>> = [];
  Object.assign(h.load, { observe: vi.fn((_kind, _query, changed: () => void) => {
    changes.push(changed); const close = vi.fn(); closes.push(close); return close;
  }) });
  h.change("/cd a"); h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  h.pending[0]!([{ value: "alpha/", label: "alpha/" }]); await vi.advanceTimersByTimeAsync(0);
  changes[0]!();
  expect(h.publish.mock.lastCall?.[1]).toBe("Loading command entries…");
  await vi.advanceTimersByTimeAsync(75);
  h.pending[1]!([{ value: "another/", label: "another/" }]); await vi.advanceTimersByTimeAsync(0);
  expect(h.publish.mock.lastCall?.[0].map((item: Suggestion) => item.value)).toEqual(["another/"]);
  h.controller.cancel(); h.publish.mockClear(); changes[0]!();
  await vi.advanceTimersByTimeAsync(75); expect(h.publish).not.toHaveBeenCalled();
  h.controller.invalidate(); expect(closes[0]).toHaveBeenCalledOnce();
  h.controller.update(h.draft()); await vi.advanceTimersByTimeAsync(75);
  h.publish.mockClear(); changes[0]!();
  expect(h.publish).not.toHaveBeenCalled();
  h.controller.invalidate();
});
