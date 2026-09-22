import { describe, expect, it } from "vitest";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import { redactReportText } from "../core/security/redaction.js";
import { fingerprint, sanitizeId, sanitizeTargetSummary } from "./sanitize.js";

describe("edit lane sanitisation", () => {
  it("fingerprints content with the SHA-256 prefix the lanes emitted before unification", () => {
    // Pinned because this exact value is written into runtime events and session
    // records. A unification pass once replaced the body with a 32-bit roll, which
    // changed every fingerprint downstream and failed nothing, because no test
    // asserted the value. These expected strings are the pre-unification outputs.
    expect(fingerprint("hello")).toBe("2cf24dba5fb0a30e");
    expect(fingerprint("")).toBe("e3b0c44298fc1c14");
    expect(fingerprint("const a = 1;")).toBe(computeFragmentFingerprint("const a = 1;").slice(0, 16));
    expect(fingerprint("x".repeat(500))).toHaveLength(16);
  });

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

  it("normalises ids to a stable slug and keeps target summaries report-safe", () => {
    expect(sanitizeId("  Some/Path:FILE.ts  ")).toBe("some-path:file.ts");
    expect(sanitizeId("--already--")).toBe("already");
    expect(sanitizeTargetSummary("oldText:RAW_OLD value")).not.toContain("RAW_OLD");
  });
});
