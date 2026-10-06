import { afterEach, expect, it, vi } from "vitest";
import * as discovery from "../../../core/skills/skillCatalog.js";
import * as watch from "./watch.js";
import { createSkillCatalog } from "./skills.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";

afterEach(() => vi.restoreAllMocks());

it("bounds live targets while replacing a catalog and closes every handle", () => {
  let live = 0; let peak = 0; let generation = "first";
  vi.spyOn(watch, "observeDirectory").mockImplementation(() => {
    live++; peak = Math.max(peak, live);
    return () => { live--; };
  });
  vi.spyOn(discovery, "resolveSkillCatalog").mockImplementation((_options, onSource) => {
    for (let i = 0; i < 300; i++) onSource?.(`/synthetic-${generation}/${i}`);
    return { skills: new Map(), collisions: [], diagnostics: [], failures: [] };
  });
  const catalog = createSkillCatalog(); const stop = catalog.observe(vi.fn());
  const context = { cwd: process.cwd() } as ShellRuntimeContext;
  catalog.read(context); expect(live).toBe(256);
  generation = "second"; catalog.read(context);
  expect(peak).toBe(256); expect(live).toBe(256);
  stop(); expect(live).toBe(0);
  catalog.read(context); expect(live).toBe(0);
});
