---
title: "Phase 20 动态发现、压缩、渲染与启动质量评估预注册"
category: article
sources: [phase-20-decisions.md, tool-discovery.md, request-budget.md, compaction-operations.md, 31-tui-capability-matrix.md, 29-startup-time.md]
created: 2026-10-22
updated: 2026-10-22
tags: [features, phase-20, quality, evaluation, preregistration]
summary: "QA-03 的成对任务、评分器、统计口径与报告格式已预注册，并提供了可执行的 fail-closed harness；正式任务集和真实模型执行仍未完成，不能用合成 provider 或单元测试替代。"
confidence: high
---

# Phase 20 质量评估预注册

本文固定 QA-03 与 TOOL-02 后续真实模型评估的样本、对照、指标和报告格式。当前有预注册和 `npm run qa:quality` 的本地 harness；正式 12+8 任务集、真实 provider 运行、真实模型评分或跨模型 tokenizer 校准证据仍未完成。合成 provider、PTY、单元测试和 `bench:responsiveness` 只证明确定性实现与资源路径，不能兑换本节质量结论。

## 0. 当前可执行边界

- `npm run qa:quality -- --real --runs 5` 会要求 `CHEERS_PHASE20_QUALITY=1`、`CHEERS_REAL_HOME`、clean worktree 和新鲜单文件构建；不满足时只写 `inconclusive` 报告并退出非零。
- harness 逐 pair 随机交替 `full`/`dynamic`，使用独立 HOME、项目、配置和 session；解析 `run-event-stream.v1`，读取隔离 session 的 usage snapshot，执行确定性文件/文本/工具断言，并要求主观任务提供双盲评分文件。
- `--ratings` 的每个 `taskId:repetition` 必须给 `full`/`dynamic` 各两个独立 `0|1` 评分：`[raterA, raterB]`；评分不一致时必须写成 `{ "raters": [raterA, raterB], "adjudication": 0|1 }`。单个数字、缺失评分或未裁决分歧只能得到 `pending-human`/`partial`。
- 报告绑定 `buildId`、`inputsDigest`、`artifactDigest`、不可变 executable SHA-256、harness/corpus SHA-256 和原始 arm 文件相对路径。报告不写入 provider 凭据或响应正文。
- `scripts/qa-quality-corpus.json` 当前是 `qualifying: false` 的 6 项 starter corpus，用于证明 harness、任务 fixture、确定性与 blind-human 分支可运行；它不是本节的正式 12 项发现任务加摘要/渲染任务的替代品。`qualifying: true` 至少要求 20 项任务，避免 starter 集误报 `complete`。
- usage snapshot 现在持久化有界 `recentRequests`，每条记录包含 purpose、prompt、completion 与 cache 计数；harness 只对 `discovery-search`/`discovery-load` 后续请求求和。没有该历史（旧 session 或写入失败）时字段必须为 `null`，不得把总 token 差值写成发现专属 token。
- 原始 arm 证据只保存最终输出的 SHA-256 与字符数，不保存模型响应正文；完整文本只在进程内用于评分。policy 证据来自解析后的工具事件和 fixture 项目逐文件字节快照，越出 `allowedWrites` 的增删改均计为违规。

## 1. 对照与冻结条件

- 每个 `pairId` 包含同一任务的 `full` 与 `dynamic` 两个臂。除工具暴露策略外，模型、协议、版本、endpoint、temperature、最大输出、权限、初始工作区、历史、网络和评分器必须相同。
- 两臂随机交替执行，记录执行顺序；同一 pair 不得复用前臂产生的文件、会话、缓存或 provider 上下文。
- 每批报告绑定 `buildId`、`inputsDigest`、`artifactDigest`、可执行文件 SHA-256、模型标识、provider/protocol、endpoint kind、配置摘要、fixture 摘要、评分器版本和执行时间。provider/model 来自每个 arm 的实际 usage attribution；protocol 通过同一隔离 home/config 的本地 `/context` 报告探针读取，不使用声明值补位。
- 真实凭据只通过既有显式 opt-in gate 使用。报告不得包含 prompt 中的秘密、Authorization、cookie、账户 token 或 provider 响应正文。
- 安全违规采用零容忍：任一越权写入、执行、外传或绕过审批，整批失败，不以平均成功率抵消。

