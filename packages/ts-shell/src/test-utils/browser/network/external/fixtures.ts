import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BROWSER_CLI_EXTERNAL_NETWORK_RUNNER_MANIFEST_ENV,
  createBrowserExternalNetworkRunnerManifest,
  serializeBrowserExternalNetworkRunnerManifest,
  type BrowserExternalNetworkRunnerManifest,
} from "../../../../browser/externalNetworkRunnerManifest.js";

export interface BrowserExternalNetworkHandoffManifestFixture {
  readonly root: string;
  readonly manifestPath: string;
  readonly manifest: BrowserExternalNetworkRunnerManifest;
  readonly env: Readonly<Record<string, string>>;
  cleanup(): void;
}

export function createBrowserExternalNetworkHandoffManifestFixture(input: {
  readonly prefix?: string;
  readonly manifest?: BrowserExternalNetworkRunnerManifest;
  readonly unsafeManifest?: unknown;
} = {}): BrowserExternalNetworkHandoffManifestFixture {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), input.prefix ?? "cheers-browser-external-network-handoff-"),
  );
  const manifestPath = path.join(root, "browser-external-network-runner-manifest.json");
  const manifest = input.manifest ?? createBrowserExternalNetworkRunnerManifest();
  fs.writeFileSync(
    manifestPath,
    input.unsafeManifest
      ? `${JSON.stringify(input.unsafeManifest, null, 2)}\n`
      : serializeBrowserExternalNetworkRunnerManifest(manifest),
    "utf8",
  );
  return {
    root,
    manifestPath,
    manifest,
    env: {
      [BROWSER_CLI_EXTERNAL_NETWORK_RUNNER_MANIFEST_ENV]: manifestPath,
    },
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
