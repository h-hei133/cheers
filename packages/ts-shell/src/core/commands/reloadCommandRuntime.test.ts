import { describe, expect, it } from "vitest";
import { runReloadCommand } from "./reloadCommandRuntime.js";
import { getRuntimeConfig, type RuntimeConfig } from "../../config/runtimeConfig.js";

/** A context whose settings are replaced in place, as the session does. */
function contextWith(initial: RuntimeConfig, next?: RuntimeConfig) {
  const holder = { config: initial };
  return {
    context: {
      cwd: "/tmp/reload-under-test",
      refreshRuntimeConfig: () => {
        const before = holder.config;
        holder.config = next ?? before;
        return { before, after: holder.config };
      },
    } as never,
    holder,
  };
}

describe("/reload", () => {
  it("replaces the session's settings with freshly read ones", async () => {
    // Configuration is read once at startup, so without this a mid-session edit
    // changes nothing until restart and says nothing about why.
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const second = getRuntimeConfig("/tmp/nonexistent-b", { instructionBudgetBytes: 0 });
    const { context, holder } = contextWith(first, second);

    await runReloadCommand([], context);

    expect(holder.config.instructionBudgetBytes).toBe(0);
  });

  it("names the settings that changed", async () => {
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const second = getRuntimeConfig("/tmp/nonexistent-b", { instructionBudgetBytes: 0 });
    const { context } = contextWith(first, second);

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("instructionBudgetBytes");
  });

  it("says so when nothing changed", async () => {
    const same = getRuntimeConfig("/tmp/nonexistent-a");
    const { context } = contextWith(same, same);

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("No settings differ");
  });

  it("keeps working settings when the new ones cannot be read", async () => {
    // A file that no longer parses must not replace settings that still work —
    // the session would be left with no configuration at all.
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const { context, holder } = contextWith(first);
    (context as { refreshRuntimeConfig: () => never }).refreshRuntimeConfig = () => {
      throw new Error("config.json is not valid JSON");
    };

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("Could not re-read configuration");
    expect(holder.config).toBe(first);
  });

  it("says what it cannot refresh rather than implying everything was", async () => {
    const same = getRuntimeConfig("/tmp/nonexistent-a");
    const { context } = contextWith(same, same);

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("restart");
  });

  it("explains itself when the caller has no session to refresh", async () => {
    const result = await runReloadCommand([], { cwd: "/tmp" } as never);

    expect(result.output).toContain("Restart");
  });
});