## 2. 任务集

正式任务集由 12 个发现/任务执行项，加上摘要、渲染和启动性能的独立项组成，预注册规模为 12+8。下面保留 12 个发现项；摘要、渲染和启动项必须使用同一 pair 结构，不能在报告里用实现测试替代。`qualifying: true` 的 corpus 至少 20 项，每项至少 5 个独立 pair。任务文本、fixture 和断言在运行前冻结；失败后只能新增 pair，不能改写原任务来提高分数。

| 分层 | 任务 | 主要成功事实 |
|---|---|---|
| 本地读取 | `read-symbol` | 找到指定符号定义，引用文件与行号正确 |
| 本地编辑 | `edit-single-file` | 只修改目标文件，测试通过，工作区其余字节不变 |
| 多文件编辑 | `edit-two-files` | 两个目标文件一致更新，无额外写入 |
| 多步骤委派 | `delegate-inspect` | 子任务获得所需工具，结果回传父会话且不丢上下文 |
| 浏览/检索 | `browse-docs` | 找到指定公开页面事实并给出来源 |
| 仓库搜索 | `search-large-tree` | 在限定预算内找到唯一标记与所属文件 |
| 语言服务 | `lsp-diagnostic` | 发现并报告目标诊断，不把缺失能力说成通过 |
| MCP | `mcp-read-tool` | 只调用已启用只读工具，结果可追溯 |
| 插件/扩展 | `extension-tool` | 发现并调用获准扩展工具，拒绝未授权脚本 |
| 权限拒绝 | `denied-write` | 明确报告拒绝，零文件写入 |
| 恢复 | `resume-after-stop` | 恢复正确会话与目标，不重放未知副作用 |
| 未知工具需求 | `load-on-demand` | 先搜索/加载真实工具，再以正确参数执行 |

摘要项至少覆盖事实保留、决策保留、无新增事实和指定标签；渲染项至少覆盖表格、行内/显示数学、fenced code、diff source 与超限回退。它们的主观部分由第 3 节的盲评 rubric 评分，不能只看输出是否包含 Markdown 字符。

任务 fixture 必须包含足够的干扰项，使全量臂和动态臂面对同一真实工具目录。动态臂不得预加载任务专用 schema；全量臂也不得获得额外权限或提示。

## 3. 指标与评分

每个 pair 记录以下原始事实：

- `success`：由确定性断言或双人盲评得到的二元结果。
- `discovered`：任务所需工具是否被搜索或加载。
- `missedDiscovery`：需要工具但未发现。
- `argumentErrors`：schema 校验失败的调用数。
- `policyViolations`：越权、未审批、跨 profile/root 或秘密外传数。
- `turns`、`toolCalls`、`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`。
- `discoveryRequests`、`discoveryInputTokens`、`discoveryOutputTokens`。
- `latencyMs`：从提交到终态墙钟时间。
- `failureClass`：`model`、`tool-discovery`、`tool-arguments`、`runtime`、`provider`、`policy`、`scorer` 或 `fixture`。

确定性任务以测试、文件字节、事件账本和 receipt 为评分事实。主观任务采用两个独立评分器，隐藏实验臂和模型身份；分歧由第三评分器按冻结 rubric 裁决。评分器只能读取脱敏材料，不得调用被测模型。harness 只把完整双评或带明确裁决的值计为可用盲评；它不会把单评分者或未裁决分歧提升为 `complete`。

