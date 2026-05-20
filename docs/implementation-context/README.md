# Implementation Context Pack

Route: `docs/agent-routes/route161-capability-flow-context.md`

This directory is an AI-usable wiring context for future implementation routes.
It is not an import-policing surface and it is not a replacement for current
code. Use it before adding or rewiring capability paths so the route starts
from the right owner module, facade, handoff object, and validation gate.

## Files

- `capability-flow-manifest.json`: machine-readable module, flow, contract,
  recipe, and validation map.
- `capability-flow-graph.md`: concise flow graph for the major capability
  paths.
- `capability-recipes.md`: operational recipes for common future route types.

No validator script is included in this route. The manifest stays small enough
for a JSON parse check and manual review, and adding a script would turn this
documentation/context route into a toolchain route.

## Use Order

1. Pick the capability flow in `capability-flow-manifest.json`.
2. Start in the listed owner module, not in the nearest large file.
3. Use the listed public facade when one exists.
4. Preserve the listed result, transcript, continuation, and verifier handoffs.
5. Run the focused validation gates listed for the touched flow.

## Hard Boundaries

- Do not infer write authorization from prompt text.
- Do not move provider auth/config behavior into planning, result, or verifier
  helpers.
- Do not treat runtime, browser, edit, or provider receipts as terminal
  success by themselves.
- Do not emit raw DOM, raw file dumps, secrets, provider config paths, cookies,
  authorization headers, or private real-provider-home paths in result,
  transcript, continuation, or report surfaces.
- Do not change package scripts, dependencies, CLI/session schema, provider
  gates, browser scope, edit scope, runtime execution, or result truthfulness
  from this context pack.
