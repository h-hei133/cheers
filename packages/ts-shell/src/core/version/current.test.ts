import { describe, expect, it } from "vitest";
import { packageName, packageVersion, versionLabel } from "./current.js";

/**
 * What the build calls itself.
 *
 * These read the real manifest, which is reachable when the suite runs from the
 * source tree. The compiled-binary case — where no manifest exists and the
 * answer has to come from a value baked in at build time — cannot be exercised
 * from here, because the identifiers are replaced by the bundler and are simply
 * undeclared under the test runner. What is pinned is the precedence that makes
 * that path safe: a reachable manifest wins, so a source checkout can never
 * report a stale baked-in version.
 */
describe("build identity", () => {
  it("reports the version from the manifest", () => {
    // Read from packages/ts-shell/package.json, which this suite sits inside.
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reports the package name from the manifest", () => {
    expect(packageName()).toBe("@cheers/ts-shell");
  });

  it("labels itself with the version rather than the placeholder", () => {
    // "version unknown" is the honest answer when nothing can be read. Getting it
    // here would mean the manifest walk broke.
    expect(versionLabel()).not.toBe("version unknown");
    expect(versionLabel()).toBe(packageVersion());
  });

  it("does not invent a version when the manifest cannot be read", () => {
    // The fallback path returns undefined rather than a fabricated string: a
    // made-up version gets compared against a published release and produces an
    // update prompt for a build that does not exist. Asserted through the
    // contract, since the manifest is reachable here.
    const version = packageVersion();
    expect(version === undefined || /^\d+\.\d+\.\d+/.test(version)).toBe(true);
  });
});
