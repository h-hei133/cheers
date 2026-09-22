import { describe, expect, it } from "vitest";
import {
  createBrowserLocalFixtureManifest,
  serializeBrowserLocalFixtureManifest,
  validateBrowserLocalFixtureManifest,
} from "./localFixtureManifest.js";

describe("browser local fixture manifest", () => {
  it("validates a deterministic safe local fixture manifest", () => {
    const manifest = createBrowserLocalFixtureManifest({
      fixture: {
        id: "fixture:route100",
        title: "Route 100",
        url: "local-fixture://route100",
        textSummary: "Safe bounded summary.",
      },
    });

    const result = validateBrowserLocalFixtureManifest(
      JSON.parse(serializeBrowserLocalFixtureManifest(manifest)),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixture.fixtureId).toBe("fixture:route100");
      expect(result.fixture.safeUrl).toBe("local-fixture://route100");
      expect(result.evidence).toContain("browser-local-fixture-manifest:no-network");
    }
  });

  it("rejects raw HTML, secret-looking data, and unsafe capabilities", () => {
    const base = createBrowserLocalFixtureManifest();

    expect(
      validateBrowserLocalFixtureManifest({
        ...base,
        fixtures: [{ ...base.fixtures[0], textSummary: "<main>raw</main>" }],
      }).ok,
    ).toBe(false);
    expect(
      validateBrowserLocalFixtureManifest({
        ...base,
        fixtures: [{ ...base.fixtures[0], title: "sk-testsecret123" }],
      }).ok,
    ).toBe(false);
    expect(
      validateBrowserLocalFixtureManifest({
        ...base,
        sandbox: { mode: "local-fixture", capabilities: ["auth"] },
      }).ok,
    ).toBe(false);
  });

  it("rejects external network origins and non-local fixture URLs", () => {
    const base = createBrowserLocalFixtureManifest();

    expect(
      validateBrowserLocalFixtureManifest({
        ...base,
        allowedLocalOrigins: ["https://example.com"],
      }).ok,
    ).toBe(false);
    expect(
      validateBrowserLocalFixtureManifest({
        ...base,
        fixtures: [{ ...base.fixtures[0], url: "https://example.com" }],
      }).ok,
    ).toBe(false);
  });
});
