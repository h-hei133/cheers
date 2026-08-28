# Goal: Phase 2 - Modular Decomposition & Responsibility Ceiling Enforcement

## Context & Background
In Phase 1, we eliminated all blocking unresolved specifiers and circular dependency cycles, establishing clean boundaries and initializing the project wiki knowledge base (`.wiki/`).
In Phase 2, we tackle the responsibility ceiling norm (`declared_functions_within_module_ceiling`: $\le 20$ declared function/method names per module), focusing on decomposing oversized monolith files into structured, domain-owned sub-modules per `AGENTS.md` and `agent-rules/file-placement-and-naming.md`.

## Core Objectives & Target Batches

### Batch 1: Context & Discovery Subsystem Decomposition
- **`packages/ts-shell/src/context/discovery/scan.ts`** (currently 28 functions):
  - Split into domain sub-modules:
    - `scan.ts`: Facade & high-level coordinator (`buildRepoIntelligence`).
    - `scanner.ts`: Filesystem walking and file discovery (`discoverRepoFiles`, `readDir`, `isSupportedRepoFile`).
    - `scorer.ts`: Keyword tokenization, overlap scoring, and freshness boosts (`scorePathPriority`, `tokenize`, `countOverlap`).
    - `ranker.ts`: Candidate sorting, file role classification, and omissions (`rankRepoCandidates`, `classifyFileRole`).
- **`packages/ts-shell/src/context/readWindowContinuation.ts`** (currently 23 functions):
  - Split into:
    - `readWindowContinuation.ts`: Directive resolution facade.
    - `fingerprint.ts`: Line range compression, fingerprint computation, and reanchoring.
    - `cue.ts`: Prompt continuation cue detection.

### Batch 2: Artifacts & Workspace Models Decomposition
- **`packages/ts-shell/src/artifacts/workflow/model.ts`** (currently 22 functions):
  - Split into:
    - `model.ts`: Lifecycle projection and receipt creation.
    - `claim.ts`: Claim evidence matching and verification checks.
    - `correction.ts`: Artifact validation state, blockers, and format expectations.

### Batch 3: Core Commands & Daemon Modules Decomposition
- **`packages/ts-shell/src/core/commands/connectCommandRuntime.ts`** (currently 23 functions):
  - Split into:
    - `connectCommandRuntime.ts`: CLI command execution runner.
    - `renderer.ts`: Preset catalog, connection status, and guidance renderers.
    - `preset.ts`: Presets, auth normalizers, and argument parsers.
- **`packages/ts-shell/src/daemon/client.ts`** (currently 28 functions):
  - Split into:
    - `client.ts`: Main client interface (`executeViaRustDaemon`, `checkRustDaemonAvailability`).
    - `resident.ts`: Resident daemon process state and request queue management.
    - `protocol.ts`: Cargo discovery and daemon message serialization/deserialization.
- **`packages/ts-shell/src/orchestration/providerExactPatchContract.ts`** (currently 24 functions):
  - Split into:
    - `providerExactPatchContract.ts`: Prompt construction and high-level parse dispatch.
    - `parser.ts`: Diff extraction, unified diff parsing, and JSON object extraction.

### Batch 4: Verification & NormProof Validation
- Maintain 100% backward compatibility via re-exports on entry files.
- Run `npm run build:ts` to guarantee type safety and zero broken imports.
- Run focused domain vitest suites.
- Execute `npx --package .normproof/normproof-0.1.0.tgz normproof judge` to verify a marked reduction in proof gaps and progress toward full satisfaction.
- Update `.normproof/dispositions.md` and document architectural transformations in `.wiki/`.
