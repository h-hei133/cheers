import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assessHostDistributionReadiness,
  createHostRuntime,
  projectHostJsonResponse,
} from "./index.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const schemaPath = path.join(
  repoRoot,
  "contracts",
  "runtime-protocol.schema.json",
);
const rootPackagePath = path.join(repoRoot, "package.json");
const shellPackagePath = path.join(repoRoot, "packages", "ts-shell", "package.json");

describe("TypeScript shell smoke tests", () => {
  it("can read the shared runtime contract schema", () => {
    expect(existsSync(schemaPath)).toBe(true);

    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      $defs?: Record<string, unknown>;
    };

    expect(schema.$defs).toBeDefined();
    expect(Object.keys(schema.$defs ?? {})).toContain("CommandRequest");
  });

  it("keeps the root workspace test command wired to gate then unified runner", () => {
    const rootPackage = JSON.parse(readFileSync(rootPackagePath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(rootPackage.scripts?.test).toBe(
      "npm run test:gate:golden-main-path && node scripts/test-all-stacks.mjs",
    );
  });

  it("imports package host surfaces and checks host distribution readiness", async () => {
    const shellPackage = JSON.parse(readFileSync(shellPackagePath, "utf8")) as {
      main?: string;
      bin?: Record<string, string>;
    };
    const host = createHostRuntime();
    const response = await host.dispatch({
      action: "start-turn",
      inputText: "read a safe file through package import",
      mode: "read-only",
      providerMode: "synthetic",
    });
    const json = projectHostJsonResponse({ response });
    const readiness = await assessHostDistributionReadiness({
      packageMetadata: shellPackage,
      cliEntrypointAvailable: Boolean(shellPackage.bin?.agents),
    });

    expect(shellPackage.main).toBe("./dist/packages/ts-shell/src/index.js");
    expect(json.schemaVersion).toBe("host-json-response.v1");
    expect(readiness.schemaVersion).toBe("host-distribution-readiness.v1");
    expect(readiness.smoke.defaultProviderOff).toBe("passed");
    expect(readiness.terminalSuccessClaim).toBe(false);
  });
});
