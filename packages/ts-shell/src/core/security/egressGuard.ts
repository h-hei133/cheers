import { isIP } from "node:net";

/**
 * Which hosts are not publicly routable, and why.
 *
 * The rules live here once, as data, because they were four copies before being
 * consolidated and a rule present in three of them is not a rule — the fourth is
 * the bypass. Two policies read the same table and differ only in which classes
 * they refuse:
 *
 *   - `blockedHostReason` refuses every class, which is what the web fetcher
 *     wants: it reaches the public web only, and to it loopback is an SSRF
 *     target with no legitimate reading.
 *   - `classifyBlockedHost` reports the class, so a caller with a different
 *     purpose can refuse the ones it means to. The browser tool is that caller:
 *     opening a local page is its subject matter, so it allows loopback and
 *     refuses metadata, private and link-local addresses.
 *
 * Adding a class here therefore reaches both without a second table to keep in
 * step, and a new caller states its policy rather than copying the rules.
 *
 * Every class `blockedHostReason` refuses, and why each one earns its place:
 *
 *   - Loopback, so a fetched URL cannot reach a service that trusts anything
 *     running on the same machine — a local admin port, a database, an MCP
 *     sidecar listening on 127.0.0.1.
 *   - The RFC 1918 ranges, for the rest of the private network behind them.
 *   - Link-local, which is where cloud providers publish instance metadata.
 *     `169.254.169.254` returns the instance's temporary credentials to anything
 *     that can reach it, which makes an unfiltered fetch a credential-theft
 *     primitive rather than merely an awkward request.
 *   - `0.0.0.0`, which on Linux means the local host.
 *   - Carrier-grade NAT, which is where many cloud and mobile networks put
 *     addresses that are not public even though they look routable.
 *
 * IPv6 is handled by range rather than by string prefix. The previous version of
 * this check compared the whole hostname against `::1` and left everything else
 * uncovered, which meant `fd00:ec2::254` — the IPv6 metadata endpoint on AWS, the
 * exact counterpart of `169.254.169.254` — read as public. Matching a range
 * prefix is the only honest way to answer for an address family whose notation
 * compresses runs of zeros: `::1` and `0:0:0:0:0:0:0:1` are the same address and
 * only one of them was in the list.
 *
 * Scope, stated so the next reader does not over-trust it: this decides from the
 * hostname, without resolving it. A public name that resolves to a private
 * address is not caught here, and neither is a name that changes what it resolves
 * to between the check and the connection. A caller that must be safe against
 * those needs to re-check after connecting, which is why `blockedHostReason`
 * reports the rule that fired rather than only that one did: a caller that
 * cannot re-check should say which limit it accepted, and a caller deciding by
 * class needs `classifyBlockedHost` rather than a sentence to match on.
 *
 * The list above describes the refusing policy. `blockedBrowserHostReason`
 * allows loopback out of it, for the reason given at the top.
 */

/**
 * How a host is refused, by what it is rather than by the sentence shown.
 *
 * The class is what a caller decides on; the reason is what a reader is told.
 * Splitting them is what lets the browser tool allow loopback while the fetcher
 * refuses it, without either one restating the ranges.
 */
export type BlockedHostClass =
  | "loopback"
  | "private"
  | "metadata"
  | "unspecified"
  | "multicast"
  | "documentation"
  | "search-domain";

interface BlockedHostRule {
  readonly reason: string;
  readonly class: BlockedHostClass;
}

/** Loopback, private, link-local, CGNAT and unspecified ranges, by family. */
const BLOCKED_IPV4: readonly (BlockedHostRule & { test: (first: number, second: number) => boolean })[] = [
  { test: (first: number) => first === 0, reason: "unspecified address", class: "unspecified" },
  { test: (first: number) => first === 127, reason: "loopback address", class: "loopback" },
  { test: (first: number) => first === 10, reason: "private address", class: "private" },
  { test: (first: number, second: number) => first === 172 && second >= 16 && second <= 31, reason: "private address", class: "private" },
  { test: (first: number, second: number) => first === 192 && second === 168, reason: "private address", class: "private" },
  // Link-local is separated from `private` because it is where cloud providers
  // publish instance credentials. A caller that has a reason to allow a LAN
  // still has no reason to allow the metadata endpoint.
  { test: (first: number, second: number) => first === 169 && second === 254, reason: "link-local address", class: "metadata" },
  { test: (first: number, second: number) => first === 100 && second >= 64 && second <= 127, reason: "carrier-grade NAT address", class: "private" },
];

