/**
 * Record-shaped value guard shared across domains.
 *
 * This existed as thirteen copies: twelve under `browser/` (the manifests, the
 * runtime and skill protocols, the runner bindings) and one in `turn/`. Two
 * shapes circulated - `typeof value === "object" && value !== null &&
 * !Array.isArray(value)` and the equivalent `!!value && ...` - which agree on
 * every input, but a narrowing guard is exactly the kind of helper where copies
 * drift into disagreeing about `null`, arrays or primitives, and then two call
 * sites in the same call chain disagree about whether a value is a record.
 *
 * It lives in `core/values/` because it imports nothing, two feature domains
 * consume it, and it is a real shared behaviour rather than a shim.
 */

/** Whether `value` is a non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
