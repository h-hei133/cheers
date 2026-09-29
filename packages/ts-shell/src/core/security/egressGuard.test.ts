import { describe, expect, it } from "vitest";
import { blockedBrowserHostReason, blockedHostReason, classifyBlockedHost, isBlockedHost } from "./egressGuard.js";

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

describe("host classes", () => {
  it("names the class a caller decides on, alongside the reason a reader sees", () => {
    // The class is what the browser policy acts on; the reason is what a person
    // reads. A caller that had only the sentence would have to match on prose.
    expect(classifyBlockedHost("127.0.0.1")?.class).toBe("loopback");
    expect(classifyBlockedHost("10.0.0.1")?.class).toBe("private");
    expect(classifyBlockedHost("169.254.169.254")?.class).toBe("metadata");
    expect(classifyBlockedHost("0.0.0.0")?.class).toBe("unspecified");
    expect(classifyBlockedHost("ff02::1")?.class).toBe("multicast");
    // A single label is a search-domain name; a dotted name is not decided here
    // at all, which is the documented scope — this guard reads a hostname and
    // never resolves one, so a public-looking name that points inward is not
    // caught by it.
    expect(classifyBlockedHost("intranet-host")?.class).toBe("search-domain");
    expect(classifyBlockedHost("example.com")).toBeUndefined();
  });

  it("refuses the metadata services that are reached by name", () => {
    // The address ranges cover metadata by IP; these are the names the vendors
    // document, and a name is the form a user or a page actually writes. The
    // GCP endpoint is published as `metadata.google.internal`, and it answers
    // with instance credentials to anything that can resolve it.
    expect(classifyBlockedHost("metadata.google.internal")?.class).toBe("metadata");
    expect(blockedHostReason("metadata.google.internal")).toBeDefined();
    // The fully-qualified spelling is the same host, and a check that reads it
    // as a different one is the bypass this closes.
    expect(blockedHostReason("metadata.google.internal.")).toBeDefined();
    expect(blockedHostReason("METADATA.GOOGLE.INTERNAL")).toBeDefined();
    // A public name that merely contains the label is somebody else's machine.
    expect(classifyBlockedHost("metadata.example.com")).toBeUndefined();
    expect(classifyBlockedHost("metadata")).toBeDefined();
  });

  it("keeps the metadata prefix out of the private class", () => {
    // `fd00:ec2::/64` sits inside unique-local space. Reading it as an ordinary
    // LAN address would hand it whatever allowance the LAN has, which is the
    // allowance an instance-metadata endpoint must not inherit.
    expect(classifyBlockedHost("fd00:ec2::254")?.class).toBe("metadata");
    expect(classifyBlockedHost("fd12:3456::1")?.class).toBe("private");
  });

  it("reads an IPv6 loopback as loopback, not as an embedded IPv4 address", () => {
    // `::1` is arithmetically the IPv4-compatible form of `0.0.0.1`, and the
    // embedded-address branch used to win: the address was refused, but as
    // "unspecified", which is the wrong class for any caller that switches on it.
    expect(classifyBlockedHost("::1")?.class).toBe("loopback");
    expect(classifyBlockedHost("::")?.class).toBe("unspecified");
    expect(classifyBlockedHost("[::ffff:127.0.0.1]")?.class).toBe("loopback");
    expect(classifyBlockedHost("::ffff:10.0.0.1")?.class).toBe("private");
  });
});

describe("the browser policy", () => {
  it("allows loopback, which the fetcher refuses", () => {
    // The two differ because the tools differ: a fetcher reading a public page
    // has no use for 127.0.0.1, while a browser opened on a local development
    // server is the ordinary case.
    expect(blockedHostReason("127.0.0.1")).toBeDefined();
    expect(blockedBrowserHostReason("127.0.0.1")).toBeUndefined();
    expect(blockedBrowserHostReason("localhost")).toBeUndefined();
    expect(blockedBrowserHostReason("::1")).toBeUndefined();
    // The loopback allowance is for loopback alone. A metadata name is not a
    // local development server, and the browser reaching one leaks credentials
    // just as the fetcher would.
    expect(blockedBrowserHostReason("metadata.google.internal")).toBeDefined();
  });

  it("refuses metadata, private and link-local addresses", () => {
    for (const host of ["169.254.169.254", "fd00:ec2::254", "10.0.0.1", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(blockedBrowserHostReason(host), host).toBeDefined();
    }
  });

  it("allows the public addresses the fetcher also allows", () => {
    expect(blockedBrowserHostReason("example.com")).toBeUndefined();
    expect(blockedBrowserHostReason("2606:4700:4700::1111")).toBeUndefined();
  });
});
