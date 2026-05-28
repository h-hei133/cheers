# Target Product Architecture

This is a target physical architecture for future migration. It is not a
current-state claim and should not be implemented in Route229.

The reset productizes the whole repository around clear ownership boundaries.
The `product/` directory shown below is a possible home for stable product
domains, not a mandate to move every capability under
`packages/ts-shell/src/product/`. Some final owners may remain in
entrypoints/app/CLI, session, runtime adapters, contracts, or other
domain-specific areas when that keeps responsibilities clearer.

## Target Top-Level Map

```text
packages/ts-shell/src/
  app/
    cli/
    interactive/
    commands/
  product/
    turn/
    context/
    provider/
    proposal/
    edit/
    verification/
    repair/
    tools/
    browser/
    mcp/
    result/
    evidence/
    session/
    policy/
  runtime/
    command/
    sandbox/
    receipts/
    daemon-client/
  adapters/
    providers/
    browser-runners/
    mcp-clients/
  shared/
    contracts/
    paths/
    redaction/
    errors/
  dev/
    harness/
    evidence-fixtures/
    route-history/
    test-utils/
```

Execution remains an explicit boundary, currently implemented mostly in
TypeScript. `packages/rust-core/src` remains the native executor candidate for
OS/process/sandbox/isolation-critical needs. `contracts` remains the
cross-runtime semantic boundary. Python eval remains outside product runtime.

## Responsibilities That Become Directories

The following should become stable product domains. They may become directories
when that is the clearest final owner, or facades/adapters when an existing
domain directory already owns the responsibility:

- `turn`: agent turn kernel, high-level capability dispatch, turn receipts.
- `context`: context acquisition, code graph summaries, planning packets.
- `provider`: provider readiness, credential-safe status, provider adapters.
- `proposal`: proposal contracts, anchored/exact proposal validation, review.
- `edit`: workspace authority, edit plans, apply routes, patch parsing,
  readback, unsupported edit classification.
- `verification`: task-relevant verification planning and execution receipts.
- `repair`: repair proposal and repair iteration logic.
- `tools`: local tool registry, tool lifecycle, tool provenance.
- `browser`: browser capability model, receipts, replay, action policies.
- `mcp`: MCP gateway, local/external distinction, safe detail projection.
- `result`: terminal classification, blocker vocabulary, result projection.
- `evidence`: evidence rows, claims, verdicts, proof levels, report summaries.
- `session`: transcript, compact, continue, replay, session store.
- `policy`: approval, workspace, command allowlist, browser/MCP/provider
  policy vocabulary.

## Responsibilities That Remain Facades Or Contracts

Not every old module becomes a directory:

- `CapabilityLifecycleResult` style vocabulary should become a shared contract
  or facade, not a catch-all module.
- `resultMapper` behavior should become a result facade consumed by CLI/session,
  not a central dumping ground for capability-specific logic.
- Route/frozen evidence should become dev/evidence fixtures, not runtime
  directories.
- The old module atlas remains historical vocabulary, not the directory map.

## Public APIs And Internal-Only Areas

Public product APIs should be explicit:

- `product/turn/index.ts` exposes turn execution.
- `product/result/index.ts` exposes verdict and terminal projections.
- `product/evidence/index.ts` exposes evidence, claim, and report-safe shapes.
- `product/edit/index.ts` exposes supported edit operations and authority
  entrypoints.
- `product/session/index.ts` exposes session store, transcript, and
  continuation APIs.

These paths are target examples, not required destinations for compatibility
facades. Existing `src/product/*` facades from reset routes must be audited
later as either final-domain APIs or temporary shims with a named migration
target.

Internal-only files should stay behind module-local `internal/` folders or
non-exported paths. Scripts and tests should consume public facades unless they
are explicitly module-private tests.

## Evidence, Claims, And Verdicts

Evidence should be a product module:

```text
capability execution -> safe evidence rows -> claim evaluation -> verdict
projection -> result/session/CLI presentation -> optional report emission
```

Route reports should become consumers of this module, not separate sources of
truth.

## Provider, Proposal, Edit, Verification, Repair

Target dependency direction:

```text
provider -> proposal -> edit -> verification -> repair
             \                         /
              -> evidence/verdict <---
```

Important boundaries:

- Provider produces safe proposal inputs and provider receipts; it does not own
  apply authority.
- Proposal validates exactness and review state; it does not imply write
  authorization.
- Edit owns workspace authority, final stale-read, apply, and readback.
- Verification owns task-relevant command selection and execution receipts.
- Repair consumes failed verification evidence and produces a new proposal; it
  must not bypass proposal/edit authority.

## Tools, Browser, MCP, CLI, And Session

Target dependency direction:

- CLI submits user intent and presents results; it does not classify capability
  success.
- Session stores transcript and continuation facts; it does not upgrade verdicts.
- Tools, browser, and MCP produce receipts and safe observations; they do not
  become product success without verdict evaluation.
- Runtime command execution is consumed through receipt APIs, not direct process
  details.

## Harness And Eval Outside Runtime

Move dev-only infrastructure toward:

```text
scripts/
  product/
  release/
  evidence/
  provider/
  dev-history/

packages/ts-shell/src/dev/
  harness/
  route-history/
  evidence-fixtures/
```

The product runtime should not import route reports, route runners, or frozen
task files. Dev/eval tools may import product public APIs.

## Forbidden Dependency Directions

Future reset phases should forbid:

- Product runtime importing `docs/implementation-context/route*-report.json`.
- CLI/session importing capability internals when a product facade exists.
- Edit/apply modules importing CLI/session presentation helpers.
- Provider modules importing edit authority or workspace writers.
- Python eval owning TypeScript session, replay, permission, or runtime
  durability semantics.
- Rust native executor paths owning TypeScript orchestration policy.
