# TERMINAL-UX-CONTRACT.md

## Scope

This document defines the user-visible terminal rendering contract for the default CLI path.

It is not a model quality spec and not a provider auth spec.

## Core Principles

1. Answer-first:
- user-requested answer/result appears before status metadata

2. Boundary clarity:
- answer text and result metadata are visually separated
- internal runtime/lifecycle noise is hidden in compact mode

3. Minimal actionable contract:
- keep result metadata short and decision-oriented
- avoid repeating the full answer inside result blocks

4. Truthfulness over optimism:
- blocked/incomplete tasks must not look like fully successful completion

## Rendering Modes

### Compact mode (default)

Target audience: end users in normal CLI flow.

Output shape:

1. answer
2. minimal terminal outcome (`Result: ...`)
3. minimal coding summary (`Task/Changed/Verify`)
4. optional next-step hint when available

### Verbose mode

Target audience: debugging/runtime diagnosis.

Output may include:

- lifecycle/tool/retry diagnostics
- richer coding result detail
- verification internals and blocker metadata

## Turn Boundary Contract (Interactive)

Interactive mode should provide explicit visual boundaries:

- `=== Turn N ===`
- `=== End Turn N ===`

Goal: make multi-turn live sessions scannable.

## Transport Consistency

The same rendering contract should hold across:

- interactive CLI
- `--print`
- stdin non-interactive
- `--replay-file`

Differences are allowed only when transport constraints require them.

## Failure / Blocked Contract

When task is blocked or incomplete:

- state must be explicit
- reason should be concise
- optional next action should be actionable, not verbose

## Non-goals

- not a replacement for long-term memory design
- not a replacement for provider/connect/auth documentation
- not a place for per-run transcript dumps
