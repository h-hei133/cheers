import { describe, expect, it } from "vitest";
import { compareVersions, isNewerVersion, parseVersion } from "./compare.js";

/**
 * Comparing a published release against the installed one.
 *
 * The direction that matters is the false positive: telling someone an update
 * exists when it does not, or when the comparison could not be made at all, is a
 * prompt they cannot act on.
 */
describe("parsing a version", () => {
  it("reads the three numeric parts", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("v1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it("reads a prerelease tag", () => {
    expect(parseVersion("1.0.0-beta.2")?.prerelease).toEqual(["beta", "2"]);
  });

  it("refuses anything that is not this shape", () => {
    // A number taken from the middle of an unrecognised string would compare
    // against nothing real.
    for (const value of ["1.2", "1.2.3.4", "latest", "", "1.2.x"]) {
      expect(parseVersion(value)).toBeUndefined();
    }
  });
});

describe("comparing versions", () => {
  it("orders by each part in turn", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.10", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.0", "1.0.0")).toBeLessThan(0);
  });

  it("ranks a release above its own prereleases", () => {
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0-beta.1")).toBeGreaterThan(0);
  });

  it("orders numeric prerelease segments as numbers", () => {
    // Compared as text, `beta.10` sorts before `beta.9`.
    expect(compareVersions("1.0.0-beta.10", "1.0.0-beta.9")).toBeGreaterThan(0);
  });

  it("answers nothing when either side is unreadable", () => {
    expect(compareVersions("nonsense", "1.0.0")).toBeUndefined();
    expect(compareVersions("1.0.0", "nonsense")).toBeUndefined();
  });
});

describe("deciding whether to tell the user", () => {
  it("reports only a strictly newer version", () => {
    expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "1.0.0")).toBe(false);
  });

  it("stays quiet when the comparison could not be made", () => {
    // An update prompt built from a comparison nobody can check is worse than
    // no prompt at all.
    expect(isNewerVersion("not-a-version", "1.0.0")).toBe(false);
  });
});
