---
title: "Phase 8 前置研究：剩余开放条目的逐行重验"
category: article
sources: [phase-7-decisions, phase-7-pre-research, s1-01-reverify, s2-02-03-reverify, s3-04-reverify, s4-scattered-verify, s5-pi-deephost]
created: 2026-09-24
tags: [features, gap-analysis, pi, phase-8, pre-research]
summary: "Phase 8 前置研究。五个并行子代理 + 主代理逐条核验 01–07 的 19 个开放行与 8 项散落候选。三项核心发现：①候选池的大头（扩展宿主 6 项、RPC/SDK/CBOR/分享 4 项）都是「推翻显式架构立场」而非「补缺口」，pi 侧规模分别为 4,543 行与 1,785+三包；②散落候选中有 3 项是真实的小改动（sameModel 守卫、--skill 注入、Windows glob 反斜杠），另有 2 项已被证实为文档漂移（B-1、技能名校验早已修复）；③图片输入被三重阻塞但 pi 侧证明消息模型必须改为 block 联合（134 处消费点）。"
confidence: high
---

# Phase 8 前置研究

> **本轮性质**：零代码改动，全部结论来自实测。主代理亲测 + 5 个并行子代理
> （S1=01 表逐行、S2=02/03 表逐行、S3=04 表逐行、S4=散落候选逐项、S5=pi 侧深探）。
> 子代理报告经主代理逐条核验（见 §6）。
> 排查口径延续 Phase 6/7 的教训：**表格两次被证明滞后或错误于代码，因此每一条
> 都以当前代码为准重新验证，不采信历史文档的判定列**。

## 0. 汇总

Phase 7 收口后，01–07 的判定列为 **4 DEFICIENT / 15 MISSING / 16 OURS-ONLY / 10 平手**。
本轮把全部 19 个开放行 + 8 项散落候选重新验证，结论：

| 类别 | 数量 | 处置建议 |
|---|---:|---|
| 真实小改动（一处修补，非新能力） | **3** | 纳入 Phase 8 任务 |
| 文档漂移（代码早已修复，判定列未更新） | **2** | 本轮直接更正判定列 |
| 已收口（与文档一致，无需动作） | **3** | 关闭条目 |
| 已裁决「不做」且本轮证据支持原裁决 | **7** | 维持，不重开 |
| 需要推翻显式架构立场才有意义的「大工程」 | **4 类 13 项** | 维持不做，理由收紧 |

---

## 1. 三项真实小改动（Phase 8 的核心候选）

### 1.1 B-4：模型切换溢出归属守卫（`sameModel`）

**我方现状**（S4 报告 + 主代理亲测核验）：
`turn/session.ts:252-270` 的 `recoverOverflow` 无任何模型归属检查：

```ts
const last = messages[messages.length - 1];
if (!last || last.role !== "assistant" || !isOverflowFailure(last) || !options.compaction) return false;
```

若上一轮在 Model A（小窗口）下产生了溢出失败，用户切换到 Model B（大窗口）后，
下一轮进入时 `isOverflowFailure(last)` 依然命中——**旧模型的溢出触发新模型的压缩**，
新模型本不需要压缩，且压缩会按新模型的阈值切掉上下文。

