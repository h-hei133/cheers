import { describe, expect, it } from "vitest";
import { blockedHostReason, isBlockedHost } from "./egressGuard.js";

/**
 * The addresses that must be refused, and the ones that must not be.
 *
 * This is a security boundary, so the tests are written as the pairs that matter
 * rather than as a list of examples. A guard that refuses everything is as
 * broken as one that refuses nothing, and only the second half of each pair
 * catches that.
 */

describe("addresses that must be refused", () => {
  it("refuses loopback by name and by address", () => {
    for (const host of [
      "localhost",
      "api.localhost",
      "127.0.0.1",
      "127.1.2.3",
      "::1",
      "0:0:0:0:0:0:0:1",
      "[::1]",
    ]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
  });

  it("refuses a trailing dot, which the resolver treats as the same name", () => {
    // `localhost.` is the fully-qualified form of the same loopback name: the
    // trailing dot means "exactly this, no search suffix". Node resolves it to
    // ::1, so a guard that reads it as a different, public host is a bypass.
    for (const host of [
      "localhost.",
      "api.localhost.",
      "api.local.",
      "myhost.",
      "127.0.0.1.",
    ]) {
      expect(isBlockedHost(host), host).toBe(true);
      expect(blockedHostReason(host), host).toBeTruthy();
    }
    // A public name keeps its trailing dot and stays allowed: the dot is a
    // syntax form, not evidence of being internal.
    expect(isBlockedHost("example.com.")).toBe(false);
  });

  it("refuses the private ranges", () => {
    for (const host of ["10.0.0.1", "10.255.255.254", "192.168.0.1", "172.16.0.1", "172.31.255.1"]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
  });

  it("refuses the instance metadata address, which is the one that leaks credentials", () => {
    // The IPv4 endpoint on every major cloud.
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    // Its IPv6 counterpart on AWS, which the previous check read as public.
    expect(isBlockedHost("fd00:ec2::254")).toBe(true);
    // The rest of link-local.
    expect(isBlockedHost("169.254.0.1")).toBe(true);
    expect(isBlockedHost("fe80::1")).toBe(true);
  });

  it("refuses carrier-grade NAT, where several clouds put non-public addresses", () => {
    expect(isBlockedHost("100.64.0.1")).toBe(true);
    expect(isBlockedHost("100.127.255.255")).toBe(true);
  });

  it("refuses the unspecified address, which on Linux is the local host", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
    expect(isBlockedHost("::")).toBe(true);
  });

  it("refuses unique-local IPv6", () => {
    expect(isBlockedHost("fc00::1")).toBe(true);
    expect(isBlockedHost("fdff:ffff::1")).toBe(true);
  });

  it("refuses an IPv4 address written in IPv6 form", () => {
    // `::ffff:127.0.0.1` is loopback, and a check that only inspects the v6
    // groups would let it through.
    expect(isBlockedHost("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedHost("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedHost("::ffff:10.0.0.1")).toBe(true);
  });

  it("refuses a bare hostname, which search domains resolve inside the network", () => {
    expect(isBlockedHost("intranet")).toBe(true);
  });

  it("refuses a multicast address", () => {
    expect(isBlockedHost("ff02::1")).toBe(true);
  });

  it("says why, so a refusal is not mistaken for a network failure", () => {
    expect(blockedHostReason("169.254.169.254")).toBe("link-local address");
    expect(blockedHostReason("127.0.0.1")).toBe("loopback address");
    expect(blockedHostReason("10.1.2.3")).toBe("private address");
  });
});

describe("addresses that must be allowed", () => {
  it("allows ordinary public hosts", () => {
    for (const host of [
      "example.com",
      "api.github.com",
      "docs.rs",
      "1.1.1.1",
      "8.8.8.8",
      "2606:4700:4700::1111",
    ]) {
      expect(isBlockedHost(host), host).toBe(false);
    }
  });

  it("allows a public address that merely starts with the same digits as a private one", () => {
    // `172.15.x` and `172.32.x` are public; only 172.16–172.31 is private.
    expect(isBlockedHost("172.15.0.1")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
    expect(isBlockedHost("100.63.0.1")).toBe(false);
    expect(isBlockedHost("100.128.0.1")).toBe(false);
    // `169.253` and `169.255` are public; only 169.254 is link-local.
    expect(isBlockedHost("169.253.0.1")).toBe(false);
    expect(isBlockedHost("169.255.0.1")).toBe(false);
  });

  it("allows a public IPv4 address written in IPv6 form", () => {
    expect(isBlockedHost("::ffff:8.8.8.8")).toBe(false);
  });

  it("does not treat a public name ending in a similar word as local", () => {
    // `.local` is blocked; `local.example.com` and `example.localbusiness.com`
    // are not, and a substring test would refuse both.
    expect(isBlockedHost("local.example.com")).toBe(false);
    expect(isBlockedHost("example.localbusiness.com")).toBe(false);
  });
});

describe("inputs that are not addresses", () => {
  it("refuses an empty host rather than defaulting to allowed", () => {
    expect(isBlockedHost("")).toBe(true);
    expect(isBlockedHost("   ")).toBe(true);
    expect(blockedHostReason("")).toBe("empty host");
  });

  it("passes through a malformed literal for the caller's own URL parsing to reject", () => {
    // Not this function's job: a name that is neither a valid v4 nor a valid v6
    // is left alone here, and the URL parser refuses it before a request is made.
    expect(isBlockedHost("999.999.999.999")).toBe(false);
    expect(isBlockedHost("example..com")).toBe(false);
  });

  it("handles a zone index, which names an interface rather than an address", () => {
    expect(isBlockedHost("fe80::1%eth0")).toBe(true);
  });
});
