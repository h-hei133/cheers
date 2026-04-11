# Source Runtime Invariants

Derived from parent ClaudeCode snapshot research.

## Durability / Replay

- Append user input before entering model/query loop
- Preserve tool_use/tool_result pairing even across interruption
- Treat transcript as graph/chain-aware history, not naive append-only chat text
- Keep final flush before terminal result exposure

## Bootstrap / Session Identity

- Active session identity must be an atomic tuple: `(sessionId, sessionProjectDir)`
- Keep path triad distinct:
  - `cwd` = operational working directory
  - `originalCwd` = session anchor
  - `projectRoot` = stable project identity
- Resume ordering should remain explicit:
  - load -> switch identity -> restore state/worktree -> continue

## Immediate Child-Project Implication

- Expand shell runtime context beyond `cwd`
- Stop inferring all identity from a single directory field
- Use transcript/state substrate as recovery truth, not CLI heuristics
