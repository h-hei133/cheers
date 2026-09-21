---
title: "功能开发：pi 对照总索引"
category: article
sources: [pi-source-2026-09-20, repo-audit-2026-09-20]
created: 2026-09-20
updated: 2026-09-20
tags: [features, gap-analysis, pi, index]
summary: "功能开发前锋探索的总入口。对照本地参考仓 pi，把能力缺口按七个切片分类登记：共 40 项 DEFICIENT、38 项 MISSING、16 项 OURS-ONLY、7 项平手。列出 8 项硬缺陷与 12 项高价值缺口。本轮零代码改动，只产出事实与分类。"
confidence: high
---

# 功能开发：pi 对照总索引

> **本目录的用途**：重构已收口（见 [`../refactor/plan.md`](../refactor/plan.md)），下一步进入功能开发。
> 本目录是**功能开发方向的证据基础**——不是路线图，不是排期，是「我们的功能相比参考实现差在哪」的分类清单。
>
> **本轮性质**：前锋探索。**零代码改动**，只产出事实与分类。
> 对照对象是本地参考仓 `pi`（`/home/wang/projects/pi`，只读）。

## 1. 分类口径

每条发现归入**恰好一类**：

| 判定 | 含义 | 本轮是否提议开发 |
|---|---|---|
| **DEFICIENT** | 我们有这个能力，但更弱／不完整／未接线／已损坏 | ✅ 提议 |
| **MISSING** | pi 有，我们没有等价物 | ✅ 提议 |
| **OURS-ONLY** | 我们有 pi 没有 | ❌ **仅记录**（维护者将结合其他项目另行开发） |
| **平手** | 两侧都有，形态不同 | ❌ 仅记录，避免误报为差距 |

维护者指示：**pi 没有但我们有的功能，先暂缓**——本目录按此执行，`OURS-ONLY` 只记录不提议。

## 2. 七份切片报告

> **Phase 0 裁决已完成**：见 [`phase-0-disposition.md`](phase-0-disposition.md)（2026-09-20）。
> 四项决策全部通过，执行顺序为 **决策 4 → 决策 1 → 决策 3 → 决策 2**。
> **Phase 1 施工已完成**：见 [`phase-1-execution.md`](phase-1-execution.md)。
> 执行中发现 **5 处与裁决不符**（含 `thinkingLevel` 双源、multimodal 实为缺陷、
> 事件流模块非事件流），均已在执行记录中逐条更正。
> **Phase 2 执行状态**：**未彻底完成**（见 [`phase-2-execution.md`](phase-2-execution.md)）。
> 核心自动压缩已实现 token 预算与 split-turn，但手动 `/compact` 未接入导致越压越大（134k->134k+），且连续压缩未继承上一条锚点，需收口统一。

| # | 报告 | 覆盖范围 | DEFICIENT | MISSING | OURS-ONLY | 平手 |
|---|---|---|---:|---:|---:|---:|
| 01 | [可扩展性与定制化](01-extensibility-and-customization.md) | 扩展宿主、技能、提示词模板、包分发、主题、上下文文件 | 4 | 10 | 1 | 0 |
| 02 | [程序化集成与会话数据](02-programmatic-integration-and-session-data.md) | JSON 事件流、RPC、SDK、session 格式、导出与分享 | 4 | 5 | 2 | 0 |
| 03 | [Provider 与模型层](03-provider-and-model-layer.md) | 订阅登录、模型目录、per-model 覆盖、兼容性开关、传输与缓存 | 7 | 4 | 1 | 0 |
| 04 | [终端交互与呈现](04-terminal-interaction-and-presentation.md) | 编辑器、补全、主题、快捷键、消息队列、转录渲染 | 11 | 7 | 2 | 0 |
| 05 | [工具与执行安全](05-tools-and-execution-safety.md) | 工具集、截断、bash、编辑并发、钩子派发、沙箱与审批 | 6 | 3 | 4 | 4 |
| 06 | [可观测性、配置与生命周期](06-observability-config-and-lifecycle.md) | 配置系统、诊断、崩溃日志、遥测、用量统计 | 4 | 6 | 5 | 1 |
| 07 | [上下文管理与压缩](07-context-management-and-compaction.md) | 触发阈值、切点与超大 turn、重复压缩、分支摘要、文件追踪、压缩钩子 | 4 | 3 | 1 | 2 |
| | **合计** | | **40** | **38** | **16** | **7** |