**pi 侧**：`agent-session.ts:2616-2617` 有显式守卫（注释原文：*"Old assistant errors
from a previous model (e.g. context overflow) shouldn't trigger compaction for the
new model"*）：`sameModel = assistantMessage.provider === this.model.provider &&
assistantMessage.model === this.model.id`，且 `contextOverflow` 与 `recoverableLength`
两个恢复条件都要求 `sameModel`。

**判定**：**仍开放**。改动面：`recoverOverflow` 需要拿到当前模型标识与失败消息的
来源标识做比对。需要核实我方 `AgentMessage` 是否记录 `provider`/`model`——
若不记录（Phase 3 曾记录消息只带 role/content/tool_calls），**这个守卫的前提
是先给消息加来源标识**，改动面从「一行」变成「消息形状 + 写入点 + 比对点」。
裁决时必须先验证这一点。

### 1.2 B-3：CLI 级技能路径注入 `--skill`

**我方现状**（S4 报告）：`SkillLoader` 构造时固定两类根（用户级 + 项目祖先目录展开），
无外部追加参数（`skillLoader.ts:70-88`）；`grep --skill` → 0 命中。

**pi 侧**：`cli/args.ts:181-183` 可重复的 `--skill <path>`，且穿透 `--no-skills`
（显式声明的路径始终加载，`docs/cli.md:154-157`）。

**判定**：**仍开放**。改动面（S4 评估，主代理核验认可）：
`cliArgs.ts` 加参数 → `runtimeConfig` 加 `skills`/`noSkills` 字段 →
`SkillLoader` 构造器加 `extraDirs` → 接线点透传。规模：小。

### 1.3 Windows glob 反斜杠归一化

**我方现状**（S4 报告）：`globMatch.ts:64-73` 的 `matchesGlob` 对 pattern 只剥
`./` 前缀，**不替换 `\` 为 `/`**；而 `fileWalk.ts:169-173` 产出的 filePath 已是
POSIX 斜杠。Windows 风格 pattern（`src\**\*.ts`）在 picomatch POSIX 模式下把
`\` 当转义符 → 永不匹配。

**pi 侧**：`path-utils.ts` 统一 `toPosixPath` 预处理。

**判定**：**仍开放**。但注意：**用户 workstation 是 WSL**，主场景路径分隔符是
`/`；此项是跨平台健壮性而非日常缺陷。裁决需权衡：改是一行（`clean.replace(/\\/g, "/")`
——但需先确认不破坏「pattern 里字面反斜杠」的合法用法，picomatch POSIX 模式下
那本来就是转义语义）。

---

## 2. 文档漂移（本轮直接更正）

### 2.1 B-1（统一字节兜底层）——早已收口

`phase-3-review.md` B-1 断言「我方漏掉 glob/目录列举的字节上限」——S4 实测：
`glob.ts:85-101` 与 `directoryListing.ts:98-110` **均已有 50KB `truncateHead`
截断 + 超限落盘 artifact://**，与 pi 完全平手（pi 也无全局中间件，同样逐工具截断）。
该断言已成过去式。

### 2.2 技能名/长度不合规警告——早已实现

`phase-3-execution.md` §7.4 断言「未实现——当前不校验名称格式」——S4 实测：
`skillLoader.ts:63-65,298-313` 的 `inspectSkill` 已实现 `MAX_NAME_LENGTH=64` +
`VALID_NAME` 正则校验并输出 diagnostics，测试在 `skillLoader.test.ts:237-251`。
仅缺 pi 的首尾/连续连字符两个边界正则（次要点）。

> **两处漂移的共性**：都是 Phase 3 时代写的 backlog 行，后续 Phase 的施工收口了
> 它们但没有回头关掉 backlog 登记。**处置**：`01`–`07` 相关行无需动（本来就没
> 列入），`phase-3-review.md` B-1 与 `phase-3-execution.md` §7.4 加更正注记。

---

## 3. 已收口确认（关闭条目）

| 项 | 证据 |
|---|---|
| 检查点位置不变量（Phase 7 裁决 #15 要求补测试） | `compaction.test.ts:218-285` 已有专有 describe 块，两个往返断言（checkpoint 在 head 后 + 无 system 时在 index 0）。**裁决要求的测试已存在** |
| renewedCompactionProvider 三条接线 | `/compact`（`cliSessionRuntimeFactory.ts:255-274`）与 `/back` 摘要（`:275-288`）已接 `renewedCompactionProvider()`；turn step 走同步 `compactionProvider()` 是**设计使然**（注释 `:198-202`：turn 自己的 token 已在 invocation 路径续期过，step 不再重复续期——续两次是浪费且引入额外异步阻塞）。**不是缺口** |
| B-2 超限落盘 | 我方 bash/read/glob/grep/目录列举全落盘 artifact://，**优于 pi**（pi 仅 bash 落盘，其余只提示）。无需动作 |

---

## 4. 维持「不做」的项（证据支持原裁决，理由可收紧）

以下各项 Phase 5/6/7 已裁决不做，本轮双侧实测**支持维持**，且新增了可入档的收紧理由：

### 4.1 扩展宿主（01 的 6 个 MISSING 行的共同根）

pi 侧全链实测（S5）：发现→jiti 加载→注册表→分派，`core/extensions/` 共
**4,543 行**（types 1,925 / runner 1,452 / loader 797 / 其余 ~370）。
我方 `runtime/extensions/lifecycle.ts`（427 行）是**显式的防御契约**：
`supported: false`、`executable: false`、`findForbiddenOutcomeReason` 拦截
`executablePluginCode !== undefined`——「不执行扩展」是**写进代码的架构立场**，
不是待补的缺口。复刻宿主 = 推翻该立场 + 引入 jiti 运行时依赖 + 千行级工程 +
隔离/信任边界重定义。**无用户需求证据**（无 issue、无用户报告）。
**维持不做。**

### 4.2 RPC / SDK / CBOR / 分享（02 的 4 个 MISSING 行）

pi 侧实测：RPC 模式 `modes/rpc/` 共 1,785 行（含 UI 双向桥
`extension_ui_request`/`response`）；CBOR 家族是**三个独立发布包**
（protocol/client/server），且与 coding-agent **生产依赖零耦合**（只在
experimental 下用）——pi 自己都把它当实验层。分享链路依赖 Radius 网关（我方无）
或 `gh gist`（隐私边界未定义）。SDK 需要一个 `createSession()` 装配工厂，
但 `ShellSessionRuntime` 的依赖注入面（`SessionRuntimeDependencies` + renderer +
provider factory）尚未稳定到可承诺兼容。**维持不做，理由：协议承诺一旦发出
就是长期契约，用户面为零时发协议是 premature commitment。**

### 4.3 cache 保活 / 更新检查 / 传输选择（03 的 2 行 + 06 的 1 行）

S2 深探补充了三个新事实，全部支持维持不做：
- **cache warmer**（`cache-warmer.ts` 453 行）：决策模型
  `expectedSavings = continuationProbability × missCost − warmCost ≥ $0.05`，
  idle 概率固定 0.15，TTL 90% 处刷新。**依赖 provider 的计费结构**——我方
  内置目录零 `cost` 声明（Phase 6 T3 已记录），**没有可算的经济学**。且它会
  **主动发请求**，与「无未经询问的对外请求」姿态冲突。
- **transport WebSocket**：**特化于 OpenAI Codex Responses 网关**（websocket-cached
  用 `previous_response_id` 复用连接级上下文），**非通用 provider 能力**。我方
  无 Codex Responses 接入，做了也无消费者。
- **更新检查**：维持 Phase 7 #14 的裁决（需先建同意机制）。

### 4.4 图片输入 / Mermaid / 主题死令牌（04 的行)

- **图片输入**：pi 全链实测（S5）——消息模型是 `content: string | (TextContent |
  ImageContent)[]`，从 `agent-session.ts:1722-1725` 的装配、`clipboard-image.ts`
  的四平台剪贴板适配、到 provider 侧 image block 编码。我方 `SessionMessage.content`
  是 string，消费点 134 处/18 文件（S3 实测，Phase 1 记录的 156/15 在重构后已漂移）。
  我方 `model-adapters/multimodal.ts` 的转换函数（`toAnthropicImageBlock` 等）
  **零生产消费**——已写好未接线，且当前唯一「用到」图片知识的地方是
  `registry.ts:338-349` 的**拒读提示**（告诉模型「这是图片，我读不了」）。
  **三重阻塞维持**（消息模型/剪贴板读取/请求形状），维持独立立项。
- **Mermaid**：pi 用 `grok-mermaid`（预研 §2 已裁：无依赖自研不现实）。
  维持不做。
- **主题令牌 18 个死置**：维持 Phase 4 §15.3 的「不删」决定（避免破坏用户
  自定义主题文件）。S3 补充实测：`toolSuccessBg` 仅测试引用、6 个 `syntax*`
  全死置、`userMessageText` 被 `blocks.ts:106` 的硬编码 ANSI 绕过——**死因
  分明**，将来若做语法高亮这些令牌自然复活。

---

## 5. 交叉发现（不属候选池，但裁决需要知道）

1. **`--json` 事件流与 RPC 的边界**（S2 深探）：我方 `run-event-stream.v1` 已
   完成 RPC 事件输出面的 70%——pi 的 RPC 事件输出就是 `toJsonEvent()` 单行 JSON。
   **将来若做 RPC，是「在事件流之上加控制通道」，不是重新发明载荷**。此认知
   入档，不改变本轮裁决。
2. **pi 的 protocol/client/server 与核心解耦**：生产依赖零耦合、只在 experimental
   引用——「平行架构解耦关系，为将来远程会话预留」。我方无此分层压力。
3. **B-1 的 opencode 式统一拦截层**：S4 判断「若追求 opencode 全局拦截需裁决」。
   主代理意见：**不做**——与 pi 平手且我方已有批次层 `boundText`（10k 字符）
   兜底，再叠一层是防御过度。
4. **技能校验的两条边界正则**（pi 有、我方无）：首尾连字符、连续连字符。
   规模极小，可作为 B-3 施工时的顺手项（同一文件、同一函数）。

---

## 6. 主代理对子代理报告的核验记录

按纪律，子代理断言经主代理抽查核验后才进入裁决。本轮核验：

| 报告 | 核验方式 | 结果 |
|---|---|---|
| S3「multimodal 零消费」 | 亲测 grep：`toAnthropicImageBlock\|toOpenAIImageUrlBlock\|MultimodalContentBlock` 全仓非测试命中 = `registry.ts:338` 的 `isImageFilePath` 一处 | **属实，且需补充**：该处是「拒读图片」的退化消费（`formatNonVisionFallback`），不是图像输入。S3 报告的「134 处消费点」未亲自重数，标记为中置信，采用其数量级（>100 处）做裁决依据 |
| S4「sameModel 缺失」 | 亲读 `turn/session.ts:252-270`：`recoverOverflow` 确无模型归属检查 | **属实** |
| S4「glob 截断已收口」 | 亲读 `glob.ts:79-108`：50KB `truncateHead` + artifact 落盘在位 | **属实**（B-1 漂移确认） |
| S4「技能校验已实现」 | 引用其 file:line 与测试行号，未逐行亲读（信任度：报告其余部分全部核验通过，且与 S1 报告的技能节一致） | **采信** |
| S1「扩展宿主规模 4,455 行」 | 与 S5 报告「4,543 行」差 88 行（两代理独立统计，差在 index.ts 是否计入）| **采信量级 ~4.5k**，裁决用「约 4,500 行」 |
| S1「lifecycle.ts 是防御契约」 | 亲读描述与文件头注释（`supported:false`、`executable:false` 硬编码） | **属实** |
| S2「WebSocket 特化 Codex」 | 与 S5 报告交叉一致（`openai-codex-responses.ts` 是唯一实现点） | **属实** |
| S2「cache warmer $0.05 模型」 | 与 S5 报告交叉一致（453 行、0.15 idle 概率、TTL 90%） | **属实** |

**S3 的「134 处消费点」是唯一未亲测的数字**，已按上述方式降级处理。
另：S3/S1 各报了一处文档漂移（`toolSuccessBg` 统计口径、`PICKER_ONLY` 条数），
均已在 §2 或对应行更正。

---

## 7. 未完成与如实记录

| 项 | 状态 |
|---|---|
| B-4 的前提验证 | **未验证**我方 `AgentMessage` 是否记录 `provider`/`model` 来源标识——裁决时列为 T 项第一步 |
| 图片输入「134 处」 | 子代理实测数字，主代理未重数，中置信 |
| pi 扩展宿主的运行时行为 | 静态读码，未实跑（pi 无 node_modules，沿 01 文档既有记录） |
| `phase-3-review.md`/`phase-3-execution.md` 的漂移更正 | 本轮记录，**更正动作在施工轮做**（本轮零代码改动，文档更正随施工轮一起） |
| 除 pi 外的参考仓 | 本轮候选不需要（扩展宿主/RPC 的形状 pi 就是权威基线；opencode 只在 B-1 被读到） |
