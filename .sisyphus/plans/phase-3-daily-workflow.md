# Phase 3 Stronger Daily Workflow Plan

## Goal

Turn the current foundation into a workflow that supports daily coding tasks with clearer git/worktree context, safer branch handling, and more realistic execution loops.

## Ordered Workstreams

- [x] 1. Git/worktree/PR workflow integration
  - Add workflow-aware doctor/status surface
  - Add safe worktree helper paths for branch-isolated work
  - Add daily git context summaries (status/diff/branch)

- [x] 2. Real coding-task execution loop hardening
  - Make task execution aware of workspace/git state
  - Improve fallback and task-state explanations during real work
  - Add workflow-oriented smoke/e2e coverage

- [x] 3. Daily workflow docs and verification
  - Document recommended branch/worktree flow
  - Document PR preparation flow
  - Add proof commands and evidence for repeatable daily use

## Phase 3.1 Immediate Deliverable

Expose enough workflow context in the shell and scripts that a daily user can quickly see:
- current branch/worktree state,
- whether the workspace is clean,
- and how to use an isolated worktree safely for task execution.
