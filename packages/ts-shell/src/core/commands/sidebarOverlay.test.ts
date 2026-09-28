import { describe, expect, it } from "vitest";
import { runSidebarLocalCommand } from "./sidebarCommandRuntime.js";
import { PAGER_THRESHOLD_ROWS } from "../../presentation/tui/chrome/pager.js";
import type { CommandContext } from "./types.js";

/** The command reads its stores off the context; a context with none is the
 * empty session, which is exactly the shape worth rendering. */
function context(): CommandContext {
  return { cwd: "/workspace", sessionId: "sess_test" } as unknown as CommandContext;
}

describe("/sidebar", () => {
  it("answers the boxed panel, not the prose preview that disclaimed itself", async () => {
    const result = await runSidebarLocalCommand([], context());

    // The old default view opened with three lines saying no real UI exists.
    // The panel is the same facts in a bordered, sectioned form.
    expect(result.kind).toBe("local");
    expect(result.output).not.toContain("no actual sidebar UI exists yet");
    expect(result.output).not.toContain("State preview only");
    // The panel's own frame: bordered top and bottom, a title line between.
    const rows = result.output.split("\n");
    expect(rows[0]).toMatch(/^[-+]/);
    expect(rows[rows.length - 1]).toMatch(/^[-+]/);
    expect(result.output).toContain("Visible agent state");
  });

  it("runs past the pager threshold, so interactive sessions open it full-screen", async () => {
    const result = await runSidebarLocalCommand([], context());

    // This is the wiring this command rides: long command output is moved out
    // of the transcript into a full-screen pager. A panel that shrank under
    // the threshold would silently lose that and land as transcript noise.
    expect(result.output.split("\n").length).toBeGreaterThan(PAGER_THRESHOLD_ROWS);
  });
});
