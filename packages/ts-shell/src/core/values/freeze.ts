/**
 * The single recursive freeze used across domains.
 *
 * This logic was hand-copied in three incompatible shapes: a recursive form
 * that skips values that are already frozen, the same recursion without that
 * skip, and a shallow form that froze only the outermost object. The variants
 * differ in ways that matter:
 *
 * - Without the skip, walking an object that refers to itself recurses without
 *   bound and raises a RangeError. The skipping form returns.
 * - Without the skip, a structure where one child is reachable by several paths
 *   is walked once per path, which grows exponentially with depth rather than
 *   with the number of distinct nodes.
 * - A frozen value cannot change, so descending into it again is work that
 *   cannot have an effect.
 *
 * Nothing here is specific to any feature domain, and callers span twelve of
 * them, which is why it sits in `core/` rather than in whichever domain needed
 * it first.
 */

/**
 * Freezes `value` and every object reachable from it, returning the same value.
 *
 * Values that are already frozen are not descended into: freezing is permanent,
 * so their contents cannot have changed since they were frozen.
 */
export function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freezeDeep(child);
    }
  }
  return value;
}
