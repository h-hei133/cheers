import { describe, expect, it } from "vitest";
import { parseKeyEvent } from "../input/keys.js";
import { TranscriptSearch } from "./searchState.js";

/**
 * The keys an open search takes.
 *
 * The events are built by the real parser rather than by hand, because the key id
 * for a modified key is `shift+enter`, not `enter` carrying a shift flag — and a
 * hand-built event that disagrees with the parser tests the disagreement instead of
 * the search. That is exactly how the reverse step came to be unreachable while the
 * suite was green.
 */
function searchWith(query: string): TranscriptSearch {
  const search = new TranscriptSearch();
  search.begin();
  search.append(query);
  // The bar builds the index in the running app.
  search.indexFor(["hit one", "hit two", "hit three"]);
  return search;
}

describe("a search that is open", () => {
  it("walks forward on Enter and back on Shift+Enter", () => {
    const search = searchWith("hit");
    expect(search.currentNumber).toBe(1);

    search.handleKey(parseKeyEvent("\u001b[13u"));
    expect(search.currentNumber).toBe(2);
    search.handleKey(parseKeyEvent("\u001b[13u"));
    expect(search.currentNumber).toBe(3);

    // The way back, written the way a terminal writes it. Shift+Enter arrives as
    // `CSI 13;2u` and parses to the key id `shift+enter`; a search that looks for
    // `enter` alone matches nothing here, and the key is consumed with no meaning.
    search.handleKey(parseKeyEvent("\u001b[13;2u"));
    expect(search.currentNumber).toBe(2);
    search.handleKey(parseKeyEvent("\u001b[13;2u"));
    expect(search.currentNumber).toBe(1);
  });

  it("wraps around at either end", () => {
    const search = searchWith("hit");
    search.handleKey(parseKeyEvent("\u001b[13;2u"));
    expect(search.currentNumber).toBe(3);
    search.handleKey(parseKeyEvent("\u001b[13u"));
    expect(search.currentNumber).toBe(1);
  });

  it("steps with the arrows too", () => {
    const search = searchWith("hit");
    search.handleKey(parseKeyEvent("\u001b[B"));
    expect(search.currentNumber).toBe(2);
    search.handleKey(parseKeyEvent("\u001b[A"));
    expect(search.currentNumber).toBe(1);
  });

  it("closes and forgets the query on Escape", () => {
    const search = searchWith("hit");
    expect(search.handleKey(parseKeyEvent("\u001b"))).toEqual({ handled: true, redraw: true });
    expect(search.active).toBe(false);
    expect(search.query).toBe("");
    // A reopened bar starts clean: a query nobody asked for is worse than none.
    search.begin();
    expect(search.query).toBe("");
  });

  it("takes printable characters for the query and keeps them from the editor", () => {
    const search = new TranscriptSearch();
    search.begin();
    // Consumed even when it does nothing, because a character that fell through
    // would be typed into the prompt behind the query.
    expect(search.handleKey(parseKeyEvent("\u001bOP"))).toEqual({ handled: true });
    expect(search.handleKey(parseKeyEvent("a"))).toEqual({ handled: true, redraw: true, moved: true });
    expect(search.query).toBe("a");
    search.handleKey(parseKeyEvent("\u007f"));
    expect(search.query).toBe("");
  });

  it("handles nothing when no search is open", () => {
    const search = new TranscriptSearch();
    expect(search.handleKey(parseKeyEvent("\u001b[13u")).handled).toBe(false);
  });
});
