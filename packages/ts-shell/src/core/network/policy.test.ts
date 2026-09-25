import { describe, expect, it } from "vitest";
import { OFFLINE_ENV, allowsSelfInitiatedRequests, isOffline, offlineReason } from "./policy.js";

/**
 * The switch that stops this process making unasked requests.
 *
 * Both directions are asserted, because the failure that matters is silent:
 * traffic that should have been withheld and went out anyway. A test that only
 * checked the off case would pass while the gate did nothing.
 */
describe("the network policy", () => {
  it("allows self-initiated requests when nothing was said", () => {
    expect(isOffline({ env: {} })).toBe(false);
    expect(allowsSelfInitiatedRequests({ env: {} })).toBe(true);
    expect(offlineReason({ env: {} })).toBeUndefined();
  });

  it("withholds them when the switch is set", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      expect(isOffline({ env: { [OFFLINE_ENV]: value } })).toBe(true);
      expect(allowsSelfInitiatedRequests({ env: { [OFFLINE_ENV]: value } })).toBe(false);
    }
  });

  it("reads a disabled value as off rather than on", () => {
    // `CHEERS_OFFLINE=0` is how someone turns off a variable they exported
    // earlier. Treating any non-empty string as true would make it mean the
    // opposite of what it says.
    for (const value of ["0", "false", "no", "off", ""]) {
      expect(isOffline({ env: { [OFFLINE_ENV]: value } })).toBe(false);
    }
  });

  it("honours the setting when the environment says nothing", () => {
    expect(isOffline({ env: {}, configuredOffline: true })).toBe(true);
    expect(isOffline({ env: {}, configuredOffline: false })).toBe(false);
  });

  it("lets the environment override the setting in both directions", () => {
    // The variable is set for one command and the file is what the user lives
    // with, so the narrower statement wins.
    expect(isOffline({ env: { [OFFLINE_ENV]: "1" }, configuredOffline: false })).toBe(true);
    expect(isOffline({ env: { [OFFLINE_ENV]: "0" }, configuredOffline: true })).toBe(false);
  });

  it("withholds a refresh that nobody asked for, like any other", () => {
    // The cache refresh is the case this predicate exists for: it is a request
    // the harness decides to make, so it answers to the switch rather than
    // bypassing it because it is invisible to the user.
    expect(allowsSelfInitiatedRequests({ env: { CHEERS_OFFLINE: "1" } })).toBe(false);
    expect(allowsSelfInitiatedRequests({ env: {} })).toBe(true);
  });

  it("names the switch that turned it off", () => {
    // A feature that quietly does nothing is indistinguishable from one that is
    // broken, so the reason has to say where the switch is.
    expect(offlineReason({ env: { [OFFLINE_ENV]: "1" } })).toContain(OFFLINE_ENV);
    expect(offlineReason({ env: {}, configuredOffline: true })).toContain("offline");
  });
});
