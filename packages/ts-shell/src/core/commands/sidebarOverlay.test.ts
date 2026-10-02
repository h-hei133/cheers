import { describe, expect, it } from "vitest";
import { createCommandRegistry } from "./registry.js";
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

it("aligns sidebar snapshot help, completions and compatibility aliases with a single capture", async () => {
  const command = createCommandRegistry().get("sidebar")!;
  expect(command.summary).toContain("snapshot");
  expect(command.summary).not.toContain("live");
  expect(command.argumentHint).toContain("snapshot");
  const completions = command.getArgumentCompletions!("")!.map((item) => item.value);
  expect(completions).toContain("snapshot");
  expect(completions).not.toContain("watch");
  expect(completions).not.toContain("live");
  for (const args of [["snapshot"], ["watch"], ["live"]]) {
    const result = await runSidebarLocalCommand(args, context());
    expect(result.output).toContain("Visible agent state snapshot");
    expect(result.output).toContain("Snapshot captured on request");
    expect(result.output).toContain("Frame: #1");
    expect(result.output).not.toContain("Frame: #2");
    expect(result.output).not.toContain("live/watch");
  }
  const invalid = await runSidebarLocalCommand(["snapshot", "forever"], context());
  expect(invalid.output).toContain("Outcome: blocked");
  expect(invalid.output).toContain("/sidebar snapshot");
});
