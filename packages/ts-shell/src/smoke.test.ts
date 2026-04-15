import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");
const schemaPath = path.join(
  repoRoot,
  "contracts",
  "runtime-protocol.schema.json",
);
const rootPackagePath = path.join(repoRoot, "package.json");

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
});
