import { isIP } from "node:net";

/**
 * Whether a host is one a request must not be sent to by default.
 *
 * Every outbound path in this runtime needs the same answer, and the reason it
 * needs to be one function is on the record: the check lived in four copies
 * before being consolidated, and a rule present in three of them is not a rule —
 * the fourth is the bypass. So the browser allowlist, the web fetchers and the
 * egress guard all ask this.
 *
 * What it refuses, and why each one earns its place:
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
 * those needs to re-check after connecting, which is why `isBlockedHost` returns
 * a reason rather than a boolean: the caller that cannot do the second check
 * should say so.
 */

/** Loopback, private, link-local, CGNAT and unspecified ranges, by family. */
const BLOCKED_IPV4 = [
  { test: (first: number) => first === 0, reason: "unspecified address" },
  { test: (first: number) => first === 127, reason: "loopback address" },
  { test: (first: number) => first === 10, reason: "private address" },
  { test: (first: number, second: number) => first === 172 && second >= 16 && second <= 31, reason: "private address" },
  { test: (first: number, second: number) => first === 192 && second === 168, reason: "private address" },
  { test: (first: number, second: number) => first === 169 && second === 254, reason: "link-local address" },
  { test: (first: number, second: number) => first === 100 && second >= 64 && second <= 127, reason: "carrier-grade NAT address" },
];

/**
 * IPv6 ranges that are not publicly routable.
 *
 * Matched on the first group for the documented special-purpose prefixes, and by
 * a prefix test for the two that are defined as ranges within a group:
 * `::ffff:0:0/96` (IPv4-mapped, whose payload is then checked as IPv4) and
 * `2001:db8::/32` (documentation).
 */
const BLOCKED_IPV6_GROUP0 = new Map([
  ["::", "unspecified address"],
  ["::1", "loopback address"],
  ["fc", "unique local address"],
  ["fd", "unique local address"],
  ["fe8", "link-local address"],
  ["fe9", "link-local address"],
  ["fea", "link-local address"],
  ["feb", "link-local address"],
  ["ff", "multicast address"],
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
 * Why `hostname` must not be reached, or nothing when it may be.
 *
 * A reason rather than a boolean because the caller has to say something useful:
 * "blocked" with no explanation is the failure mode where a user cannot tell an
 * address rule from a DNS failure.
 */
export function blockedHostReason(hostname: string): string | undefined {
  // A trailing dot is the fully-qualified form of the same name — `localhost.`
  // resolves to ::1 exactly like `localhost`, and `127.0.0.1.` is the same
  // address — so it is stripped before any rule reads the host. Judging the
  // dotted form as a different host is the bypass: every rule below would
  // mis-read a name the resolver treats as identical.
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (host === "") return "empty host";
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback name";
  if (host.endsWith(".local")) return "local network name";
  // A single label with no dot is resolved by search domains, and a search domain
  // routinely points inside the network, so it is not a public name.
  if (!host.includes(".") && !host.includes(":")) return "bare hostname for a private search domain";

  const bracketless = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  const family = isIP(bracketless);
  if (family === 4) {
    const octets = parseIpv4(bracketless);
    if (!octets) return undefined;
    for (const rule of BLOCKED_IPV4) {
      if (rule.test(octets[0]!, octets[1]!)) return rule.reason;
    }
    return undefined;
  }

  if (family === 6) {
    const groups = expandIpv6(bracketless);
    if (!groups) return undefined;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [
      number, number, number, number, number, number, number, number,
    ];
    // IPv4-mapped and IPv4-compatible forms carry a v4 address that must be
    // judged by the v4 rules, or `::ffff:127.0.0.1` walks through the v6 check.
    const mapped4 = expandIpv4Mapped([g0, g1, g2, g3, g4, g5, g6, g7]);
    if (mapped4) {
      for (const rule of BLOCKED_IPV4) {
        if (rule.test(mapped4[0]!, mapped4[1]!)) return `${rule.reason} (IPv4-mapped)`;
      }
      return undefined;
    }
    const firstText = g0.toString(16);
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 0) {
      return "unspecified address";
    }
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) {
      return "loopback address";
    }
    if ((g0 & 0xfe00) === 0xfc00) return "unique local address";
    if ((g0 & 0xffc0) === 0xfe80) return "link-local address";
    if ((g0 & 0xff00) === 0xff00) return "multicast address";
    if (g0 === 0x2001 && g1 === 0x0db8) return "documentation address";
    for (const [prefix, reason] of BLOCKED_IPV6_GROUP0) {
      if (prefix.length > 1 && firstText === prefix) return reason;
    }
    return undefined;
  }

  return undefined;
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
