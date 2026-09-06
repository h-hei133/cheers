import { describe, expect, it } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import { Container, type ViewComponent } from "./contract.js";
import { diffLines, renderAppendChunk, viewportFor } from "./screen.js";
import { ScrollView } from "./scroll.js";
import { OverlayStack, compositeLine } from "./overlay.js";
import { toBlock } from "./model.js";

class Rows implements ViewComponent {
  constructor(private readonly lines: string[]) {}
  invalidate(): void {}
  render(): string[] {
    return [...this.lines];
  }
}

describe("adapter screen diff", () => {
  it("detects appended lines as the changed range", () => {
    const diff = diffLines(["a"], ["a", "b"]);
    expect(diff.noChange).toBe(false);
    expect(diff.appended).toBe(true);
    expect(diff.firstChanged).toBe(1);
    expect(diff.lastChanged).toBe(1);
  });

  it("reports no change for identical frames", () => {
    expect(diffLines(["a"], ["a"]).noChange).toBe(true);
  });

  it("truncates rows wider than the terminal instead of throwing", () => {
    const chunk = renderAppendChunk(["toolong"], 0, 3);
    expect(chunk.rows).toBe(1);
    expect(stripAnsi(chunk.text)).toContain("…");
  });

  it("clamps the viewport to content", () => {
    expect(viewportFor(100, 10, 95).top).toBe(90);
  });
});

describe("adapter scroll view", () => {
  it("follows the end while new rows arrive", () => {
    const view = new ScrollView(new Rows(["a", "b", "c"]), { follow: "end" });
    expect(view.visible(10, 2)).toEqual(["b", "c"]);
    expect(view.isFollowingEnd).toBe(true);
  });

  it("holds position once the user scrolls back", () => {
    const view = new ScrollView(new Rows(["a", "b", "c"]), { follow: "end" });
    view.visible(10, 2);
    view.scrollBy(-1);
    expect(view.scrollTop).toBe(0);
    expect(view.isFollowingEnd).toBe(false);
  });

  it("rejects structural changes to its single child", () => {
    const view = new ScrollView(new Rows(["a"]));
    expect(() => view.addChild(new Rows(["b"]))).toThrow();
  });

  it("scrolls to the start and end", () => {
    const view = new ScrollView(new Rows(["a", "b", "c"]), { follow: "end" });
    view.visible(10, 2);
    view.scrollBy(-1);
    expect(view.scrollTop).toBe(0);
    expect(view.isFollowingEnd).toBe(false);
    view.scrollToEnd();
    expect(view.scrollTop).toBe(1);
    view.scrollToStart();
    expect(view.scrollTop).toBe(0);
  });
});

describe("adapter overlay stack", () => {
  it("composites an overlay row within terminal width", () => {
    const stack = new OverlayStack();
    stack.show(new Rows(["overlay"]));
    const rows = stack.composite(["base row here"], 20, 10);
    expect(stripAnsi(rows[0]!).length).toBeLessThanOrEqual(20);
  });

  it("restores focus after the overlay hides", () => {
    const stack = new OverlayStack();
    const base: ViewComponent = new Container();
    stack.setFocus(base);
    const handle = stack.show(new Rows(["x"]));
    expect(stack.focus).not.toBe(base);
    handle.hide();
    expect(stack.focus).toBe(base);
  });

  it("falls back to the remaining overlay when the top hides", () => {
    const stack = new OverlayStack();
    const first = new Rows(["first"]);
    const second = new Rows(["second"]);
    const firstHandle = stack.show(first);
    stack.show(second);
    firstHandle.hide();
    expect(stack.focus).toBe(second);
  });

  it("keeps composite lines within width", () => {
    const line = compositeLine("base", "over", 2, 4, 10);
    expect(stripAnsi(line).length).toBeLessThanOrEqual(10);
  });
});

describe("adapter view model", () => {
  it("maps thinking to a collapsed block", () => {
    expect(toBlock({ kind: "thinking", text: "hmm" }).collapsed).toBe(true);
  });

  it("maps tool detail and diff through", () => {
    const block = toBlock({ kind: "tool", text: "out", title: "read", detail: "a.ts", diff: "@@ x" });
    expect(block.detail).toBe("a.ts");
    expect(block.diff).toBe("@@ x");
  });

  it("marks a running tool running and a finalized tool ok", () => {
    expect(toBlock({ kind: "tool", text: "out" }).status).toBe("running");
    expect(toBlock({ kind: "tool", text: "out", finalized: true }).status).toBe("ok");
  });

  it("maps command blocks through", () => {
    expect(toBlock({ kind: "command", text: "out", title: "/x" }).kind).toBe("command");
  });
});
