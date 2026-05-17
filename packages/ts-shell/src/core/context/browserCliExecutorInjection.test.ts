import { describe, expect, it } from "vitest";
import {
  BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV,
  loadBrowserCliExecutorInjectionFromEnv,
} from "./browserCliExecutorInjection.js";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
} from "./browserLocalFixtureManifest.js";

describe("browser CLI executor injection loader", () => {
  it("returns disabled when no explicit manifest env exists", () => {
    const result = loadBrowserCliExecutorInjectionFromEnv({ env: {} });

    expect(result.status).toBe("disabled");
    expect(result.manifestStatus).toBe("missing");
    expect(result.evidence).toContain("browser-cli-executor-injection:no-default-execution");
  });

  it("loads and validates an explicit safe manifest", () => {
    const manifest = createBrowserLocalFixtureManifest({
      fixture: {
        id: "fixture:route100",
        url: "local-fixture://route100",
      },
    });
    const result = loadBrowserCliExecutorInjectionFromEnv({
      env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/manifest.json" },
      readFile: () => serializeBrowserLocalFixtureManifest(manifest),
    });

    expect(result.status).toBe("valid");
    expect(result.fixture?.fixtureId).toBe("fixture:route100");
    expect(result.redactions).toEqual([]);
  });

  it("loads a manifest that explicitly requests playwright-local mode", () => {
    const manifest = createBrowserLocalFixtureManifest({
      executorMode: "playwright-local",
      fixture: {
        id: "fixture:route101",
        url: "local-fixture://route101",
      },
    });
    const result = loadBrowserCliExecutorInjectionFromEnv({
      env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/manifest.json" },
      readFile: () => serializeBrowserLocalFixtureManifest(manifest),
    });

    expect(result.status).toBe("valid");
    expect(result.manifest?.executorMode).toBe("playwright-local");
    expect(result.evidence).toContain("browser-cli-executor-injection:test-local-only");
  });

  it("rejects missing and invalid manifests without leaking raw content", () => {
    const missing = loadBrowserCliExecutorInjectionFromEnv({
      env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/missing.json" },
      readFile: () => {
        throw new Error("missing sk-testsecret123");
      },
    });
    const invalid = loadBrowserCliExecutorInjectionFromEnv({
      env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/invalid.json" },
      readFile: () => "{\"raw\":\"<main>sk-testsecret123</main>\"}",
    });

    expect(missing.status).toBe("missing-manifest");
    expect(missing.reason).not.toContain("sk-testsecret123");
    expect(invalid.status).toBe("invalid-manifest");
    expect(invalid.reason).not.toContain("<main>");
    expect(invalid.redactions).toContain("manifest-content");
  });

  it("rejects unsupported manifest executor modes safely", () => {
    const manifest = {
      ...createBrowserLocalFixtureManifest(),
      executorMode: "external-browser",
    };
    const result = loadBrowserCliExecutorInjectionFromEnv({
      env: { [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: "/tmp/manifest.json" },
      readFile: () => `${JSON.stringify(manifest)}\n`,
    });

    expect(result.status).toBe("invalid-manifest");
    expect(result.reason).toContain("executor mode");
    expect(result.warnings).toContain("browser-cli-executor-injection:blocked");
  });
});