/**
 * IPv6 ranges that are not publicly routable.
 *
 * Matched on the first group for the documented special-purpose prefixes, and by
 * a prefix test for the two that are defined as ranges within a group:
 * `::ffff:0:0/96` (IPv4-mapped, whose payload is then checked as IPv4) and
 * `2001:db8::/32` (documentation).
 */
const BLOCKED_IPV6_GROUP0 = new Map<string, BlockedHostRule>([
  ["::", { reason: "unspecified address", class: "unspecified" }],
  ["::1", { reason: "loopback address", class: "loopback" }],
  ["fc", { reason: "unique local address", class: "private" }],
  ["fd", { reason: "unique local address", class: "private" }],
  ["fe8", { reason: "link-local address", class: "metadata" }],
  ["fe9", { reason: "link-local address", class: "metadata" }],
  ["fea", { reason: "link-local address", class: "metadata" }],
  ["feb", { reason: "link-local address", class: "metadata" }],
  ["ff", { reason: "multicast address", class: "multicast" }],
]);

function parseIpv4(hostname: string): number[] | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    octets.push(value);
  }
  return octets;
}

/** Expand an IPv6 literal to its eight 16-bit groups, or nothing if malformed. */
function expandIpv6(hostname: string): number[] | undefined {
  let text = hostname;
  // A zone index (`fe80::1%eth0`) names an interface, not part of the address.
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (text.includes(".")) {
    // Trailing IPv4 in the last 32 bits.
    const lastColon = text.lastIndexOf(":");
    const octets = parseIpv4(text.slice(lastColon + 1));
    if (!octets) return undefined;
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${text.slice(0, lastColon)}:${high}:${low}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const toGroups = (part: string): number[] | undefined => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const piece of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return undefined;
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? "");
  if (!head) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const tail = toGroups(halves[1] ?? "");
  if (!tail) return undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return undefined;
  return [...head, ...new Array(missing).fill(0), ...tail];
}

/**
 * What kind of non-public host `hostname` is, or nothing when it is public.
 *
 * The one place the ranges are consulted. Both policies are built on this, so a
 * rule added to the tables above reaches both of them.
 */