> 注：`03` 与 `06` 是**同一轮由主代理自行完成**的切片（子代理两次因上游故障失败），
> 其中 `03` 的核心结论经**实机执行验证**（见 §4）。

## 3. 按严重度排序的优先项

### 3.1 硬缺陷（有明确证据、影响真实行为、修复路径清晰）

| # | 缺陷 | 位置 | 影响 | 出处 |
|---|---|---|---|---|
| **P1** | **`getRuntimeConfig` 丢弃全部可选字段** | `config/runtimeConfig.ts:196-213` | 用户在 `config.json` 里写的 `contextWindow`/`reserveTokens`/`thinkingLevel`/`temperature`/`theme` 等 15 个字段**静默失效**；自动压缩恒按 64k 触发 | `03-*` §2.1 |
| **P2** | **两套并行配置系统，其中一套完全无效** | `config/settingsLoader.ts`（`loadCascadingSettings` 零调用者） | `.agents/settings.json` 与 `~/.private-agents/settings.json` 里的 `permissions`/`skills`/`model` 配置**从不生效**；`denyRules` 形同虚设 | `06-*` §2.1 |
| **P3** | **`glob`/`grep` 全树遍历不剪枝、不读 `.gitignore`** | `runtime/execution/service.ts:112-123` | 一次文件查找走 **14,023** 个文件，其中 **7,874（56%）** 注定被丢弃 | `05-*` §2.1 |
| **P4** | **22 个声明的钩子事件中 11 个从未派发** | `core/hooks/types.ts:5-27` | `PermissionDenied`/`PreCompact`/`SessionStart` 等**外部集成最需要的钩子**不可用；声明的契约大于实现的契约 | `05-*` §2.8 |
| **P5** | **技能与 `AGENTS.md` 都不进入模型上下文** | `turn/prompt.ts:26`（纯字面量） | 技能对模型完全不可见；本仓库自己的 `AGENTS.md` 规则对运行中的 agent 不可见 | `01-*` §3.1/§3.3 |
| **P6** | **`light` 主题在生产不可达** | `presentation/theme/theme.ts:168`（`setTheme` 零调用者） | 浅色终端用户拿到深色配色；`light.json` 与 39 个令牌是维护负担而非功能 | `04-*` §2.1 |
| **P7** | **Metrics 有 API 无 sink** | `observability/metrics.ts:11`（`metricSink?.()`） | 唯一的生产调用 `recordCount("cli.prompts")` 从未被任何人看到 | `06-*` §2.3 |
| **P8** | **压缩触发用字符估算而非 provider usage** | `session/context.ts:7`（`CHARS_PER_TOKEN = 3.5`）+ `cliSessionRuntimeFactory.ts:84`（`?? 64_000`） | 128k 窗口的模型会**早约 55,616 tokens** 触发压缩；大 JSON／非英文内容则相反地过晚 | `07-*` §2.1 |

### 3.2 高价值 MISSING（pi 有、我们没有、成本低）

| # | 缺口 | 出处 | 成本判断 |
|---|---|---|---|
| M1 | bash 不注入会话环境变量（`PI_SESSION_ID`/`PI_MODEL` 等 5 个） | `05-*` §3.2 | **最低**——`ToolExecutionContext` 已有全部数据 |
| M2 | 崩溃日志（`crashes.json`，保留 5 条） | `06-*` §3.1 | **低**——一个处理器 + 一个 JSON 文件 |
| M3 | 启动分段计时（`PI_TIMING=1`） | `06-*` §3.3 | **低**——约 30 行 |
| M4 | `ls` 工具 | `05-*` §3.1 | **低**——复用修好后的目录遍历 |
| M5 | `@` 文件引用 + Tab 路径补全 | `04-*` §3.2 | 中——补全排序已实现，缺候选源 |
| M6 | 快捷键自定义（`keybindings.json`） | `04-*` §3.1 | 中——`MOTIONS`/`KILLS` 已是数据表 |
| M7 | 提示词模板（磁盘参数化 `.md`） | `01-*` §3.2 | 中 |
| M8 | HTML 导出 / session 分享 | `02-*` §3.3 | 高——需先定隐私边界 |
| M9 | stdin/stdout RPC 协议 | `02-*` §3.1 | 高——需独立定义 framing |
| M10 | 订阅式 OAuth（Claude Pro/Max、GitHub Copilot） | `03-*` §2.2 | 中——OAuth flow 已是声明式，加两条配置 |
| M11 | rewind 时摘要被放弃的分支 | `07-*` §3.1 | 中——`sessionThread.ts` + `sessionDagEngine.ts` 已有大部分基础 |
| M12 | 压缩前可取消/自定义的钩子 | `07-*` §3.2 | 低——类型与 dispatcher 都在，只缺派发点 |

