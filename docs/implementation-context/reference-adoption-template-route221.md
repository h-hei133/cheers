# Route221 Reference Adoption Template

Status: future-route protocol.

Use this template when a future route studies reference repositories. Reference
study must be targeted: inspect only the files or subsystems needed for the
current capability boundary, and do not copy implementation code mechanically.

## Reference Adoption Table

| Capability area | Reference repo | File or subsystem inspected | Pattern adopted | Local seam changed | Pattern rejected | Reason | Evidence produced |
|---|---|---|---|---|---|---|---|
| Example: task/eval harness | `inspect_ai` | `<specific file or subsystem>` | Separate task, scorer, and transcript evidence. | `<local docs/script/module>` | Full eval framework dependency. | Too broad for Route221 guard. | `<gate/report/link>` |
| Example: trajectory/result evidence | `OpenHands` | `<specific file or subsystem>` | Preserve action/observation outcome boundaries. | `<local docs/script/module>` | Runtime event protocol changes. | Out of scope for harness route. | `<gate/report/link>` |

## Required Fields

- `capability area`: The exact runtime or audit behavior being aligned.
- `reference repo`: One repo from the approved Route221 reference pool.
- `file or subsystem inspected`: A targeted path or subsystem, not a broad repo scan.
- `pattern adopted`: The semantic pattern carried into this repo.
- `local seam changed`: The local doc, script, module, or test affected.
- `pattern rejected`: What was intentionally not copied.
- `reason`: Boundary, scope, or architecture reason for rejection.
- `evidence produced`: Frozen task verdict, verifier output, focused test, or report artifact.

## Adoption Rules

- Inspect target repository code first.
- Use reference repositories only for responsibility boundaries and harness
  design.
- Keep TypeScript control-plane, Rust execution-plane, and contracts boundary
  semantics intact.
- Do not add dependencies or runtime capability just because a reference repo
  has a richer harness.
- If no reference repo was needed, state `not-inspected; local Route220 evidence
  was sufficient` in the future route report.
