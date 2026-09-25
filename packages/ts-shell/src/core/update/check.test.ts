import { describe, expect, it } from "vitest";
import { checkForUpdate, formatUpdateNotice } from "./check.js";
import { OFFLINE_ENV } from "../network/policy.js";

/**
 * The release check.
 *
 * It is a request this process makes on its own, so what matters most is that
 * the switch stops it — a check that ignored the switch would be exactly the
 * traffic the switch exists to prevent.
 */

function releaseResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

describe("the release check", () => {
  it("sends nothing when self-initiated requests are off", async () => {
    let called = false;
    const result = await checkForUpdate({
      env: { [OFFLINE_ENV]: "1" },
      currentVersion: "1.0.0",
      fetchImpl: async () => {
        called = true;
        return releaseResponse({});
      },
    });

    expect(called).toBe(false);
    expect(result.latest).toBeUndefined();
    // The message names the switch, so "off" is distinguishable from "broken".
    expect(result.withheld).toContain(OFFLINE_ENV);
  });

  it("reports a newer release", async () => {
    const result = await checkForUpdate({
      env: {},
      currentVersion: "1.0.0",
      fetchImpl: async () => releaseResponse({ tag_name: "v1.2.0", html_url: "https://example.test/1.2.0" }),
    });

    expect(result.latest).toBe("1.2.0");
    expect(result.url).toBe("https://example.test/1.2.0");
  });

  it("stays quiet when the installed version is current or ahead", async () => {
    const current = await checkForUpdate({
      env: {},
      currentVersion: "1.2.0",
      fetchImpl: async () => releaseResponse({ tag_name: "v1.2.0" }),
    });
    const ahead = await checkForUpdate({
      env: {},
      currentVersion: "2.0.0",
      fetchImpl: async () => releaseResponse({ tag_name: "v1.2.0" }),
    });

    expect(current.latest).toBeUndefined();
    expect(ahead.latest).toBeUndefined();
  });

  it("stays quiet when the request fails", async () => {
    // A machine with no network is not the user's problem, and a session that
    // reported it would be worse than one that quietly did not know.
    const failed = await checkForUpdate({
      env: {},
      currentVersion: "1.0.0",
      fetchImpl: async () => releaseResponse({}, false),
    });
    const threw = await checkForUpdate({
      env: {},
      currentVersion: "1.0.0",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });

    expect(failed.latest).toBeUndefined();
    expect(failed.withheld).toBeUndefined();
    expect(threw.latest).toBeUndefined();
  });

  it("asks nothing when there is no version to compare against", async () => {
    // Without a current version the answer cannot be used, so the request that
    // would fetch it is not worth sending.
    let called = false;
    const result = await checkForUpdate({
      env: {},
      currentVersion: "",
      fetchImpl: async () => {
        called = true;
        return releaseResponse({ tag_name: "v9.9.9" });
      },
    });

    expect(called).toBe(false);
    expect(result.latest).toBeUndefined();
  });

  it("reads the endpoint from the environment", async () => {
    let seen = "";
    await checkForUpdate({
      env: { CHEERS_UPDATE_ENDPOINT: "https://mirror.test/latest" },
      currentVersion: "1.0.0",
      fetchImpl: async (url) => {
        seen = String(url);
        return releaseResponse({ tag_name: "v1.0.1" });
      },
    });

    expect(seen).toBe("https://mirror.test/latest");
  });
});

describe("the notice", () => {
  it("names the version and where to read about it", () => {
    const notice = formatUpdateNotice({ latest: "1.2.0", url: "https://example.test" });
    expect(notice).toContain("1.2.0");
    expect(notice).toContain("https://example.test");
  });

  it("says nothing when there is nothing to report", () => {
    expect(formatUpdateNotice({})).toBeUndefined();
    // A withheld check is a state, not news: saying it on every startup would
    // turn a working switch into a recurring interruption.
    expect(formatUpdateNotice({ withheld: "disabled" })).toBeUndefined();
  });
});
