import { describe, expect, it } from "vitest";
import { runReloadCommand } from "./reloadCommandRuntime.js";
import { getRuntimeConfig, type RuntimeConfig } from "../../config/runtimeConfig.js";
import { applyTheme, currentTheme, defaultTheme } from "../../presentation/theme/theme.js";

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

    expect(result.output).toContain("No configuration values changed.");
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

  it("applies the theme it just read, rather than only reporting it", async () => {
    // Reporting `theme: "dark" → "light"` while the screen stays dark teaches the
    // reader to distrust the command. The report and the screen have to agree.
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const second = { ...first, theme: "light" as const };
    const { context } = contextWith(first, second);

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("theme");
    expect(result.output).toContain("Applied theme `light`");
    // The shared palette every surface renders with is the observable effect.
    expect(defaultTheme.name).toBe("light");
    // Restored because the palette is a module-level singleton: leaving it light
    // would hand every later test in this worker a different starting state.
    applyTheme("dark");
  });

  it("leaves the palette alone when the theme is auto", async () => {
    // `auto` defers to the terminal rather than naming a theme to apply.
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const second = { ...first, theme: "auto" as const };
    const { context } = contextWith(first, second);

    const result = await runReloadCommand([], context);

    expect(result.output).not.toContain("Applied theme");
  });

  it("keeps the reload working when the named theme no longer loads", async () => {
    // A broken theme must not cost the settings that did reload.
    const first = getRuntimeConfig("/tmp/nonexistent-a");
    const second = { ...first, theme: "no-such-theme", instructionBudgetBytes: 0 };
    const { context, holder } = contextWith(first, second);
    const active = currentTheme();
    const revision = defaultTheme.colorRevision;

    const result = await runReloadCommand([], context);

    expect(result.output).toContain("Re-read configuration");
    expect(result.output).not.toContain("Applied theme");
    expect(result.output).toContain("Theme 'no-such-theme' could not be applied: Theme not found");
    expect(result.output).toContain(`Keeping active theme \`${active}\``);
    expect(result.output).toContain("Configuration changes:");
    expect(holder.config.instructionBudgetBytes).toBe(0);
    expect(currentTheme()).toBe(active);
    expect(defaultTheme.colorRevision).toBe(revision);
  });
});
