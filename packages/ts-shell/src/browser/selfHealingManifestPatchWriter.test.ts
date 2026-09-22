import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBrowserExternalRunnerManifest, serializeBrowserExternalRunnerManifest, validateBrowserExternalRunnerManifest } from "./runtime/external/manifest.js";
import { createBrowserLocalFixtureManifest, serializeBrowserLocalFixtureManifest, validateBrowserLocalFixtureManifest } from "./localFixtureManifest.js";
import { decideBrowserSelfHealingManifestPatchPolicy } from "./selfHealingManifestPatchPolicy.js";
import { renderBrowserSelfHealingManifestPatchSurface } from "./selfHealingManifestPatchSurface.js";
import { writeBrowserSelfHealingManifestPatch } from "./selfHealingManifestPatchWriter.js";

describe("browser self-healing manifest patch writer", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes runner binding metadata with atomic validated output", () => {
    const manifestPath = writeExternalManifest();
    const result = writeBrowserSelfHealingManifestPatch({
      proposalId: proposalId("missing-runner-binding"),
      patchKind: "add-runner-binding",
      manifestPath,
      now: () => "2026-05-18T00:00:00.000Z",
    });

    expect(result.applied).toBe(true);
    expect(result.changedSummary).toContain("runner binding");
    expect(renderBrowserSelfHealingManifestPatchSurface(result)).toContain("Browser executed: no");
    const validated = validateBrowserExternalRunnerManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.manifest.runnerRef).toBe("route114-test-runner");
    }
  });

  it("blocks unsafe and external patch requests before writing", () => {
    const manifestPath = writeLocalFixtureManifest();
    const external = writeBrowserSelfHealingManifestPatch({
      proposalId: proposalId("allowlist-blocked"),
      patchKind: "update-allowlist-local-fixture",
      manifestPath,
      requestedOrigin: "https://example.com",
    });
    const unsafe = decideBrowserSelfHealingManifestPatchPolicy({
      patchKind: "refresh-fixture-summary",
      manifestPath,
      fixtureSummary: "RAW_SECRET sk-testsecret123 hidden reasoning",
    });

    expect(external.applied).toBe(false);
    expect(external.manifestPatchStatus).toBe("patch-blocked-external-network");
    expect(unsafe.status).toBe("patch-blocked-unsafe");
  });

  it("updates local fixture allowlist and fixture summary", () => {
    const manifestPath = writeLocalFixtureManifest();
    const allowlist = writeBrowserSelfHealingManifestPatch({
      proposalId: proposalId("allowlist-blocked"),
      patchKind: "update-allowlist-local-fixture",
      manifestPath,
      requestedOrigin: "local-fixture://route114-added",
    });
    const fixture = writeBrowserSelfHealingManifestPatch({
      proposalId: proposalId("stale-fixture"),
      patchKind: "refresh-fixture-summary",
      manifestPath,
      fixtureSummary: "Route 114 refreshed safe fixture summary.",
    });
    const validated = validateBrowserLocalFixtureManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8")));

    expect(allowlist.applied).toBe(true);
    expect(fixture.applied).toBe(true);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.manifest.allowedLocalOrigins).toContain("local-fixture://route114-added");
      expect(validated.manifest.fixtures[0]?.textSummary).toContain("Route 114 refreshed");
    }
  });

  function writeExternalManifest(): string {
    const root = tempRoot();
    const runnerPath = path.join(root, "runner.cjs");
    fs.writeFileSync(runnerPath, "process.stdin.resume();\n", "utf8");
    const manifestPath = path.join(root, "external-runner.json");
    fs.writeFileSync(manifestPath, serializeBrowserExternalRunnerManifest(createBrowserExternalRunnerManifest({
      source: "test-only",
      runnerMode: "test-local",
      runnerId: "route114-test-runner",
      runnerCommand: { command: process.execPath, args: [runnerPath] },
    })), "utf8");
    return manifestPath;
  }

  function writeLocalFixtureManifest(): string {
    const root = tempRoot();
    const manifestPath = path.join(root, "local-fixture.json");
    fs.writeFileSync(manifestPath, serializeBrowserLocalFixtureManifest(createBrowserLocalFixtureManifest()), "utf8");
    return manifestPath;
  }

  function tempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "browser-manifest-patch-"));
    roots.push(root);
    return root;
  }

  function proposalId(kind: string): string {
    return `browser-self-healing-proposal:browser-replay-plan:test:${kind}`;
  }
});
