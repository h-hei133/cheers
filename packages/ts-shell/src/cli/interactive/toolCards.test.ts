import { describe, expect, it } from "vitest";
import { ToolCards } from "./toolCards.js";
import { Transcript } from "../../presentation/tui/transcript/container.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";

function setup() {
  const transcript = new Transcript();
  const cards = new ToolCards(transcript, () => {});
  cards.start("bash", "one");
  return { transcript, cards, block: transcript.last()! };
}

describe("tool bodies and state", () => {
  it("keeps approval out of the body and replaces preview with one canonical final", () => {
    const { cards, block, transcript } = setup();
    cards.approval("one", "awaiting");
    expect(block.text).toBe("");
    expect(transcript.render(80).rows.join("\n")).toContain("awaiting approval");
    cards.approval("one", "approved");
    cards.append("one", "fi");
    cards.append("one", "nal\n");
    expect(block.text).toBe("final\n");
    cards.finish("one", true, undefined, "final\n");
    cards.finish("one", true, undefined, "final\n");
    expect(block.text).toBe("final\n");
    expect(block.approval).toBe("approved");
    expect(block.status).toBe("ok");
  });

  it.each(["denied", "cancelled", "partial"])("keeps %s evidence with stream-only output", (reason) => {
    const { cards, block, transcript } = setup();
    cards.approval("one", "awaiting");
    cards.append("one", "artifact: saved.txt\n");
    cards.finish("one", false, reason);
    expect(block.text).toBe("artifact: saved.txt\n");
    expect(block.failureReason).toBe(reason);
    expect(block.approval).toBe("interrupted");
    expect(block.status).toBe("failed");
    expect(block.collapsed).toBe(false);
    expect(stripAnsi(transcript.render(80).rows.join("\n"))).toContain(reason);
  });

  it("preserves separate failure detail alongside a nonempty final body", () => {
    const { cards, block, transcript } = setup();
    cards.append("one", "preview");
    cards.finish("one", false, "cancelled after write", "artifact: partial.txt");
    expect(block.text).toBe("artifact: partial.txt");
    const rows = stripAnsi(transcript.render(80).rows.join("\n"));
    expect(rows).toContain("cancelled after write");
    expect(rows).toContain("artifact: partial.txt");
    expect(rows).not.toContain("preview");
  });

  it("honours an explicit empty final and retains a missing final", () => {
    const { cards, block } = setup();
    cards.append("one", "preview");
    cards.finish("one", true, undefined, "");
    expect(block.text).toBe("");
    const second = setup();
    second.cards.append("one", "preview");
    second.cards.finish("one", true);
    expect(second.block.text).toBe("preview");
  });

  it("marks bounded preview loss and clears that marker only for a canonical final", () => {
    const { cards, block } = setup();
    cards.append("one", "x".repeat(20_000));
    expect(block.text.length).toBe(16_000);
    expect(block.previewTruncated).toBe(true);
    cards.finish("one", false, "interrupted");
    expect(block.previewTruncated).toBe(true);
    const second = setup();
    second.cards.append("one", "x".repeat(20_000));
    second.cards.finish("one", true, undefined, "full result artifact: result.txt");
    expect(second.block.previewTruncated).toBe(false);
  });

  it("keeps interleaved calls and fenced diff finalization independent", () => {
    const { cards, block, transcript } = setup();
    cards.start("edit", "two");
    const second = transcript.last()!;
    cards.append("one", "first");
    cards.append("two", "stale preview");
    cards.finish("two", false, "partial", "artifact: patch.txt\n```diff\n-old\n+new\n```");
    cards.finish("one", true, undefined, "first");
    expect(block.text).toBe("first");
    expect(second.text).toBe("artifact: patch.txt");
    expect(second.diff).toBe("-old\n+new");
    expect(second.status).toBe("failed");
  });
});
