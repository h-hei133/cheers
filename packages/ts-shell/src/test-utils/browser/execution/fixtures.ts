import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV,
} from "../../../browser/cliExecutorInjection.js";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
  type BrowserLocalFixtureManifest,
} from "../../../browser/localFixtureManifest.js";

export interface BrowserCliLocalFixtureManifestFixture {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifest: BrowserLocalFixtureManifest;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): void;
}

export function createBrowserCliLocalFixtureManifestFixture(input: {
  readonly prefix?: string;
  readonly executorMode?: BrowserLocalFixtureManifest["executorMode"];
  readonly unsafeManifest?: unknown;
} = {}): BrowserCliLocalFixtureManifestFixture {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), input.prefix ?? "cheers-browser-cli-fixture-"),
  );
  const manifestPath = path.join(root, "browser-local-fixture-manifest.json");
  const manifest = createBrowserLocalFixtureManifest({
    source: "cli-harness",
    executorMode: input.executorMode,
    fixture: {
      id: "fixture:route100-demo",
      title: "Route 100 local fixture",
      url: "local-fixture://route100-demo",
      textSummary: "Route 100 safe local fixture summary for observe and extract.",
      allowedActions: ["observe", "extract", "navigate-local"],
    },
  });
  fs.writeFileSync(
    manifestPath,
    input.unsafeManifest
      ? `${JSON.stringify(input.unsafeManifest, null, 2)}\n`
      : serializeBrowserLocalFixtureManifest(manifest),
    "utf8",
  );
  return {
    root,
    manifestPath,
    manifest,
    env: {
      [BROWSER_CLI_LOCAL_FIXTURE_MANIFEST_ENV]: manifestPath,
    },
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