export function classifyBlockedHost(
  hostname: string,
): { readonly reason: string; readonly class: BlockedHostClass } | undefined {
  // A trailing dot is the fully-qualified form of the same name — `localhost.`
  // resolves to ::1 exactly like `localhost`, and `127.0.0.1.` is the same
  // address — so it is stripped before any rule reads the host. Judging the
  // dotted form as a different host is the bypass: every rule below would
  // mis-read a name the resolver treats as identical.
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (host === "") return { reason: "empty host", class: "search-domain" };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { reason: "loopback name", class: "loopback" };
  }
  if (host.endsWith(".local")) return { reason: "local network name", class: "search-domain" };
  // A single label with no dot is resolved by search domains, and a search domain
  // routinely points inside the network, so it is not a public name.
  if (!host.includes(".") && !host.includes(":")) {
    return { reason: "bare hostname for a private search domain", class: "search-domain" };
  }

  const bracketless = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  const family = isIP(bracketless);
  if (family === 4) {
    const octets = parseIpv4(bracketless);
    if (!octets) return undefined;
    for (const rule of BLOCKED_IPV4) {
      if (rule.test(octets[0]!, octets[1]!)) return { reason: rule.reason, class: rule.class };
    }
    return undefined;
  }

  if (family === 6) {
    const groups = expandIpv6(bracketless);
    if (!groups) return undefined;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
      number, number, number, number, number, number, number, number,
    ];
    // The two addresses that are named in full before the embedded-v4 reading is
    // tried. `::1` *is* the IPv4-compatible form of `0.0.0.1` arithmetically, but
    // it is the IPv6 loopback, and reading it as an embedded address reported it
    // as "unspecified" — a blocked address with the wrong reason, which is what a
    // caller deciding by class acts on. `::` is the unspecified address for the
    // same reason: its embedded-v4 reading is `0.0.0.0`, not the other way round.
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 0) {
      return { reason: "unspecified address", class: "unspecified" };
    }
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) {
      return { reason: "loopback address", class: "loopback" };
    }
    // IPv4-mapped and IPv4-compatible forms carry a v4 address that must be
    // judged by the v4 rules, or `::ffff:127.0.0.1` walks through the v6 check.
    const mapped4 = expandIpv4Mapped([g0, g1, g2, g3, g4, g5, g6, g7]);
    if (mapped4) {
      for (const rule of BLOCKED_IPV4) {
        if (rule.test(mapped4[0]!, mapped4[1]!)) {
          return { reason: `${rule.reason} (IPv4-mapped)`, class: rule.class };
        }
      }
      return undefined;
    }
    const firstText = g0.toString(16);
    // `fd00:ec2::/64` is the IPv6 instance-metadata prefix, the counterpart of
    // `169.254.169.254`. It sits inside unique-local space, so it has to be
    // recognised before the ULA rule or it would read as an ordinary LAN
    // address and inherit the LAN's allowance.
    if (g0 === 0xfd00 && g1 === 0x0ec2) {
      return { reason: "instance metadata address", class: "metadata" };
    }
    if ((g0 & 0xfe00) === 0xfc00) return { reason: "unique local address", class: "private" };
    // `fe80::/10` is the IPv6 counterpart of `169.254/16`, including the EC2
    // metadata address `fd00:ec2::254`'s neighbours on the link.
    if ((g0 & 0xffc0) === 0xfe80) return { reason: "link-local address", class: "metadata" };
    if ((g0 & 0xff00) === 0xff00) return { reason: "multicast address", class: "multicast" };
    if (g0 === 0x2001 && g1 === 0x0db8) {
      return { reason: "documentation address", class: "documentation" };
    }
    for (const [prefix, entry] of BLOCKED_IPV6_GROUP0) {
      if (prefix.length > 1 && firstText === prefix) return entry;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Why `hostname` must not be reached, or nothing when it may be.
 *
 * The public-web policy: every non-public class is refused. A reason rather than
 * a boolean because the caller has to say something useful — "blocked" with no
 * explanation is the failure mode where a user cannot tell an address rule from a
 * DNS failure.
 */
export function blockedHostReason(hostname: string): string | undefined {
  return classifyBlockedHost(hostname)?.reason;
}

/**
 * The browser policy: what a page navigation may reach.
 *
 * Loopback is allowed and everything else non-public is not. The two differ
 * because the tools differ: a fetcher reading a public page has no legitimate
 * use for `127.0.0.1`, while a browser session opened on a local development
 * server is the ordinary case and the tool says so in its own description.
 *
 * Metadata and link-local stay refused here. Nothing is gained by a page load
 * from `169.254.169.254`, and it hands out instance credentials to whoever asks.
 */
export function blockedBrowserHostReason(hostname: string): string | undefined {
  const blocked = classifyBlockedHost(hostname);
  if (!blocked) return undefined;
  if (blocked.class === "loopback") return undefined;
  return blocked.reason;
}

function expandIpv4Mapped(groups: readonly number[]): number[] | undefined {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
    number, number, number, number, number, number, number, number,
  ];
  const leadingZeros =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0 || g5 === 0xffff);
  if (!leadingZeros) return undefined;
  return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
}

/** Whether `hostname` is one a request must not be sent to by default. */
export function isBlockedHost(hostname: string): boolean {
  return blockedHostReason(hostname) !== undefined;
}
