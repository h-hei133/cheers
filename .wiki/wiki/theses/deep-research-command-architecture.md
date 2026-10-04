# 网页资料收集命令

2026-10-05，Phase 18 CMD-09 修正：旧稿将计划中的多智能体研究与实际模板抓取混为一谈，其外部产品机制断言未核实，不再作为实现依据。

当前主命令为 `/web-research <topic>`，`/deep-research`、`/research`、`/deep` 保留为兼容别名。

- 命令适配器：`packages/ts-shell/src/core/commands/deepResearchCommandRuntime.ts`。
- 收集：`packages/ts-shell/src/core/research/collector.ts` 复用现有 web_search、web_fetch 与有界调度器。两个固定查询，每个最多三个 URL，片段标识归一后去重抓取，最多两个并发抓取。
- 结果契约：`packages/ts-shell/src/core/research/types.ts` 区分搜索 completed/failed、网页 collected/empty/failed。失败响应不形成摘录，报告不保留原始错误正文。
- 展示：`packages/ts-shell/src/core/research/renderer.ts` 逐 URL 展示最多五条完整行（25–1000字符），保持否定词及原文，不将相似句子合并为共识。

它提供待阅读资料，无模型生成查询、语义综述、事实核验或来源独立性证明。不同 URL 可能指向同一出版者或转载；重定向后的相同内容也不保证去重。长行、短行及抓取工具的空内容提示不作为摘录；无合格摘录不代表页面不存在。

旧树搜索、投票聚类和报告生成器已移除。收集仍使用原有网页工具及其网络边界，不新增模型调用或持久化系统。

## 验证入口

`packages/ts-shell/src/core/research/collector.test.ts` 覆盖失败、空内容、重复 URL、矛盾摘录、数量上限和兼容别名。
`packages/ts-shell/src/cli/print/research.test.ts` 使用编译 CLI 与进程内合成 HTTP 响应，验证两个命令入口、抓取去重与失败展示；不代表真实互联网或真实模型验收。
