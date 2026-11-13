# References Index

> Component specifications, contract definitions, and reference project comparisons.

Last updated: 2026-11-13

## Contents

| File | Summary | Tags | Updated |
|------|---------|------|---------|
| [local-reference-repositories.md](local-reference-repositories.md) | Comparative architecture reference matrix mapping local projects in ~/projects/ to candidate subsystems in cheers. | references, pi, opencode, gitnexus, stagehand, mem0, graphiti, inspect_ai, mini-swe-agent | 2026-08-28 |
| [pi-vs-cheers-deep-gap-analysis-2026-11.md](pi-vs-cheers-deep-gap-analysis-2026-11.md) | 对照 Pi 最新演进（截至 2026-11-13）对 Cheers 进行的严格源码审计：揭示 Cheers 在 Prompt Cache 命中率、工具截断、微压缩冲突、CodeMode、扩展运行时与模块化架构上的 8 大核心差距及优先级改造路线。 | references, pi, gap-analysis, prompt-caching, tools, compaction, codemode, durable, chord | 2026-11-13 |
| [pi-vs-cheers-full-audit-2026-11.md](pi-vs-cheers-full-audit-2026-11.md) | 扩展至全仓范围（Pi 12 包 + p2/p2-mac 对比 Cheers 37+ 子域）的严格源码审计：揭露 380dcc58 已修与未接通/空桩项、TUI/协议/Unicode 缺口、pi-durable/chord 事务代差、远程 env 守护进程、SDK/扩展/RPC/HTML 导出差距与单包水平膨胀。 | references, pi, gap-analysis, monorepo, tui, durable, chord, env, sdk, extensions, rpc, providers | 2026-11-13 |
| [pi-parity-prioritized-roadmap-2026-11.md](pi-parity-prioritized-roadmap-2026-11.md) | 在修通 380dcc58 的 4 处断链后，将全仓剩余 Pi 差距按 P0–P3 排定优先级，明确划分为可合并执行的耦合批次（Batch A–F）与必须隔离爆炸半径的独立轨道（Track 1–6）。 | references, pi, roadmap, priority, batches, tracks, ts-shell | 2026-11-13 |

## Recent Changes

- 2026-08-28: Compiled local-reference-repositories comparison matrix
- 2026-11-13: Compiled pi-vs-cheers-deep-gap-analysis-2026-11 reference audit
- 2026-11-13: Compiled pi-vs-cheers-full-audit-2026-11 reference article
- 2026-11-13: Compiled pi-parity-prioritized-roadmap-2026-11 execution roadmap
