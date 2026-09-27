import { describe, expect, it } from "vitest";
import { redactReportText } from "../core/security/redaction.js";

describe("edit lane sanitisation", () => {


  it("redacts provider home, bearer tokens, api keys, and raw edit text", () => {
    const detail = [
      "home /home/wang/.private-agents-real/config.json",
      "Authorization: Bearer abc123def456",
      "api_key=supersecretvalue",
      "oldText:RAW_OLD",
      "newText:RAW_NEW",
      "hidden reasoning: chain of thought",
      "<html><body>noise</body></html>",
    ].join(" ");
    const scrubbed = redactReportText(detail, 400);
    expect(scrubbed).not.toContain("/home/wang/.private-agents-real/config.json");
    expect(scrubbed).not.toContain("abc123def456");
    expect(scrubbed).not.toContain("supersecretvalue");
    expect(scrubbed).not.toContain("RAW_OLD");
    expect(scrubbed).not.toContain("RAW_NEW");
    expect(scrubbed).not.toContain("chain of thought");
    expect(scrubbed).not.toContain("<html>");
    expect(scrubbed).toContain("[redacted-real-provider-home]");
  });

  it("honours the output length limit after redaction", () => {
    expect(redactReportText("y".repeat(500), 40)).toHaveLength(40);
  });


});
