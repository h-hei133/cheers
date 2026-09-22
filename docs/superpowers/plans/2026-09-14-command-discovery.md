# E2 Command Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Unify command discovery and provide reliable command and argument completion across the interactive TUI.

**Architecture:** Extend the existing slash command registry with contribution registration, replacement, listing, and subscription. Keep execution in the existing command router; completion consumes the registry and optional argument completion callbacks without duplicating business logic. Preserve separate selector, panel, read-only output, and destructive confirmation surfaces.

**Tech Stack:** TypeScript, Vitest, existing TUI suggestion and command routing modules.

---

### Task 1: Extend command contribution contract

**Files:**
- Modify: `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- Test: `packages/ts-shell/src/entrypoints/slashCommandRegistry.test.ts`

- [ ] Add optional argument completion callback and registry lifecycle APIs while preserving static built-ins.
- [ ] Test registration, replacement, aliases, duplicate rejection, list snapshots, and subscription notifications.
- [ ] Keep registry validation deterministic and avoid mutating the built-in tuple.

### Task 2: Route completion through live registry

**Files:**
- Modify: `packages/ts-shell/src/cli/interactive/slashSuggestions.ts`
- Test: `packages/ts-shell/src/cli/interactive/slashSuggestions.test.ts`

- [ ] Subscribe completion candidates to registry changes and dispose/rebuild cached candidates on notification.
- [ ] Add argument-prefix parsing after the command name and delegate to the command contribution.
- [ ] Preserve null for ordinary text, unknown commands, and commands without argument completion.
- [ ] Test dynamic registration, aliases, argument candidates, and narrow-width detail truncation.

### Task 3: Add argument completion to high-value commands

**Files:**
- Modify: `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- Modify: `packages/ts-shell/src/cli/interactive/interactiveMode.ts`
- Test: `packages/ts-shell/src/cli/interactive/keymap.test.ts`

- [ ] Add completion providers for model, thinking, statusline, and other finite-value commands using existing runtime option sources.
- [ ] Ensure Tab inserts the selected argument without changing command execution semantics.
- [ ] Keep dynamic provider/model data behind existing runtime boundaries.

### Task 4: Align help and dispatch metadata

**Files:**
- Modify: `packages/ts-shell/src/entrypoints/slashCommandRegistry.ts`
- Modify: `packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts`
- Test: `packages/ts-shell/src/entrypoints/slashCommandRegistry.test.ts`

- [ ] Make help output and completion details consume the same command metadata.
- [ ] Audit every registered command against dispatch handling and correct concrete omissions.
- [ ] Preserve distinct output and confirmation behavior.

### Task 5: Verify and publish

**Files:** Existing changed files only.

- [ ] Run registry, completion, keymap, and interactive focused tests.
- [ ] Run TypeScript build.
- [ ] Review diff for unrelated changes and forbidden external names/tags.
- [ ] Commit and push the current branch.
