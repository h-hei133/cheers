import { describe, expect, it } from "vitest";

import {
  buildExplainTaskDelivery,
  buildInspectFilesDelivery,
  buildPurposeIoExplainDelivery,
} from "./repoExplainStage.js";

describe("repoExplainStage", () => {
  it("projects inspect output without marking empty inspection as success", () => {
    expect(buildInspectFilesDelivery("")).toBe(
      "Task not completed: inspection ran but no candidate files were found for the requested scope.",
    );

    expect(buildInspectFilesDelivery("src/a.ts\nsrc/b.ts")).toContain(
      "Repository inspection result (candidate files):",
    );
  });

  it("builds report-safe grounded explanation from inspected content", () => {
    const output = buildExplainTaskDelivery(
      "src/app.ts",
      "import fs from 'node:fs';\nexport const value = 1;",
    );

    expect(output).toContain("Explanation for src/app.ts:");
    expect(output).toContain("imports dependencies/modules");
    expect(output).toContain("defines executable logic/API symbols");
  });

  it("builds scoped role and io explanation", () => {
    expect(
      buildPurposeIoExplainDelivery(
        "src/api.ts",
        "export function main(input: string): string { return input; }",
      ),
    ).toContain("Explanation for src/api.ts (scoped to role + I/O):");
  });
});