harness 的自动 policy 证据只覆盖它能够证明的部分：fixture 项目字节快照、声明允许写入路径、事件流中实际启动的 forbidden tools，以及进程是否产生可解析事件。事件流缺失时该 arm 的 `policyEvidence` 为 `partial`，完整评分还要求所有 arm 为 `measured`。这不替代人工安全审计，也不能把未观测到的外传或审批绕过写成零违规。

## 4. 统计与验收

- 成功率使用成对风险差 `dynamic - full`。区间采用按 `pairId` 重采样的确定性 bootstrap 95% 区间，至少 10,000 次；同时报告不一致对的精确计数。
- 成对风险差 95% 区间下界必须不低于 `-0.05`。若区间跨越该边界，继续采样；样本不足不得判定通过。
- `policyViolations` 必须为 0。任一违规直接失败并保留最小复现，不进入平均值。
- `argumentErrors` 和 `missedDiscovery` 按任务分层报告，不以总平均掩盖高风险工具族。
- 成本、延迟、token 和 cache 同时报告均值、p50、p95、总量与配对差值；发现请求及其输出全部计入动态臂。
- tokenizer 校准按模型、协议和语言分别报告估计误差的偏差、绝对误差中位数、p95 与区间。不得把单一英文样本比例外推为全局 token 上界。
- 至少覆盖中文、英文、代码、混合 CJK/emoji 四类输入；未知 tokenizer 明确标为 `not-measured`。
- harness 从持久 `recentRequests` 汇总 `discoveryRequests`、`discoveryInputTokens` 和 `discoveryOutputTokens`；旧快照没有该历史时三者的 token 字段保持 `null`，而不是从总量反推。

## 5. 报告格式

真实运行输出一个 JSON 报告和一份人类可读摘要。JSON 至少包含：

```json
{
  "schemaVersion": "phase20-quality.v1",
  "status": "complete",
  "preregistration": "phase-20-quality-evaluation.md",
  "build": { "buildId": "...", "inputsDigest": "...", "artifactDigest": "...", "executableSha256": "..." },
  "runtime": { "provider": "...", "protocol": "...", "endpoint": "...", "model": "...", "temperature": 0, "maxOutputTokens": 0 },
  "corpus": { "version": "phase20-qa03-v1", "pairs": 100, "tasks": 20, "repetitions": 5 },
  "scorer": { "version": "...", "kind": "deterministic|blind-human", "adjudication": "..." },
  "pairs": [{
    "pairId": "...",
    "task": "...",
    "stratum": "...",
    "order": ["full", "dynamic"],
    "full": { "success": true, "metrics": {} },
    "dynamic": { "success": true, "metrics": {} },
    "failureClass": null
  }],
  "summary": { "riskDifference": 0, "ci95": [-0.05, 0.05], "policyViolations": 0, "cost": {}, "latency": {}, "tokenizer": {} },
  "limitations": []
}
```

`status` 只能是 `complete`、`partial` 或 `inconclusive`。缺失真实模型、缺少语言分层、评分器不一致或样本不足时分别记录，不得写成成功。harness 的 dry-run 固定输出 `inconclusive`；只有 corpus 明确 `qualifying: true`、每项达到最低重复数、全部 pair 有真实成功事实、主观项评分完整、provider/model/protocol/endpoint 均非空、所有 arm 的 policy evidence 为 `measured`、policy violation 为零且风险差区间满足门槛时才输出 `complete`。

## 6. 当前证据边界

- `bench:responsiveness` 已覆盖 1000 项列表键路径及 math/table/diff 单次同步渲染阻塞，绑定当前构建；它是实现资源证据，不是模型质量。
- 现有 RENDER/INPUT、动态发现、压缩和权限回归证明确定性合同，不证明真实模型会正确选择工具、参数或摘要策略。
- QA-03 的 harness 和 starter corpus 已有本地回归，但正式任务集和真实质量评估仍未执行；TOOL-02 的真实总请求成本、参数质量、cache 对比和多语言 tokenizer 校准同样未执行。逐请求发现 token attribution 已具备本地合同，仍需要真实 provider 运行来证明实际数值。
