import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, currentTheme, defaultTheme } from "../theme/theme.js";
import { createThemeReloader, RELOAD_DEBOUNCE_MS, resolveThemeTarget, watchTheme, type ThemeWatchTarget } from "./watch.js";

/**
 * A theme is a file the user edits, so what matters is that an edit reaches the
 * palette and asks for a repaint — and that a burst of writes becomes one reload,
 * a half-written file is left alone, and nothing is left running afterwards.
 *
 * The debounce and the reload are driven by the test clock. Watching itself is a
 * platform event arriving on the real loop, so it gets one test of its own rather
 * than being the mechanism every assertion depends on.
 */

const homes: string[] = [];
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;

beforeEach(() => {
  vi.stubEnv("FORCE_COLOR", "2");
  applyTheme("dark", process.cwd());
});

/** A user themes directory, the place a theme is discovered from. */
function withUserThemes(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "theme-watch-home-"));
  homes.push(home);
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const themes = path.join(home, ".cheers", "themes");
  fs.mkdirSync(themes, { recursive: true });
  return themes;
}

function writeTheme(filePath: string, name: string, selectedBg: string): void {
  fs.writeFileSync(
    filePath,
    JSON.stringify({ name, description: "test", colors: { selectedBg } }),
    "utf8",
  );
}

/** The colour the palette currently reports for the token the fixtures set. */
function selectedBackground(): string {
  return defaultTheme.bg("selectedBg", "x");
}

afterEach(() => {
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.useRealTimers();
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
  vi.unstubAllEnvs();
  // The palette is a shared instance, so a test must not leave its colours behind.
  applyTheme("dark", process.cwd());
});

/** A theme on disk, applied, and a target naming it. */
function appliedTheme(): { target: ThemeWatchTarget; file: string } {
  const themes = withUserThemes();
  const file = path.join(themes, "mine.json");
  writeTheme(file, "mine", "#111111");
  applyTheme("mine", process.cwd());
  return {
    file,
    target: { name: "mine", filePath: file, workspaceRoot: process.cwd(), extraPaths: [] },
  };
}

