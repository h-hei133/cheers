# Daily Workflows

## Inspect current workflow state

```bash
npm run workflow:status
```

This shows:
- current branch
- repo root
- whether the workspace is clean
- known worktrees

## Create an isolated worktree

```bash
npm run worktree:create -- <branch-name> <target-path>
```

Example:

```bash
npm run worktree:create -- feature/my-task ../my-task-worktree
```

Then enter the new worktree and run:

```bash
npm run setup
```

## Recommended daily loop

1. `npm run workflow:status`
2. Create or enter a feature worktree
3. `npm run setup`
4. `npm start`
5. `npm run build`
6. `npm test`

## PR preparation loop

1. `npm run workflow:status`
2. Confirm you are on a feature branch/worktree, not a dirty main branch
3. `npm run build`
4. `npm test`
5. Review `npm run audit:recent` if your task touched escalation-sensitive operations
6. Capture the branch/worktree context before opening a PR
