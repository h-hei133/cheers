import { describe, expect, it } from "vitest";
import { renderHints, newlineKeyFor } from "./hints.js";
import { stripAnsi } from "../text/ansi.js";

describe("renderHints", () => {
  it("renders toast message in accent color when present", () => {
    const rows = renderHints(
      {
        busy: false,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
        toast: "Copied 501 characters across 8 lines to clipboard",
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );

    expect(rows).toHaveLength(1);
    expect(stripAnsi(rows[0]!)).toContain("Copied 501 characters across 8 lines to clipboard");
  });

  it("prioritizes cancelArmed and suggesting over toast", () => {
    const rows = renderHints(
      {
        busy: false,
        suggesting: true,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
        toast: "Copied 501 characters to clipboard",
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );

    expect(stripAnsi(rows[0]!)).toContain("tab complete");
    expect(stripAnsi(rows[0]!)).not.toContain("Copied");
  });

  it("renders ambient facts when no toast or transient hint is active", () => {
    const rows = renderHints(
      {
        busy: false,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
      },
      { openTodos: 3, peerSessions: 2 },
      80,
    );

    expect(stripAnsi(rows[0]!)).toContain("3 open todos");
    expect(stripAnsi(rows[0]!)).toContain("2 other sessions");
  });

  it("omits row when idle and no facts or toast are pending", () => {
    const rows = renderHints(
      {
        busy: false,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );

    expect(rows).toEqual([]);
  });

  it("advertises proper newline key for keyboard protocols", () => {
    expect(newlineKeyFor("enhanced")).toBe("shift+enter");
    expect(newlineKeyFor("legacy")).toBe("ctrl+j");
  });
  it("distinguishes steering from follow-up queue actions while busy", () => {
    const rows = renderHints(
      {
        busy: true,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );
    const text = stripAnsi(rows[0]!);
    expect(text).toContain("enter add to current step");
    expect(text).toContain("ctrl+q run after turn");
  });
  it("shows queued follow-up counts while busy", () => {
    const rows = renderHints(
      {
        busy: true,
        suggesting: false,
        cancelArmed: false,
        queued: 2,
        newlineKey: "ctrl+j",
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );
    expect(stripAnsi(rows[0]!)).toContain("2 queued");
  });
});