## 4. 验证纪律（本轮执行情况）

按 `plan.md` §2.4 与 §9.2 的既有纪律：

| 要求 | 执行情况 |
|---|---|
| 每条发现附 `file:line`（双侧） | ✅ 全部 |
| 缺失类结论附检索命令 + 结果 | ✅ 全部 |
| 子代理并发上限 2 | ✅ 全程未超过 2 |
| 子代理回报**必须经主代理逐条核验** | ✅ 见下 |
| 零代码改动 | ✅ `git status` 无源码改动 |

### 4.1 主代理核验并**更正**的子代理结论

| 报告 | 子代理原判 | 主代理核验后 | 处置 |
|---|---|---|---|
| `05-*` | bash 截断丢弃全量输出 | **错误**：`registry.ts:141` 已落盘为 `artifact://` | 已更正为「平手」 |
| `05-*` | registry 层 edit/write 未串行化 | **错误**：串行化在 `tools/dispatch/executor.ts:90-99` | 已更正为「平手」 |
| `02-*` | `runtime/events/stream.ts` 是一项能力 | **需限定**：生产消费者为 0（仅测试） | 已补「已写好但未接线」限定 |
| `04-*` | —（主代理自查） | 消息队列初判「单一队列」**错误** | 已更正为「两种投递语义完整实现，仅模式不可配」 |

### 4.2 主代理自身的错误（方法记录）

本轮主代理**自己写错 3 条**，全部由直接证据反驳后更正，**保留原判与更正过程**，不静默覆盖：

| # | 主代理原判 | 实际 | 误报原因 |
|---|---|---|---|
| 1 | bash 截断后丢弃原始输出 | `registry.ts:141` 已落盘 | `sed -n '81,140p'` 读函数，落盘分支在 **141 行**——读窗口差一行 |
| 2 | registry 层 edit/write 未串行化 | 串行化在 dispatch 层，**位置更好** | 只查 import 消费者，未追调用链下一层 |
| 3 | 消息队列是单一队列、无投递时机区分 | `core/agent/queue.ts` + `agent.ts` 完整实现两种语义并接线 | 只看了 `interactiveMode` 的 `queue: string[]`，未追到 `AgentCore` |

**共同模式**：**证据搜索停在第一层**——读窗口截断，或检索范围未扩展到调用链下一层。
与 `plan.md` §5 记录的既有教训同源（自制截断读取替代完整读取）。

### 4.3 本轮实机执行的验证

仅一处，用于确认 P1（唯一一次执行）：

```bash
# 写入含 contextWindow: 200000 的用户 config.json，读回
npx tsx /tmp/probe.mts
# → returned keys 只含 10 个字段；contextWindow/reserveTokens/thinkingLevel/temperature 等全部 undefined
```

其余全部为**静态代码分析**。**未运行** build、测试套件或产品 CLI。
因此所有**视觉/交互类**结论（`04-*`）均以代码结构为据，**未经实机视觉确认**。

## 5. 本轮未覆盖的范围

以下范围**本轮明确未做**，如需应另开一轮：

- **运行时行为验证**：未实跑产品观察 `glob` 延迟、TUI 渲染、工具输出等实际表现。
- **pi 的实机对照**：pi 的 `node_modules` 不存在，无法启动其 CLI/TUI；所有 pi 侧结论来自**其文档与源码**。
- **`OURS-ONLY` 项的深化**：按维护者指示暂缓，仅登记位置与「pi 是否真的没有」的检索证据。
- **性能基准**：只量化了文件数量级（P3），未做端到端延迟测量。
- **多语言/多平台细节**：Windows 路径、IME、非 UTF-8 终端等未系统检查。

## 6. 建议的下一步

1. **先修 P1–P3**（配置失效、双配置系统、目录遍历）：三者都是**根因型**修复，且互相独立。
2. **再做低成本 MISSING**（M1–M4）：每项都是几十行级别的接线。
3. **P4–P7 需要裁决**：每项都是「声明了但没接」或「基础设施在但覆盖面窄」，
   按 `01-*` §3.1 确立的标准，**要么接上，要么删掉，不要保留中间态**。
4. `OURS-ONLY` 的 15 项按维护者指示暂缓，待结合其他参考项目另行开发。
