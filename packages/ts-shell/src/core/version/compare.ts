/**
 * Comparing release versions.
 *
 * Written here rather than pulled in, because the whole of what this needs is
 * three numbers and a comparison. A semver package carries range parsing,
 * caret and tilde operators, prerelease ordering rules and a build-tag grammar,
 * none of which a release check uses — it compares one published version against
 * one installed version and asks which is newer.
 *
 * What it does keep is the part that matters: a version that is not the shape
 * this understands is reported as uncomparable rather than guessed at. Treating
 * an unparsable string as older would prompt an update to something already
 * installed, and treating it as newer would hide a real one.
 */

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  /** The prerelease tag, when there is one. A release outranks its prereleases. */
  readonly prerelease?: readonly string[];
}

/**
 * The three numeric parts and an optional prerelease tag.
 *
 * Deliberately strict: a leading `v`, an optional prerelease after `-`, and
 * nothing else. A version that does not match is not this shape, and the caller
 * is told so rather than handed a number that came from somewhere in the middle
 * of the string.
 */
const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseVersion(value: string): ParsedVersion | undefined {
  const match = VERSION_PATTERN.exec(value.trim());
  if (!match) return undefined;
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(prerelease ? { prerelease: prerelease.split(".") } : {}),
  };
}

/**
 * Which of two versions is newer: positive when `candidate` is, negative when it
 * is older, zero when they are the same.
 *
 * `undefined` when either side is not a version this understands. The caller
 * decides what to do about that, because the two plausible defaults point in
 * opposite directions and only the caller knows which mistake is worse.
 */
export function compareVersions(candidate: string, current: string): number | undefined {
  const left = parseVersion(candidate);
  const right = parseVersion(current);
  if (!left || !right) return undefined;

  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

/**
 * Prerelease ordering, following the convention every package manager uses.
 *
 * A version with no prerelease tag outranks the same version with one: `1.0.0`
 * is the release that `1.0.0-beta.1` was leading up to. Between two prereleases,
 * numeric segments compare as numbers and everything else compares as text, so
 * `beta.10` sorts after `beta.9` rather than before it as a string would.
 */
function comparePrerelease(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    // A shorter set of segments is the smaller one: `beta` precedes `beta.1`.
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;
    const aNumber = /^\d+$/.test(a);
    const bNumber = /^\d+$/.test(b);
    if (aNumber && bNumber) return Number(a) - Number(b);
    // Numeric segments rank below alphanumeric ones, which is the rule that
    // keeps `1.0.0-1` below `1.0.0-alpha`.
    if (aNumber) return -1;
    if (bNumber) return 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

/** Whether `candidate` is a version worth telling the user about. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const comparison = compareVersions(candidate, current);
  // Uncomparable is not newer. Prompting an update from a string this cannot
  // read would be a prompt the user cannot act on, since the comparison it came
  // from is not one anybody can check.
  return comparison !== undefined && comparison > 0;
}
