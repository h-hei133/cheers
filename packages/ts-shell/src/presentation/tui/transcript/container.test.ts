import { describe, expect, it } from "vitest";
import { Transcript } from "./container.js";
import { textBlock } from "./blocks.js";

const WIDTH = 40;

function rowsOf(transcript: Transcript, capacity: number): readonly string[] {
  return transcript.renderViewport(WIDTH, capacity);
}

describe("live rendering", () => {
  it("renders appended blocks in order", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "first"));
    transcript.append(textBlock("notice", "second"));
    const rows = rowsOf(transcript, 20).join("\n");
    expect(rows.indexOf("first")).toBeLessThan(rows.indexOf("second"));
  });

  it("clips to the trailing rows when the tail overflows its capacity", () => {
    const transcript = new Transcript();
    for (const text of ["one", "two", "three", "four"]) transcript.append(textBlock("notice", text));
    const rows = rowsOf(transcript, 2).join("\n");
    expect(rows).toContain("four");
    expect(rows).not.toContain("one");
  });
});

describe("retirement under pressure", () => {
  it("offers nothing while the tail still fits", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "small"));
    expect(transcript.peekBatch(WIDTH, 20)).toBeUndefined();
  });

  it("offers the shortest finalized prefix that relieves the overflow", () => {
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    const batch = transcript.peekBatch(WIDTH, 2);
    expect(batch).toBeDefined();
    expect(batch?.rows.join("\n")).toContain("one");
    expect(batch?.rows.join("\n")).not.toContain("three");
  });

  it("returns the same batch until it is acknowledged", () => {
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    const first = transcript.peekBatch(WIDTH, 2);
    const second = transcript.peekBatch(WIDTH, 2);
    expect(second?.id).toBe(first?.id);
  });

  it("stops rendering a block as soon as its batch is offered", () => {
    // The offered rows enter the terminal's scrollback in the same frame, so
    // rendering them in the viewport too would show them twice.
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    transcript.peekBatch(WIDTH, 2);
    expect(rowsOf(transcript, 20).join("\n")).not.toContain("one");
  });

  it("stops rendering a block once its batch is acknowledged", () => {
    // Rows already in the terminal's scrollback must never be repainted, or the
    // transcript shows them twice.
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    const batch = transcript.peekBatch(WIDTH, 2)!;
    transcript.acknowledge(batch.id);
    expect(rowsOf(transcript, 20).join("\n")).not.toContain("one");
  });

  it("ignores an acknowledgement for a batch it did not offer", () => {
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    const batch = transcript.peekBatch(WIDTH, 2)!;
    transcript.acknowledge(batch.id + 99);
    expect(transcript.peekBatch(WIDTH, 2)?.id).toBe(batch.id);
  });

  it("refuses to retire a block that can still change", () => {
    const transcript = new Transcript();
    transcript.append({ kind: "assistant", text: "streaming", finalized: false });
    transcript.append(textBlock("notice", "after"));
    expect(transcript.peekBatch(WIDTH, 0)).toBeUndefined();
  });

  it("retires it once the turn finalizes everything", () => {
    const transcript = new Transcript();
    transcript.append({ kind: "assistant", text: "streaming", finalized: false });
    transcript.finalizeAll();
    expect(transcript.peekBatch(WIDTH, 0)).toBeDefined();
  });
});

describe("shutdown flush", () => {
  it("retires every finalized block regardless of capacity", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "one"));
    transcript.beginFlush();
    const batch = transcript.peekBatch(WIDTH, 999);
    expect(batch?.rows.join("\n")).toContain("one");
  });
});

describe("replay after a scrollback reset", () => {
  it("republishes the committed ledger without rewinding retirement", () => {
    const transcript = new Transcript();
    for (const text of ["one", "two", "three"]) transcript.append(textBlock("notice", text));
    const first = transcript.peekBatch(WIDTH, 2)!;
    transcript.acknowledge(first.id);

    transcript.beginReplay();
    const replay = transcript.peekBatch(WIDTH, 999);
    expect(replay?.kind).toBe("replay");
    expect(replay?.rows.join("\n")).toContain("one");
    transcript.acknowledge(replay!.id);
    expect(rowsOf(transcript, 20).join("\n")).not.toContain("one");
  });

  it("offers no replay when nothing has retired yet", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "only"));
    transcript.beginReplay();
    expect(transcript.peekBatch(WIDTH, 999)).toBeUndefined();
  });
});

describe("reading back what has retired", () => {
  function retired(): Transcript {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "alpha"));
    transcript.append(textBlock("notice", "beta"));
    transcript.append(textBlock("notice", "gamma"));
    // Retires exactly the first block: the remaining two rows fit the capacity.
    const batch = transcript.peekBatch(WIDTH, 4);
    transcript.acknowledge(batch!.id);
    return transcript;
  }

  it("re-renders the tail of retired rows so a drag across them is answerable", () => {
    const tail = retired().retiredTail(WIDTH, 10).join("\n");

    expect(tail).toContain("alpha");
  });

  it("returns only as many rows as were asked for, ending at the newest", () => {
    const transcript = retired();
    const all = transcript.retiredTail(WIDTH, 10);
    const last = transcript.retiredTail(WIDTH, 1);

    expect(last).toEqual(all.slice(all.length - 1));
  });

  it("has nothing to offer before anything retires", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "alpha"));

    expect(transcript.retiredTail(WIDTH, 10)).toEqual([]);
  });

  it("never reports rows a live block would contribute", () => {
    const tail = retired().retiredTail(WIDTH, 20).join("\n");

    expect(tail).not.toContain("gamma");
  });
});

describe("clearing", () => {
  it("forgets retired and live blocks alike", () => {
    const transcript = new Transcript();
    transcript.append(textBlock("notice", "gone"));
    transcript.clear();
    expect(rowsOf(transcript, 20)).toEqual([]);
    expect(transcript.rowCount(WIDTH)).toBe(0);
  });
});
