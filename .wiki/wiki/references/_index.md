# References Index

> Component specifications, contract definitions, and reference project comparisons.

Last updated: 2026-11-23

## Contents

| File | Summary | Tags | Updated |
|------|---------|------|---------|
| [codex-and-frontier-gap-audit-2026-11.md](codex-and-frontier-gap-audit-2026-11.md) | 对照 Codex（`4210c08def`）、OMP（`e1a9f4b41d`）、Claude Code `Code Mode`、DeepSeek Harness（`2e39e70496`）/`dsh-superagent-prototype`（`8c32a9dc`）与 NormProof（`ea50541`）对 Cheers（`f65ba979`）的深度源码审计：定位 `/model` 9,197 模型膨胀与 `models.json` 多连接失效、10 项 Prompt Caching 缺陷、`codemode` 安全/UX 缺口、配置格式 YAML 选型与保注释方案，及 Codex/DeepSeek 体验差距。 | references, codex, omp, claude-code, deepseek-harness, model-picker, prompt-caching, codemode, config-format, yaml, ux, audit | 2026-11-23 |
| [cheers-next-phase-roadmap-2026-11.md](cheers-next-phase-roadmap-2026-11.md) | 基于 2026-11-23 联合审计整理的 Cheers 下一阶段演进排期（Batch 0 → 0.5 → 1–4）：`/model` 重构与止血 → 人类配置 YAML 化与 CST 保注释写回 → Prompt Caching 对齐 Codex → Code Mode 安全与 TUI 闭环 → 日常体验减法与轻量守卫 → 分发闭环与 Cheers × NormProof 外部工作区融合。 | references, roadmap, codex, omp, config-format, yaml, prompt-caching, model-picker, codemode, normproof, ux | 2026-11-23 |
| [runtime-upgrade-review-2026-11.md](runtime-upgrade-review-2026-11.md) | 最近运行时升级的生产消费者、实际断链修复、原生命令与交互验证，以及仍未完成或未测量的能力边界。 | runtime, review, tools, extensions, providers, verification | 2026-11-14 |
| [local-reference-repositories.md](local-reference-repositories.md) | Comparative architecture reference matrix mapping local projects in ~/projects/ to candidate subsystems in cheers. | references, pi, opencode, gitnexus, stagehand, mem0, graphiti, inspect_ai, mini-swe-agent | 2026-08-28 |
| [pi-vs-cheers-deep-gap-analysis-2026-11.md](pi-vs-cheers-deep-gap-analysis-2026-11.md) | 对照 Pi 最新演进（截至 2026-11-13）对 Cheers 进行的严格源码审计：揭示 Cheers 在 Prompt Cache 命中率、工具截断、微压缩冲突、CodeMode、扩展运行时与模块化架构上的 8 大核心差距及优先级改造路线。 | references, pi, gap-analysis, prompt-caching, tools, compaction, codemode, durable, chord | 2026-11-13 |
| [pi-vs-cheers-full-audit-2026-11.md](pi-vs-cheers-full-audit-2026-11.md) | 扩展至全仓范围（Pi 12 包 + p2/p2-mac 对比 Cheers 37+ 子域）的严格源码审计：揭露 380dcc58 已修与未接通/空桩项、TUI/协议/Unicode 缺口、pi-durable/chord 事务代差、远程 env 守护进程、SDK/扩展/RPC/HTML 导出差距与单包水平膨胀。 | references, pi, gap-analysis, monorepo, tui, durable, chord, env, sdk, extensions, rpc, providers | 2026-11-13 |
| [pi-parity-prioritized-roadmap-2026-11.md](pi-parity-prioritized-roadmap-2026-11.md) | 在修通 380dcc58 的 4 处断链后，将全仓剩余 Pi 差距按 P0–P3 排定优先级，明确划分为可合并执行的耦合批次（Batch A–F）与必须隔离爆炸半径的独立轨道（Track 1–6）。 | references, pi, roadmap, priority, batches, tracks, ts-shell | 2026-11-13 |

## Recent Changes

- 2026-11-23: Added Codex / Claude Code Mode / DeepSeek Harness comparative audit (`codex-and-frontier-gap-audit-2026-11.md`) and prioritized next-phase roadmap (`cheers-next-phase-roadmap-2026-11.md`)
- 2026-11-14: Added runtime upgrade review and repair evidence
- 2026-08-28: Compiled local-reference-repositories comparison matrix
- 2026-11-13: Compiled pi-vs-cheers-deep-gap-analysis-2026-11 reference audit
- 2026-11-13: Compiled pi-vs-cheers-full-audit-2026-11 reference article
- 2026-11-13: Compiled pi-parity-prioritized-roadmap-2026-11 execution roadmap
