---
title: "动态工具发现"
category: article
created: 2026-10-17
updated: 2026-10-23
tags: [tools, context, phase-20]
summary: "默认只声明常驻工具并提供 search/load 入口；加载只改变下一次请求的 schema，不授予执行权限；full 模式保留诊断与对照。"
---

# 动态工具发现

默认 `toolDiscovery: "dynamic"`。模型首次请求只收到常驻工具、`tool_search` 与 `tool_load` 的 schema；其余工具按名称搜索并加载后，在**下一次**请求中获得完整 schema。

## 1. 常驻与可发现

常驻：`read`、`glob`、`grep`、`bash`、`edit`、`write`、`apply_patch`、`ask`、`taskOutput`、`taskStop`。当前可见性过滤之后不存在的名字不会凭空出现。

可发现：其余通过 `allowedTools`/`disabledTools`/`hiddenToolPrefixes`/MCP 开关与模式过滤后的工具，包括 `browser`、`desktop`、`lsp`、`web_fetch`、`web_search`、`todo`、`task`、`skill`、feature 与 MCP 工具。MCP 工具沿用现有 `mcp__<server>__<tool>` 命名空间。

`toolDiscovery: "full"` 保留全部 schema，用于故障诊断和成对评测；命令检查（`/tools` 等）始终使用完整池，不受模型运行模式影响。

## 2. 元工具

| 工具 | 返回 |
|---|---|
| `tool_search` | 稳定名称、一行摘要、是否已加载/常驻；不返回 schema |
| `tool_load` | 已加载与被拒绝的名称；schema 在下一请求生效 |

搜索只覆盖当前可见目录，因此无权发现的工具不会出现在结果里。加载上限 32 个；常驻工具不占这个额度。未知、元工具自身或超过上限的名称被拒绝，并如实返回。

## 3. 权限与代际

加载不是授权：每次调用仍按当前 schema 校验参数，并经过 pre-tool 权限、admission、sandbox 与审计。加载后工具被隐藏、禁用或目录变化时，下一次请求不再声明它；旧调用没有可复用的 authority。

发现状态带有由可见目录名称与 schema 生成的 `generation`。一次运行内目录固定；新运行重新生成，不继承旧 loaded set。`tool_search`/`tool_load` 同步执行，没有可覆盖新目录的迟到异步结果。

## 4. 请求与预算

step 在每次调用时读取当前快照，所以加载后的 schema 立即计入下一次请求的工具声明与硬预算；工具顺序保持目录顺序，减少 prompt 前缀抖动。初始 system prompt 只列常驻名称。

## 5. 边界

- 压缩阈值的 overhead 仍以运行开始时的工具集合估算；step 的硬预算使用当前集合，二者在加载后可能不同。质量与净成本由 TOOL-02/QA-03 评测。
- 子代理共享父运行的发现状态；加载会同时影响后续步骤。
- 已验证：初始集合、搜索/加载/拒绝、上限、generation、元工具执行、权限路径未改；未运行真实模型质量或跨平台证据。

## 6. 成本与质量测量

`core/tools/discovery/evaluation.ts` 提供离线比较，不访问 provider：

- `compareDiscoveryCost` 分别计算完整目录、初始快照与加载后的 wire schema 字节数，并计入搜索/加载工具结果的额外字节；`delta` 是净差，不保证为正。
- 结果声明 `method: characters-per-token` 与除数 3.5；不把字符估算称为 token 上界。
- `quality.schemaPreserved` 检查加载返回的定义与目录中的 `argsSchema`/description 完全一致；加载不会改写或截断关键参数。
- `tokenEstimateError` 对成对的估算/实测给出比例范围；没有样本时明确 `unknown`，不生成校准因子。

2026-10-23 起，`npm run qa:quality` 的正式 harness 把 TOOL-02 证据并入同一构建绑定报告：

- 同模型、同协议、同权限、同初始状态且固定 `temperature=0`、`topP=1`、`maxOutputTokens=4096` 的 `full`/`dynamic` pair 记录总输入/输出、cache read/write、turns、tool calls、发现调用及其 input/output。
- 每个确定性任务把所需工具缺失计为 `missedDiscovery`，把 schema/参数失败计为 `argumentErrors`；这些值按任务与工具族保留，不只报告总成功率。
- 成本只用请求时捕获的公开价格；任何缺价 token 都使 coverage 为 `partial`，总成本保持 `null`，不能写成零。
- 四语言 tokenizer corpus 用两组首次请求的 provider prompt-token 差值校准；未知模型、缺失 usage、不同 endpoint 或非正差值均保持未测。
- run 级 revisioned manifest 绑定 pair、raw arm、tokenizer、盲评 candidate、review map 与评分文件；resume 遇到 artifact 增删改、固定采样缺失或 manifest 不一致时 fail closed。
- `/tools` 仍只报告静态声明字节和 `characters-per-token` 估算，因为命令本身没有目标模型 tokenizer；真实 tokenizer 误差由上述隔离 harness 报告，不把估算写回产品界面冒充实测。

真实任务成功率、漏发现、参数错误、cache 复用与成本仍未执行；fixture validation、单元测试和离线比较不替代真实模型证据，也不在没有证据时自动精简描述或删除参数说明。
