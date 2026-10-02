import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { currentTheme, defaultTheme } from "./theme.js";
import { selectTheme, selectedTheme, updateAppearance } from "./selection.js";
import { resolveThemeTarget } from "../themes/watch.js";

beforeEach(() => { vi.stubEnv("FORCE_COLOR", "2"); selectTheme("dark"); updateAppearance("dark"); });
afterEach(() => { vi.unstubAllEnvs(); selectTheme("dark"); updateAppearance("dark"); });

it("falls back immediately and accepts a late report through the shared palette", () => {
  selectTheme("auto");
  expect(selectedTheme()).toBe("auto");
  expect(currentTheme()).toBe("dark");
  const revision = defaultTheme.colorRevision;
  expect(updateAppearance("light")).toBe(true);
  expect(currentTheme()).toBe("light");
  expect(defaultTheme.colorRevision).toBeGreaterThan(revision);
  expect(updateAppearance("light")).toBe(false);
});

it("keeps explicit selection even when it matched the auto palette at selection time", () => {
  selectTheme("auto");
  selectTheme("dark");
  expect(selectedTheme()).toBe("dark");
  expect(updateAppearance("light")).toBe(false);
  expect(currentTheme()).toBe("dark");
  selectTheme("auto");
  expect(currentTheme()).toBe("light");
});

it("retains selection and palette if a named theme fails to load", () => {
  selectTheme("auto");
  const revision = defaultTheme.colorRevision;
  expect(() => selectTheme("does-not-exist")).toThrow("Theme not found");
  expect(selectedTheme()).toBe("auto");
  expect(defaultTheme.colorRevision).toBe(revision);
  expect(updateAppearance("light")).toBe(true);
});

it("uses built-in automatic palettes while retaining explicit file overrides", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "theme-appearance-"));
  const file = path.join(root, "dark.json");
  fs.writeFileSync(file, JSON.stringify({ name: "dark", colors: { accent: "#ff00ff" } }));
  try {
    selectTheme("dark", root, [file]);
    const custom = defaultTheme.fg("accent", "x");
    expect(resolveThemeTarget(root, [file])?.filePath).toBe(file);
    selectTheme("auto", root, [file]);
    expect(defaultTheme.fg("accent", "x")).not.toBe(custom);
    expect(resolveThemeTarget(root, [file])).toBeUndefined();
    fs.writeFileSync(file, "{ broken");
    expect(() => selectTheme("auto", root, [file])).not.toThrow();
  } finally { fs.rmSync(root, { force: true, recursive: true }); }
});
