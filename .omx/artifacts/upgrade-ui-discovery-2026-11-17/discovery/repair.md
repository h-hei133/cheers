# C.8 repair handoff

The main agent reproduced `red.json`: 22 cases, 17 passed, five failed. Its classification identified three actual retained-SDK-schema failures: the generation did not change; an old gated snapshot executed once; a prepared effect executed once after ordinary approval had awaited. The remaining two failures were visibility-fixture expectation drift, because `archive_lookup` legitimately ranked `permitted_lookup` through their common `lookup` term. This worker did not execute that verification.

Authorized production edit is confined to `packages/ts-shell/src/core/tools/discovery/state.ts`. It removes the `WeakMap<ToolDefinition, string>` memoization and obtains `JSON.stringify([tool.description, tool.argsSchema])` at each existing fingerprint check. SDK and in-process extension schemas are mutable nested data retained by callers, so object identity is insufficient to memoize their contract.

The catalogue digest cache, sorted entries, digest contents, active set, tool pool, ingress API, routing, notification semantics and per-definition guard remain as before. Unchanged unrelated tool snapshots remain valid; the changed definition and prepared effect are rejected by the same existing guard paths once their current fingerprint differs.

This changes repeated generation-check cost to inspection of current schema bytes. Sorting and SHA-256 digest construction remain cached when content is unchanged. The main agent owns the serial large-catalogue bound measurement; no timing or passing claim is made here.

Only the applied visibility controls in `contract.test.ts` were adjusted: use unique query `archive` for exclusion and positively require query `permitted` to find the admitted control. Hidden declarations, failed load and zero hidden execution assertions remain. The original inert staged snapshots remain unchanged as pre-repair evidence.

Suggested HANDOFF rule for the main agent after successful validation: **Discovery fingerprints must follow mutable schema ownership.** SDK custom tools and inline extensions can retain nested schema references; cached object identity cannot prove the description/schema contract unchanged. Compare current contract content at generation and effect boundaries, and retain the pending-approval/preparation and unrelated-definition controls.

Status: patch ready, not verified by this worker. No tests, builds, gates, providers, or NormProof executed.
