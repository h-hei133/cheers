import { describe, expect, it } from "vitest";
import { createCommandRegistry } from "./registry.js";
import { runSidebarLocalCommand } from "./sidebarCommandRuntime.js";
import { Pager, pageLongOutput } from "../../presentation/tui/chrome/pager.js";
import { reportText } from './report/projection.js';
import type { CommandContext } from "./types.js";

/** The command reads its stores off the context; a context with none is the
 * empty session, which is exactly the shape worth rendering. */
function context(): CommandContext {
  return { cwd: "/workspace", sessionId: "sess_test" } as unknown as CommandContext;
}

describe("/sidebar", () => {
  it("answers a semantic report over the existing read-only panel model", async () => {
    const result = await runSidebarLocalCommand([], context());

    expect(result.kind).toBe("local");
    expect(result.output).not.toContain("no actual sidebar UI exists yet");
    expect(result.output).not.toContain("State preview only");
    expect(result.report?.facts.source).toBe('session-state-snapshot');
    expect(result.report?.facts.safety).toMatchObject({ readOnly: true, providerCall: 'none', persistence: 'none' });
    expect(result.output).toBe(reportText(result.report!));
    expect(result.output).toContain("Visible agent state");
  });

  it("opens the existing report reader independent of the old line threshold", async () => {
    const result = await runSidebarLocalCommand([], context());

    const pager = new Pager();
    expect(pageLongOutput(pager, '/sidebar', { text: result.output, report: result.report })).toBe(true);
    expect(pager.active).toBe(true);
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
    expect(result.report?.facts.frame).toMatchObject({ number: 1 });
    expect(result.output).not.toContain("Frame: #2");
    expect(result.output).not.toContain("live/watch");
  }
  const invalid = await runSidebarLocalCommand(["snapshot", "forever"], context());
  expect(invalid.output).toContain("Outcome: blocked");
  expect(invalid.output).toContain("/sidebar snapshot");
});
