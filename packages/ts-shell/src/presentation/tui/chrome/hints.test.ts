import { describe, expect, it } from "vitest";
import { renderHints } from "./hints.js";
import { stripAnsi } from "../text/ansi.js";

describe("renderHints", () => {
  it("renders toast message in accent color when present", () => {
    const rows = renderHints(
      {
        busy: false,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
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
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );

    expect(rows).toEqual([]);
  });

  it("distinguishes steering from follow-up queue actions while busy", () => {
    const rows = renderHints(
      {
        busy: true,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );
    const text = stripAnsi(rows[0]!);
    // The hint names the gesture, not a promise about delivery: a command or a
    // composed prompt waits for the next turn instead of steering, and the
    // pending band above the prompt is where each entry says which it is.
    expect(text).toContain("enter steer");
    expect(text).toContain("ctrl+q queue");
  });
  it("shows queued follow-up counts while busy", () => {
    const rows = renderHints(
      {
        busy: true,
        suggesting: false,
        cancelArmed: false,
        queued: 2,
      },
      { openTodos: 0, peerSessions: 0 },
      80,
    );
    expect(stripAnsi(rows[0]!)).toContain("2 queued");
  });
});
