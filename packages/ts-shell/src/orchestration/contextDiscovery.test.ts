import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverTargetedContext } from "./contextDiscovery.js";
import { discoverContextGraph } from "./contextGraphDiscovery.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-discovery-"));
  await fs.mkdir(path.join(workspaceRoot, "src", "__tests__"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "src", "helper.ts"),
    "export function helperValue() { return 1; }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.ts"),
    [
      "import { helperValue } from './helper.js';",
      "export function targetThing() {",
      "  return helperValue();",
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.test.ts"),
    "import { targetThing } from '../session/continuation/target.js';\nexpect(targetThing()).toBe(1);\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "consumer.ts"),
    "import { targetThing } from '../session/continuation/target.js';\nexport const consumed = targetThing();\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "README.md"),
    "# Fixture\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "docs", "target.md"),
    "# target docs\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("discoverTargetedContext", () => {
  it("discovers imports, siblings, tests, docs, and call-site candidates deterministically", async () => {
    const result = await discoverTargetedContext({
      workspaceRoot,
      targetPath: "src/target.ts",
    });

    expect(result.sources.map((source) => [source.kind, source.safeLabel])).toEqual(
      expect.arrayContaining([
        ["target-file", "src/target.ts"],
        ["direct-import", "src/helper.ts"],
        ["nearby-test", "src/target.test.ts"],
        ["docs-readme", "README.md"],
        ["docs-readme", "docs/target.md"],
        ["call-site", "src/consumer.ts"],
      ]),
    );
    expect(result.evidence).toContain("context-discovery:deterministic");
    expect(result.budget.filesRead).toBeGreaterThan(1);
  });

  it("omits over-budget and out-of-workspace sources with explicit reasons", async () => {
    const result = await discoverTargetedContext({
      workspaceRoot,
      targetPath: "src/target.ts",
      limits: {
        maxBytesPerFile: 10,
        maxTotalBytes: 100,
        maxFilesRead: 10,
      },
    });

    expect(result.sources.some((source) => source.decision === "omitted-over-file-budget")).toBe(true);

    const outside = await discoverTargetedContext({
      workspaceRoot,
      targetPath: path.join(os.tmpdir(), "outside.ts"),
    });
    expect(outside.sources[0]?.decision).toBe("omitted-out-of-workspace");
  });

  it("includes a large selected target under the default product-path target budget", async () => {
    const largeTarget = [
      "import { helperValue } from './helper.js';",
      "export function largeTargetThing() {",
      "  return helperValue();",
      "}",
      "/*",
      "x".repeat(18_000),
      "*/",
      "",
    ].join("\n");
    await fs.writeFile(path.join(workspaceRoot, "src", "largeTarget.ts"), largeTarget);

    const result = await discoverTargetedContext({
      workspaceRoot,
      targetPath: "src/largeTarget.ts",
    });

    expect(result.sources[0]).toMatchObject({
      kind: "target-file",
      safeLabel: "src/largeTarget.ts",
      decision: "included",
    });
    expect(result.sources[0]?.summary).toContain("largeTargetThing");
  });

  it("does not let graph node budgeting omit an included large root target", async () => {
    await fs.writeFile(
      path.join(workspaceRoot, "src", "largeGraphTarget.ts"),
      [
        "export function largeGraphTargetThing() {",
        "  return 1;",
        "}",
        "/*",
        "x".repeat(18_000),
        "*/",
        "",
      ].join("\n"),
    );

    const graph = await discoverContextGraph({
      workspaceRoot,
      targetPath: "src/largeGraphTarget.ts",
    });

    expect(graph.includedCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "root-target",
          pathLabel: "src/largeGraphTarget.ts",
          budgetStatus: "included",
        }),
      ]),
    );
  });
});
