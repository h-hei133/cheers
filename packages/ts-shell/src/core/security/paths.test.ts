import { describe, expect, it } from "vitest";
import { redactReportText } from "./redaction.js";

describe("report path redaction", () => {
  it.each([
    ["at run (/home/person/work/src/a.ts:12:3)", "at run ([project]/src/a.ts:12:3)"],
    ["at /home/person/work/src/a.ts:12:3", "at [project]/src/a.ts:12:3"],
    ["at run (/home/person/work/src/a file.ts:12:3)", "at run ([project]/src/a file.ts:12:3)"],
    ["open '/home/person/work/a file.txt' failed", "open '[project]/a file.txt' failed"],
    ["at run (file:///home/person/work/a%20file.ts:12:3)", "at run ([project]/a file.ts:12:3)"],
    ["at run (/home/person/work-other/a.ts:1:2)", "at run ([external]/a.ts:1:2)"],
    ["at run (/home/person/work/../private/a.ts:1:2)", "at run ([external]/a.ts:1:2)"],
    ["open /etc/private/key.json failed", "open [external]/key.json failed"],
    [String.raw`at run (C:\Users\person\src\a.ts:1:2)`, "at run ([external]/a.ts:1:2)"],
    [String.raw`open '\\server\share\private\a file.txt' failed`, "open '[external]/a file.txt' failed"],
    ["at run (file://server/share/private/a.ts:1:2)", "at run ([external]/a.ts:1:2)"],
    ["visit https://example.test/docs/a", "visit https://example.test/docs/a"],
    ["open [/home/person/private/a.ts]", "open [[external]/a.ts]"],
    ["path:/home/person/private/a.ts", "path:[external]/a.ts"],
    ["Error: failed\n    at /home/person name/work/src/a.ts:12:3", "Error: failed at [external]/a.ts:12:3"],
    ["Error: failed\n    at async /home/person name/work/src/a.ts:12:3", "Error: failed at async [external]/a.ts:12:3"],
    ["file:///home/person/work/api%5Fkey%3Dsecret-value.txt", "[project]/api_key=[redacted]"],
    ["file:///home/person/work/%3Chtml%3ECONTENT%3C%2Fhtml%3E", "[path]"],
    ["file:///home/person/work/name%20%2Fhome%2Fperson%2Fprivate%2Fa.ts", "[path]"],
    ["file:///home/person/work/name%0aSECRET", "[path]"],
  ])("scrubs %s", (input, expected) => {
    expect(redactReportText(input, 1000, { projectRoot: "/home/person/work" })).toBe(expected);
  });

  it("compares drive paths without depending on the host OS", () => {
    expect(redactReportText(String.raw`at run (c:\WORK\src\a.ts:2:3)`, 1000, {
      projectRoot: "C:/work",
    })).toBe("at run ([project]/src/a.ts:2:3)");
  });

  it("leaves paths alone unless the report opts in", () => {
    expect(redactReportText("open /home/person/work/a.ts", 1000)).toBe("open /home/person/work/a.ts");
  });
});
