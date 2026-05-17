import { describe, expect, it } from "vitest";
import {
  createBrowserPlaywrightAvailability,
  resolveBrowserPlaywrightAvailability,
} from "./browserPlaywrightAvailability.js";

describe("browser Playwright availability", () => {
  it("reports unavailable deterministically without an injected checker", async () => {
    const availability = await resolveBrowserPlaywrightAvailability();

    expect(availability.status).toBe("unavailable");
    expect(availability.runtimeKind).toBe("unavailable");
    expect(availability.reason).toContain("No explicit Playwright runtime checker");
    expect(availability.evidence).toContain("browser-playwright-availability:no-install");
  });

  it("accepts an injected available module runtime without spawning", async () => {
    const availability = await resolveBrowserPlaywrightAvailability({
      checker: () => createBrowserPlaywrightAvailability({
        status: "available",
        runtimeKind: "module",
        version: "test-version",
      }),
    });

    expect(availability.status).toBe("available");
    expect(availability.runtimeKind).toBe("module");
    expect(availability.version).toBe("test-version");
    expect(availability.evidence).toContain("browser-playwright-availability:no-process-spawn");
  });

  it("converts checker failures into safe unavailable results", async () => {
    const availability = await resolveBrowserPlaywrightAvailability({
      checker: () => {
        throw new Error("raw sk-testsecret123");
      },
    });

    expect(availability.status).toBe("unavailable");
    expect(availability.reason).not.toContain("sk-testsecret123");
    expect(availability.warnings).toContain("browser-playwright-availability:checker-failed");
  });
});
