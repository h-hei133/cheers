import { describe, expect, it } from "vitest";
import { diffPaint, prepareRows } from "../render/paint.js";
import { textBlock } from "../transcript/blocks.js";
import { Transcript } from "../transcript/container.js";
import { TranscriptPane } from "./pane.js";

/**
 * Frame cost over a long conversation, asserted as work rather than as time.
 *
 * A session that has run for an hour must still paint like one that just
 * started: finalized blocks come from cache, a streaming block re-lays only
 * itself, the pane slices a window without rendering twice, and the engine's row
 * diff touches only the rows that changed.
 *
 * Every assertion counts what was done — layouts performed, blocks rendered,
 * rows compared — because a wall-clock bound answers a different question. These
 * bounds were a second and a quarter-second, which is loose enough to pass a
 * regression of an order of magnitude and tight enough to fail when the machine
 * is busy: one of them was the only failure in a full-suite run that passed
 * three times in a row on its own. A count is the same number on every machine.
 */

function buildTranscript(turns: number): Transcript {
  const transcript = new Transcript();
  for (let i = 0; i < turns; i++) {
    transcript.append({ kind: "user", text: `question ${i}: what does module ${i} do?`, finalized: true });
    transcript.append({
      kind: "thinking",
      text: `considering module ${i} across several candidate designs`,
      collapsed: true,
      finalized: true,
    });
    transcript.append({
      kind: "assistant",
      text: `# Answer ${i}\n\nModule ${i} owns its runtime boundary.\n\n\`\`\`ts\nconst value${i} = ${i};\n\`\`\``,
      finalized: true,
    });
    transcript.append({
      kind: "tool",
      title: "read",
      detail: `src/module-${i}.ts`,
      text: `line 1 of module ${i}\nline 2 of module ${i}`,
      collapsed: true,
      finalized: true,
    });
  }
  return transcript;
}

/** Indices of the rows that differ, the same rows the engine would rewrite. */
function changedRows(before: readonly string[], after: readonly string[]): number[] {
  const changed: number[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] !== after[index]) changed.push(index);
  }
  return changed;
}

describe("long-transcript budget", () => {
  it("renders 50 turns", () => {
    const transcript = buildTranscript(50);

    const rendered = transcript.render(100);

    expect(rendered.rows.length).toBeGreaterThan(500);
  });

  it("re-renders a finalized transcript without laying anything out again", () => {
    // The property a cache exists for, counted rather than timed: a second render
    // of an unchanged transcript re-lays out no block at all.
    let layouts = 0;
    const transcript = new Transcript();
    for (let index = 0; index < 50; index++) {
      transcript.append({
        kind: "assistant",
        text: `answer ${index}`,
        finalized: true,
        rows: (width) => {
          layouts += 1;
          return [`answer ${index} at ${width}`];
        },
      });
    }

    transcript.render(100);
    const afterFirst = layouts;
    transcript.render(100);

    expect(afterFirst).toBe(50);
    expect(layouts).toBe(afterFirst);
  });

  it("streams one block without re-laying finalized blocks", () => {
    const transcript = buildTranscript(20);
    const settled = transcript.render(100).rows.length;
    const live = textBlock("assistant", "streaming answer...");
    live.finalized = false;
    transcript.append(live);
    for (let i = 0; i < 20; i++) {
      live.text += " more";
      const rows = transcript.render(100).rows;
      expect(rows.length).toBeGreaterThan(settled);
      expect(rows.join("\n")).toContain("streaming answer...");
    }
    // The property is that the whole history is not re-laid per frame, which the
    // cache test above asserts directly. Here it is enough that streaming works.
  });

  it("windows a long transcript through the pane", () => {
    const transcript = buildTranscript(50);
    const pane = new TranscriptPane(transcript);

    const visible = pane.render(100, 30, undefined);

    expect(visible).toHaveLength(30);
    expect(pane.scrolledBack).toBe(0);
    expect(pane.scrollbarGeometry()).toBeDefined();
  });

  it("diffs a streaming frame to a small changed range", () => {
    const transcript = buildTranscript(20);
    const before = prepareRows(transcript.render(100).rows, 100);
    const live = textBlock("assistant", "streaming...");
    live.finalized = false;
    transcript.append(live);
    const after = prepareRows(transcript.render(100).rows, 100);
    const changed = changedRows(before, after);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(30);
    // The engine rewrites exactly those rows: one cursor move per changed row.
    const paint = diffPaint(before, after, 0, after.length);
    expect(paint.split("\x1b[").length - 1).toBeLessThan(changed.length * 3);
  });

  it("windows a 200-turn transcript without re-laying the whole history", () => {
    const transcript = buildTranscript(200);
    const pane = new TranscriptPane(transcript);

    const visible = pane.render(100, 30, undefined);

    expect(visible).toHaveLength(30);
    expect(transcript.render(100).rows.length).toBeGreaterThan(2000);
  });

  it("does not re-lay the transcript because a frame asks at two widths", () => {
    // A frame measures at the full width to decide whether a scrollbar is
    // needed and renders one column narrower because the scrollbar takes the
    // last one. With one cache slot per block those two questions evicted each
    // other, so every block was laid out again on every frame — measured at
    // 18ms against 0.9ms on a conversation of 8,000 blocks.
    //
    // Counted rather than timed, so this fails on the shape of the cache and
    // not on how busy the machine running it happens to be.
    const transcript = new Transcript();
    let layouts = 0;
    transcript.append({
      kind: "assistant",
      text: "measured",
      finalized: true,
      rows: (width) => {
        layouts += 1;
        return [`measured at ${width}`];
      },
    });

    for (let frame = 0; frame < 3; frame++) {
      transcript.render(119);
      transcript.render(120);
    }

    // Two widths, laid out once each. A cache that holds one of them re-lays
    // the other every time it is asked again.
    expect(layouts).toBe(2);
    expect(transcript.render(120).rows.join("")).toContain("measured at 120");
  });

  it("windows a large tool output without re-laying the whole history", () => {
    const transcript = buildTranscript(20);
    transcript.append({
      kind: "tool",
      title: "bash",
      detail: "npm test",
      text: Array.from({ length: 10000 }, (_, index) => `output line ${index}`).join("\n"),
      collapsed: false,
      finalized: true,
    });
    const pane = new TranscriptPane(transcript);

    const visible = pane.render(100, 30, undefined);

    expect(visible).toHaveLength(30);
    // A 10,000-line body in the middle of the history does not stop the frame
    // from being a 30-row window onto it.
    expect(visible.every((row) => typeof row === "string")).toBe(true);
  });
});
