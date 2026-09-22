import { describe, expect, it } from "vitest";
import { classifyBrowserEvidenceSafety } from "./evidenceSafety.js";

describe("browser evidence safety", () => {
  it("keeps safe summaries without raw output", () => {
    const result = classifyBrowserEvidenceSafety({
      values: ["Safe observed fixture summary."],
    });

    expect(result.safetyStatus).toBe("safe");
    expect(result.safeSummaries).toEqual(["Safe observed fixture summary."]);
    expect(result.evidence).toContain("browser-evidence-safety:no-provider-or-model-call");
  });

  it("redacts and blocks raw HTML, secrets, hidden reasoning, and screenshot markers", () => {
    const result = classifyBrowserEvidenceSafety({
      values: ["<html>sk-testsecret123 hidden reasoning data:image/png;base64,abc</html>"],
    });

    expect(result.safetyStatus).toBe("unsafe");
    expect(result.redactions).toEqual(
      expect.arrayContaining([
        "raw-html",
        "secret-looking-content",
        "hidden-reasoning-marker",
        "screenshot-or-ocr-marker",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("sk-testsecret123");
    expect(JSON.stringify(result)).not.toContain("<html>");
  });

  it("blocks unsafe external URL evidence", () => {
    const result = classifyBrowserEvidenceSafety({
      values: ["https://example.com/private"],
    });

    expect(result.safetyStatus).toBe("blocked");
    expect(result.blockers).toContain("unsafe-external-url");
    expect(result.safeSummaries).toEqual(["[redacted:external-url]"]);
  });
});
