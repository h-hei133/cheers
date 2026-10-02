import { describe, expect, it } from "vitest";
import { redactExportText, redactReportText } from "./redaction.js";

describe("credential assignments", () => {
  it.each(["password", "api_key", "token", "authorization"])("scrubs quoted JSON %s values without deleting sibling content", key => {
    const input = JSON.stringify({ [key]: 'FAKE_SECRET with spaces and "quotes"', keep: "visible" });
    const output = redactExportText(input);
    expect(output).not.toContain("FAKE_SECRET");
    expect(JSON.parse(output)).toEqual({ [key]: "[redacted]", keep: "visible" });
    expect(redactReportText(input, 1000)).not.toContain("FAKE_SECRET");
  });

  it("scrubs a whole quoted shell assignment without truncating following lines", () => {
    expect(redactExportText('password="FAKE SECRET"\nnext line')).toBe("password=[redacted]\nnext line");
  });

  it.each([
    'Cookie: session=FAKE_COOKIE_ONE;csrf=FAKE_COOKIE_TWO',
    'password=FAKE_PREFIX,FAKE_SUFFIX',
    'password="FAKE_PREFIX"FAKE_SUFFIX',
    'password=\'FAKE_PREFIX\'"FAKE_SUFFIX"',
  ])("removes the whole bare credential: %s", input => {
    expect(redactExportText(input)).not.toContain("FAKE_");
    expect(redactReportText(input, 1000)).not.toContain("FAKE_");
  });

  it.each([24681357, false, null])("scrubs a JSON scalar credential: %s", password => {
    expect(JSON.parse(redactExportText(JSON.stringify({ password, keep: "visible" })))).toEqual({ password: "[redacted]", keep: "visible" });
  });
});