describe("createThemeReloader", () => {
  it("reloads the palette once after a burst of writes, and asks for a repaint", () => {
    vi.useFakeTimers();
    const { file, target } = appliedTheme();
    const before = selectedBackground();
    let repaints = 0;
    const reloader = createThemeReloader(target, () => { repaints += 1; });
    try {
      // An editor saving a file is several writes. Reloading on each would read
      // a half-written file, so the burst has to become one reload.
      writeTheme(file, "mine", "#222222");
      reloader.schedule();
      reloader.schedule();
      reloader.schedule();

      expect(repaints).toBe(0);
      vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);

      expect(repaints).toBe(1);
      // Adopting the palette and showing it are two things, so both are
      // asserted: the colour changed, and a repaint was asked for.
      expect(selectedBackground()).not.toBe(before);
    } finally {
      reloader.stop();
    }
  });

  it("leaves the palette alone when a shadowing file is momentarily absent", () => {
    vi.useFakeTimers();
    // A file that shadows a bundled theme, which is the case where the absence
    // actually matters. A theme with a name nothing else claims fails to load on
    // its own, so skipping it changes nothing; a shadowing one would fall back to
    // the bundled colours and repaint with a palette the user did not choose.
    const themes = withUserThemes();
    const file = path.join(themes, "dark.json");
    applyTheme("dark", process.cwd());
    const bundledBefore = selectedBackground();
    writeTheme(file, "dark", "#123456");
    applyTheme("dark", process.cwd());
    const before = selectedBackground();
    // The user's file won, so the palette is not the bundled one.
    // Recorded while the bundled theme was in effect, above.
    expect(before).not.toBe(bundledBefore);

    const target: ThemeWatchTarget = { name: "dark", filePath: file, workspaceRoot: process.cwd(), extraPaths: [] };
    let repaints = 0;
    const reloader = createThemeReloader(target, () => { repaints += 1; });
    try {
      fs.rmSync(file);
      reloader.schedule();
      vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);

      expect(repaints).toBe(0);
      // Still the user's colour. Falling back to the bundled dark here would be
      // a palette change nobody asked for, caused by a file being mid-save.
      expect(selectedBackground()).toBe(before);
    } finally {
      reloader.stop();
    }
  });

  it("keeps the working palette when the file does not parse", () => {
    vi.useFakeTimers();
    const { file, target } = appliedTheme();
    const before = selectedBackground();
    let repaints = 0;
    const reloader = createThemeReloader(target, () => { repaints += 1; });
    try {
      fs.writeFileSync(file, "{ not json", "utf8");
      reloader.schedule();
      vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);

      expect(repaints).toBe(0);
      expect(selectedBackground()).toBe(before);
    } finally {
      reloader.stop();
    }
  });

  it("does not reload for a theme the user has switched away from", () => {
    vi.useFakeTimers();
    const { target } = appliedTheme();
    let repaints = 0;
    const reloader = createThemeReloader(target, () => { repaints += 1; });
    try {
      reloader.schedule();
      // A switch between the change and the debounce firing. The file this
      // reloader knows about is no longer the one on screen.
      applyTheme("dark", process.cwd());
      vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);

      expect(repaints).toBe(0);
      expect(currentTheme()).toBe("dark");
    } finally {
      reloader.stop();
    }
  });

  it("says nothing once stopped", () => {
    vi.useFakeTimers();
    const { file, target } = appliedTheme();
    let repaints = 0;
    const reloader = createThemeReloader(target, () => { repaints += 1; });
    writeTheme(file, "mine", "#333333");
    reloader.schedule();
    reloader.stop();

    vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);
    expect(repaints).toBe(0);
  });

  it("leaves no pending timer behind, so nothing holds the process open", () => {
    vi.useFakeTimers();
    const { file, target } = appliedTheme();
    const reloader = createThemeReloader(target, () => {});
    try {
      writeTheme(file, "mine", "#2a2a2a");
      reloader.schedule();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(RELOAD_DEBOUNCE_MS + 1);
      // Fired and cleared: a timer still pending here is one the process would
      // have to wait for before exiting.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      reloader.stop();
    }
  });
});

describe("resolveThemeTarget", () => {
  it("names the file a theme on disk came from", () => {
    const { file } = appliedTheme();
    const target = resolveThemeTarget(process.cwd());
    expect(target?.filePath).toBe(file);
    expect(target?.name).toBe("mine");
  });

  it("names no file for a theme that shipped with the build", () => {
    withUserThemes();
    applyTheme("dark", process.cwd());
    // There is no file whose editing should change a bundled theme, so there is
    // nothing to follow. That is the ordinary case, not a failure.
    expect(resolveThemeTarget(process.cwd())).toBeUndefined();
    expect(watchTheme({ workspaceRoot: process.cwd(), onReload: () => {} })).toBeUndefined();
  });
});

/**
 * Watching is a platform event on the real event loop, so this one does use real
 * time. It is kept because the composition — watcher wired to reloader — is the
 * part the other cases above deliberately do not cover, and its failure mode
 * (events firing for the wrong file) is not reachable any other way.
 */
describe("watchTheme against a real file", () => {
  it("reloads when the file is rewritten", async () => {
    const { file } = appliedTheme();
    const before = selectedBackground();
    let repaints = 0;
    const watcher = watchTheme({ workspaceRoot: process.cwd(), onReload: () => { repaints += 1; } });
    expect(watcher).toBeDefined();
    try {
      writeTheme(file, "mine", "#22aa22");
      const deadline = Date.now() + 5000;
      while (repaints === 0 && Date.now() < deadline) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(repaints).toBeGreaterThan(0);
      expect(selectedBackground()).not.toBe(before);
    } finally {
      watcher?.stop();
    }
  });
});
