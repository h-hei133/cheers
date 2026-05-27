import { describe, expect, it } from "vitest";

import { buildReadTaskDelivery } from "./readDeliveryProjection.js";

describe("readDeliveryProjection", () => {
  it("does not complete an empty grounded read", () => {
    const delivery = buildReadTaskDelivery({
      prompt: "read README.md",
      targetPath: "README.md",
      content: "",
      preferredMode: "read",
    });

    expect(delivery.completed).toBe(false);
    expect(delivery.evidenceMarkers).toContain("read-delivered-lines:0");
    expect(delivery.output).toMatch(/Task not completed/);
  });

  it("keeps filtered read evidence scoped to matched function lines", () => {
    const delivery = buildReadTaskDelivery({
      prompt: "read next functions",
      targetPath: "src/app.ts",
      content: ["const x = 1;", "export function run() {}", "const y = 2;"].join("\n"),
      requestedLines: 3,
      readFilter: "function-definitions",
      repairInstruction: {
        targetMode: "read",
        constraints: { readFilter: "function-definitions" },
      },
    });

    expect(delivery.completed).toBe(true);
    expect(delivery.output).toContain("export function run()");
    expect(delivery.evidenceMarkers).toEqual(
      expect.arrayContaining([
        "deliverable-mode:read",
        "repair-read-filter:function-definitions",
        "read-fragment-line-indexes:1",
      ]),
    );
  });
});
