import { describe, expect, it } from "vitest";
import { stripAnsi } from "../text/ansi.js";
import { Editor } from "../editor.js";
import { assistantMessage, errorMessage, noticeMessage, thinkingMessage, userMessage } from "./messages.js";
import { ToolCard } from "./card.js";
import { Composer, StatusBar } from "./chrome.js";

function facts() {
  return {
    facts: {
      model: "test-model",
      provider: "test-provider",
    },
    items: ["model", "provider"] as const,
    activity: undefined,
    busy: false,
  };
}

describe("adapter message components", () => {
  it("renders a user bubble with background", () => {
    const rows = userMessage("hello").render(30).join("\n");
    expect(rows).toContain("hello");
    expect(stripAnsi(rows).length).toBeGreaterThan(0);
  });

  it("renders assistant markdown without raw markers", () => {
    const rows = assistantMessage("# Title", true).render(40).join("\n");
    expect(rows).toContain("Title");
    expect(rows).not.toContain("# Title");
  });

  it("collapses thinking to one row and expands on toggle", () => {
    const thinking = thinkingMessage("long reasoning here", true, true);
    expect(thinking.render(40).filter((row) => row.trim()).length).toBeLessThanOrEqual(2);
    thinking.toggleCollapsed();
    expect(thinking.render(40).join("\n")).toContain("long reasoning here");
  });

  it("renders notice and error rows", () => {
    expect(noticeMessage("hi").render(20).join("\n")).toContain("hi");
    expect(errorMessage("boom").render(20).join("\n")).toContain("boom");
  });
});

describe("adapter tool card", () => {
  it("shows a folded summary while collapsed", () => {
    const card = new ToolCard({ title: "read", detail: "a.ts", text: "file-body-line", collapsed: true, finalized: true });
    const rows = card.render(50).join("\n");
    expect(rows).toContain("read");
    expect(rows).toContain("1 line · click to expand");
    expect(rows).not.toContain("file-body-line");
  });

  it("expands output and diff on click", () => {
    const card = new ToolCard({ title: "edit", text: "ok", diff: "@@ x", collapsed: true, finalized: true });
    card.handlePointer({ kind: "click", x: 0, y: 0, screenX: 0, screenY: 0, width: 50, height: 10, shift: false, alt: false, ctrl: false });
    const rows = card.render(50).join("\n");
    expect(rows).toContain("ok");
    expect(rows).toContain("x");
  });

  it("streams while running without a folded summary", () => {
    const card = new ToolCard({ title: "bash", detail: "sleep 1", text: "partial", finalized: false });
    expect(card.render(50).join("\n")).toContain("partial");
  });
});

describe("adapter status bar and composer", () => {
  it("renders the configured status items", () => {
    const rows = new StatusBar({ ...facts(), items: ["model"] }).render(40).join("\n");
    expect(rows).toContain("test-model");
  });

  it("renders the prompt with hint row", () => {
    const editor = new Editor();
    editor.insert("hello");
    const composer = new Composer(editor, {
      busy: false,
      suggesting: false,
      cancelArmed: false,
      queued: 0,
      newlineKey: "ctrl+j",
      ambient: { openTodos: 1, peerSessions: 0 },
    });
    const rows = composer.render(30).join("\n");
    expect(rows).toContain("hello");
    expect(rows).toContain("open todo");
  });

  it("shows the queued-input affordance while busy", () => {
    const editor = new Editor();
    const composer = new Composer(editor, {
      busy: true,
      suggesting: false,
      cancelArmed: false,
      queued: 2,
      newlineKey: "ctrl+j",
      ambient: { openTodos: 0, peerSessions: 0 },
    });
    expect(composer.render(30).join("\n")).toContain("queued");
  });
});
