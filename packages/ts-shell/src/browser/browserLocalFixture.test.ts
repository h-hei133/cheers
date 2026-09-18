import { describe, expect, it } from "vitest";
import { createBrowserLocalFixture } from "./browserLocalFixture.js";

describe("browser local fixture", () => {
  it("creates deterministic bounded fixture summaries with redactions", () => {
    const fixture = createBrowserLocalFixture({
      title: "Route 99 <script>bad()</script>",
      text: "Visible text <main>raw html</main> sk-testsecret123 hidden reasoning",
    });

    expect(fixture.fixtureId).toContain("fixture:");
    expect(fixture.safeTextSummary).not.toContain("<main>");
    expect(fixture.safeTextSummary).not.toContain("sk-testsecret123");
    expect(fixture.safeTextSummary).not.toMatch(/hidden reasoning/i);
    expect(fixture.redactions).toEqual(
      expect.arrayContaining(["raw-html", "secret-looking-content", "hidden-reasoning"]),
    );
    expect(fixture.allowedActions).toEqual(["observe", "extract", "navigate-local"]);
  });
});
