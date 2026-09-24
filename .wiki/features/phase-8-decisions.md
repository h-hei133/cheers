---
title: "Phase 8 裁决：小修轮"
category: article
sources: [phase-8-pre-research]
created: 2026-09-24
tags: [features, decisions, phase-8]
summary: "Phase 8 裁决。与 Phase 6/7 不同，本轮没有大任务：候选池验证后收敛为 3 个小改动任务（T1 sameModel 守卫、T2 --skill 注入、T3 Windows glob 反斜杠 + 技能校验两条边界正则）加 T4 文档漂移更正。13 项「大工程」维持不做且理由经双侧实测收紧。关键裁决：T1 若发现消息无来源标识则先加标识再比对（不许退化为『不可行就放弃』）；T2 采用 pi 的 additive 语义穿透 --no-skills；T3 反斜杠归一化必须先验证不破坏字面反斜杠的转义语义。"
confidence: high
---

# Phase 8 裁决

> **前置研究**：`phase-8-pre-research.md`（2026-09-24，五子代理 + 主代理核验）。
> **本轮性质**：裁决，零代码改动。
> **与 Phase 6/7 的差异**：那两轮各有「已经承诺但失效」的重缺陷（HTTP 超时、
> OAuth 死路、双击永不成立）；本轮**没有**这类项——剩余开放行里没有一条是
> 「用户被承诺了什么而它不工作」。因此 Phase 8 定位为**小修轮**：三个低风险
> 修补 + 文档对账，不立项大工程。

## 0. 任务表

| # | 任务 | 来源 | 规模 | 验证方式 |
|---|---|---|---|---|
| **T1** | 模型切换溢出归属守卫（`sameModel`） | B-4（phase-3-review.md） | 小（若消息无来源标识则中） | 单元测试：小模型溢出失败 → 切大模型 → 断言不触发压缩；同模型 → 断言触发。反向验证：去掉守卫 → 前一断言失败 |
| **T2** | CLI 级技能路径注入 `--skill` / `--no-skills` | B-3（phase-3-review.md） | 小 | 单元 + 实机（PTY）：`--skill <path>` 加载指定技能且出现在 `<available_skills>`；`--no-skills` 清空发现；两者同用显式路径仍加载 |
| **T3** | Windows glob 反斜杠归一化 + 技能名边界正则 | phase-3-execution §3.6/§7.4 余量 | 极小 | 单元：`src\**\*.ts` 匹配 `src/a.ts`；字面反斜杠用例先验证 picomatch 语义再定。技能名 `-bad-`/`a--b` 出现在 diagnostics |
| **T4** | 文档漂移更正 | pre-research §2 | 极小（纯文档） | `phase-3-review.md` B-1、`phase-3-execution.md` §7.4 加更正注记；01/02/03/04 判定列同步；合计行重数 |

**执行顺序**：T1 → T2 → T3 → T4。理由：T1 是行为正确性（旧模型溢出毁掉新模型
上下文是真实的用户可见损害）；T2/T3 是加法增强；T4 最后做（避免施工又造成表格
滞后——Phase 6 §3.3 的既有纪律）。

---

## 1. T1 裁决：sameModel 守卫

### 1.1 做什么

`turn/session.ts` 的 `recoverOverflow` 增加模型归属检查：溢出失败消息的来源
模型 ≠ 当前模型时，不把它当作本模型的溢出去压缩。

### 1.2 关键裁决：前提验证先行，不许静默放弃

pre-research §7 指出未验证我方 `AgentMessage` 是否记录 `provider`/`model`。
**裁决**：T1 第一步先验证。

- **若消息已有来源标识**（任何字段承载 provider/model）：直接比对，一行级改动。
- **若消息无来源标识**：**加标识**。写入点在请求路径装配处（`turn/step.ts` 的
  assistant 失败消息构造），持久化（transcript codec）同步扩展——参考 Phase 7 T1
  给 `query.started` 加 `sessionPath` 的先例：**加可选字段是兼容变更**，老行
  无该字段时守卫退化为「不拦」（保守方向：宁可漏拦一次错误压缩，不可错杀一次
  真实溢出恢复）。
- **不许做的事**：不因为「要加字段」就把任务标记为不可行然后只改文档。那是
  Phase 4 §15.6 批判过的「把施工困难包装成设计取舍」。若加字段的改动面经实测
  超过一个工作日，回到维护者面前重裁决，而不是自行降级。

### 1.3 与 pi 的对齐点

照 `agent-session.ts:2616-2617` 的语义（来源模型 ≠ 当前模型 → 不恢复），
**不照抄**它的实现形状（pi 的守卫挂在 usage 投影链上，我方挂在 `recoverOverflow`
入口——结构不同，语义相同）。

### 1.4 写入链（主代理复核补全，2026-09-24）

复核确认了三个改动点，比初稿预想的「一处」多两处，施工按此清单走：

1. **`turn/step.ts` 的 `AssistantStep`**（`:20` 接口、`:453` 的 `errorStep`）
   加 `originProvider`/`originModel` —— 来源信息的**生产点**。
2. **`core/agent/loop.ts:202-216`** 把 `AssistantStep` 组装成 `AgentMessage`
   时透传这两个字段 —— 消息的**赋形点**。
3. **`turn/session.ts:364` 的 `persist()`** 落盘前显式剥掉 `stopReason`/
   `errorMessage`（`const { stopReason: _stopReason, errorMessage: _errorMessage,
   ...stored } = message`）——**新字段必须在此处显式决定去留**。
   **裁决：落盘**。`TranscriptEvent` 的 message 变体加可选字段——兼容性已亲验：
   `isTranscriptEvent` 形状守卫只查 `type`/`role`/`content`，未知字段透传；
   `decodeTranscriptLineSafe` 对老行（无该字段）不报错，守卫自然退化为「不拦」
   （保守方向）。落盘的理由：重启后切换模型的场景恰是守卫主战场，不落盘等于
   守卫只管单进程内切换。

### 1.5 验证方式

新测试两个用例（放 `turn/` 现有测试文件）：
1. 小模型溢出失败留在消息尾部 → 切换大模型 → 再触发一轮 → **不**压缩。
2. 同模型溢出失败 → **照常**压缩恢复（防过拟合：守卫不能把真实恢复也拦掉）。

反向验证：移除守卫 → 用例 1 失败（旧溢出触发了新模型的压缩）。

---

## 2. T2 裁决：`--skill` / `--no-skills`

### 2.1 语义照 pi（两处都照）

- `--skill <path>`：**additive 且可重复**，路径可以是单个 SKILL.md 也可以是
  技能目录。
- `--no-skills`：关闭发现路径；**显式 `--skill` 穿透**（显式声明压倒关闭开关——
  用户的明确意图高于全局开关，这与「CLI 覆盖层高于配置文件」的既有优先级
  结构同构）。
- 优先级：显式 `--skill` 的技能在清单中标注独立来源（`source: "cli"`），与
  发现的技能**并存**；同名冲突时**显式胜**（后注册覆盖，与模板加载器的
  「就近覆盖」方向一致，但此处只有一层：显式层永远最靠后加载）。

### 2.2 接线形状（主代理复核修正，2026-09-24）

初稿写「进 `getRuntimeConfig` 的 overrides」——**复核证明这是错的**。
`--no-context-files` 先例的实际接线：`cliArgs.ts:229` 解析 → `cliOptions.ts:26`
停住 → `cliBootstrapContext.ts:66` 直接消费（`instructionBudgetBytes: 0`），
**全程不进 `RuntimeConfig`**（`grep noContextFiles src/config/` → 0 命中）。

T2 照此形状：`cliArgs.ts`（解析，可重复聚合）→ `cliOptions.ts`
（`skillPaths?: string[]` + `noSkills?: boolean`）→ `SkillLoader` 的实际构造
位置（`cliRuntimeInvocation.ts`）直接消费进构造器 `extraDirs`。
**不碰 `RuntimeConfig`**、不进配置 schema。`check:config-consumers` 只扫描
`RuntimeConfig`/`TuiPreferences` 上声明的字段（`scripts/check-config-consumers.mjs`
头部注释），cliOptions 层不在其扫描范围，天然不误触。**施工时若发现自己在改
`runtimeConfig.ts`，方向已经错了。**

### 2.3 不做

- 不做 settings 级 `skills` 数组配置（pi 有；无用户需求证据，backlog）。
- 不做 `--skill` 的参数补全（无先例面）。

### 2.4 验证方式

单元：`parseCliArgs` 对重复 `--skill` 聚合；`SkillLoader` 的 `extraDirs` 加载 +
`source` 标注 + 同名覆盖方向。实机 PTY：`--skill /tmp/x/SKILL.md` 启动后
`/skill <name>` 可见、`<available_skills>` 含它；`--no-skills` 下发现的消失、
显式的仍在。

---

## 3. T3 裁决：glob 反斜杠 + 技能名边界

### 3.1 glob 反斜杠（改动极小，但有一个必须先验证的语义坑）

**裁决**：在 `matchesGlob` 的 pattern 清理处做 `\` → `/` 归一化。**判定实验
已由复核者跑完（2026-09-24，Rv-P8-Maintain）**，结论先行：**简单全局 replace
不可行**，归一化必须带判别条件。实验事实：

- `picomatch("src\\**\\*.ts")("src/a.ts")` → **false**（Windows 风格 pattern
  当前完全不匹配——现状无任何人在用反斜杠 pattern 得到正确结果）。
- `picomatch("src/**/*.ts")("src/a.ts")` → true（正斜杠正常）。
- `picomatch("a\\\\b.ts")("a\\b.ts")` → **true**（显式双反斜杠可匹配字面
  反斜杠文件名——**合法转义场景真实存在**）。
  归一化后 `"a\\b.ts"` 变 `a/b.ts`，**该匹配被破坏**（false）。
- `picomatch("foo\\*.ts")("foo*.ts")` → true（`\\*` 是对 `*` 的转义——全局
  replace 会把 `foo\*.ts` 变 `foo/*.ts`，语义从「字面星号」变「任意字符」，
  **破坏合法转义**）。
- `picomatch("src\\**\\*.ts", { windows: true })(...)` → 仍 false（picomatch
  的 windows 选项救不了这个场景，`\\` 的处理与预期不符）。

**施工形状据此定为**：归一化只处理「反斜杠后跟路径分隔符语义字符」（`\` 后是
字母/`*`/`?` 且整串不含 `\\\\` 显式转义时）才替换；存在显式转义序列
（`\\\\`、`\\*`、`\\?`）的 pattern **原样通过**（此时用户在表达字面字符，
归一化会改写其语义）。测试正反两向：
- 正：`src\**\*.ts` 匹配 `src/a.ts`。
- 反：`a\\b.ts`（显式转义字面反斜杠）与 `foo\*.ts`（转义星号）归一化后
  语义不变。

**降级条款**（保留）：若施工中判别条件出现无法区分的边界（如 pattern 同时含
转义序列与 Windows 分隔符），**允许回退为「不做 + 记录」**——Windows pattern
在 WSL 主场景下是罕见输入（pre-research §1.3 已评估），现状它也完全不匹配，
不做没有损失任何现有行为。

### 3.2 技能名边界正则（顺手项，同文件同函数）

照 pi `validateName` 补两条：首尾连字符、连续连字符。**不补** pi 的
description 必填硬校验（我方已有软诊断「no description 则不进清单」，语义
等价）。

### 3.3 验证方式

`globMatch.test.ts` 增正反用例；`skillLoader.test.ts` 增 `-bad-`/`a--b`
两条 diagnostics 断言。反向验证各自移除即失败。

---

## 4. T4 裁决：文档对账

1. `phase-3-review.md` B-1：加更正注记（glob/目录列举 50KB 截断 + 落盘已在，
   backlog 行关闭）。
2. `phase-3-execution.md` §7.4 技能名校验：加更正注记（`inspectSkill` 已实现，
   指到 file:line）。
3. 01–04 判定列：本轮维持不做的 13 项，行内加「2026-09-24 Phase 8 复核维持」
   标记，**判定列不动**（它们本来就写着 MISSING/DEFICIENT，维持不做的项
   不改判定列——判定描述的是差距事实，做不做事另一回事）。
4. 合计行重数：T1–T3 完工后按 Phase 7 §6 先例重跑计数方法并更新。
5. `capability-backlog.md` 若有对应登记行（B-3/B-4），状态改「已解决」并指
   向施工记录。

---

## 5. 维持不做清单（13 项，理由经本轮双侧实测收紧）

| 项 | 理由（收紧后的） |
|---|---|
| 扩展宿主（01×5 行 + 自定义 UI） | 我方 `lifecycle.ts` 是**写进代码的显式防御立场**（`supported:false`/`executable:false` 硬编码）；pi 侧 ~4,500 行 + jiti 依赖；无用户需求证据。推翻立场需维护者明示，不属缺陷修补 |
| 包分发（01） | 是扩展宿主的下游能力（装了也没东西执行）；宿主不做则它无意义 |
| RPC / CBOR / 分享（02×3） | pi 的 protocol/client/server 与核心**生产零耦合**（仅 experimental 引用）——pi 自己都当实验层；协议是长期承诺，用户面为零时发出是 premature commitment。**认知入档**：将来做时事件流 `run-event-stream.v1` 就是输出面，只需加控制通道 |
| SDK（02） | `ShellSessionRuntime` 依赖注入面未稳定到可承诺兼容；等 RPC/扩展面有真实需求时一并定 |
| HTML 导出（02） | pi 形状已探明（零 npm 依赖、vendor 内嵌、base64 单文件）——**若将来做，形状已入档**，随时可启动；当前无用户需求 |
| cache 保活（03） | 主动发请求（同意机制未建）+ 我方目录零 `cost` 声明（经济学不可算）；pi 的 $0.05/0.15 概率模型已入档备用 |
| 传输选择（03） | WebSocket 特化于 OpenAI Codex Responses 网关，我方无该接入，做了零消费者 |
| 更新检查（06） | 维持 Phase 7 #14：先建同意机制 |
| 图片输入（04） | 三重阻塞维持（消息模型 string/134 消费点、无剪贴板读取、请求形状）；`multimodal.ts` 转换函数零消费的现状已入档，独立立项时是新基础设施而非接线 |
| Mermaid（04） | 维持 Phase 5 #18（需新依赖） |
| 主题死令牌清理（04） | 维持 Phase 4 §15.3「不删」；死因已逐个入档（6 个 syntax* 待语法高亮复活、userMessageText 被硬编码 ANSI 绕过） |
| Markdown 高级语法（04） | pi 靠 Marked 1,015 行定制实现；我方自研 190 行覆盖日常（表/围栏/行内），LaTeX/嵌套列表/删除线是长尾，等语法高亮立项时一并评估 |
| opencode 式全局输出拦截层（B-1 升级） | 与 pi 平手 + 我方已有批次层 boundText 兜底；再叠一层是防御过度 |

---

## 6. 复核要求与复核结果（2026-09-24 已完成）

**复核安排**：裁决初稿要求四问复核。执行中遇到上游 `content_filter` 拦截
（详见下），最终复核按「能派则派、被拦则主代理亲验」完成：

| 复核问题 | 复核者 | 结果 |
|---|---|---|
| ①T1「加可选字段是兼容变更」 | 主代理亲验（复核代理两次被 filter 拦截在读取 `sessionEventCodec.ts` 时） | **成立，且发现初稿漏了两个写入点**——完整链是 `step.ts`（生产）→ `loop.ts:202-216`（赋形）→ `session.ts:364` `persist()`（落盘去留，初稿完全没提）。已补进 §1.4 |
| ②T2「CLI 覆盖层不进配置 schema」 | 主代理亲验 | **初稿接线形状是错的**——`--no-context-files` 实际不进 `RuntimeConfig`（`cliOptions.ts:26` 停住，`cliBootstrapContext.ts:66` 直接消费），初稿写的「进 overrides」与先例不符。已修正 §2.2，并核实 `check:config-consumers` 只扫 `RuntimeConfig`/`TuiPreferences`，cliOptions 天然不触 |
| ③§5 维持清单推敲 | `Rv-P8-Maintain`（reviewer 子代理，完成） | **correct、零发现**。重点验证：扩展宿主 `lifecycle.ts` 硬编码立场属实；HTML 导出「零依赖但零需求」与我方历史裁决风格一致（无需求先例）；图片输入零消费属实。**附带跑完 T3 的 picomatch 判定实验**——证实全局 replace 破坏合法转义（`foo\*.ts` 的 `\*` 是转义星号、`a\\b.ts` 是字面反斜杠），实验结果已写进 §3.1，施工形状据此定为「带判别条件的归一化」 |
| ④遗漏候选检查 | `Rv-P8-Maintain` + 主代理对照 phase-4 §11 遗留表 | **零遗漏**。`firstKeptEntryId`（死字段已删，Phase 7）、模型切换溢出（=T1）、目录新鲜度（裁决 §5.6 #7 明确不做）、CLI 技能路径（=T2）、`SYSTEM.md`（Phase 4 裁决刻意不做）——全部已覆盖或已裁决 |

**content_filter 事故记录（累计第 11–13 次）**：复核任务三次被上游拦截
（`Rv-Phase8-Decisions`、`Rv-P8-D2`、`Rv-P8-T1T2`），拦截点一致：子代理读到
`sessionEventCodec.ts`（含 transcript 编解码细节）后立即死亡。拆小任务、改措辞
均无效；同任务 `Rv-P8-Maintain` 通过（其阅读面不含该文件）。**处置**：T1/T2
复核由主代理逐点亲验完成（证据在上表与 §1.4/§2.2 的修正说明里），
不是省略复核。后续同类任务的既有结论再次确认：**涉及 transcript 编解码/OAuth
措辞的任务直接安排主代理，子代理只做阅读面干净的切片**。

---

## 7. 施工记录（2026-09-24）

### 7.1 T1 —— 裁决目标被实测推翻，按 §1.2 的纪律回到实录

裁决 §1.2 要求「前提验证先行，不许静默放弃」；施工照做，结果**前提真的不成立**：

- **`recoverOverflow` 看不到跨轮遗留的失败**。它只检查 `core.state.messages`
  的尾部，而尾部永远是刚压入的 user prompt（`session.ts` 的 drive 循环在
  `core.prompt(opening)` **之后**才调用它）。
- **失败步骤进不了下一轮 history**。`persist()`（`session.ts`）对空 content
  且无 tool_calls 的 assistant 消息直接丢弃——溢出失败步骤（空文本）从落盘
  到 history 重建都被这道闸拦住。**pi 需要 sameModel 是因为它的 session 日志
  保留失败条目（`CustomMessageEntry` 带 status/usage）；我方投影根本不保留。**
- **结论**：守卫在我方结构里没有可达的触发路径。按裁决的降级纪律记录为
  「不可达，不做」，**不引入死代码守卫**。

**落地的是 origin 链**（裁决 §1.4 的前三点，独立于守卫成立）：

| 链点 | 改动 |
|---|---|
| 生产 | `step.ts`：`AssistantStep.origin`，`createStepFunction` 闭包内 `stamp()` 统一盖到全部 8 个出口（答案/拒绝/中止/溢出） |
| 赋形 | `loop.ts`：组装 `AgentMessage` 时透传 `origin` |
| 类型 | `SessionMessage`/`TranscriptEvent` message 变体加可选 `origin`（`isTranscriptEvent` 守卫不查未知字段，老行可读——亲验） |
| 落盘 | `sessionEventCodec` 编码/解码双向保留 `origin`；`persist()` 的注释更新（origin 在 stopReason 剥除后存活，理由入注） |

测试 3 项各钉一个链点（step 三种出口都有 origin、loop 透传、codec 往返），
反向验证：删 loop 透传 → `carries the step's origin` 失败。origin 的直接消费者
是将来任何「这条回答是谁写的」问题（审计、按模型归因）；`/cost` 的用量分桶
在 `recordSessionUsage`（step 层）已按模型记录，不依赖本链。

### 7.2 T2 —— `--skill` / `--no-skills`

按 §2.2 修正后的形状施工（cliOptions 停住、不碰 `RuntimeConfig`）：

- 解析：`cliArgs.ts` 聚合可重复 `--skill`，`-ns` 短形式；**顺手修了一个既有缺陷**——
  值型 flag 的值此前会混进 positional 候选，`--skill ./x.md` 会被
  「positional 项目回退」吃成项目路径（`--tools` 理论上也中招）。修法：positional
  收集与 `derivePromptArgument` 共用同一份模块级 `VALUE_FLAGS`（原先存在，
  只是 positional 收集没用它——重复逻辑合一）。
- 传递：`CliOptions.skillPaths/noSkills` → factory `runPrompt` 填 `skillOptions` →
  bridge 透传 → invocation `discoverSkills` 消费。
- 加载：`SkillLoader` 构造器加 `extraPaths`（文件直读、目录照 discovered 扫描、
  同名显式胜）与 `disableDiscovery`（`--no-skills` 清空发现根，显式路径仍加载）；
  `SkillSource` 加 `"cli"`。
- 信任门：未信任项目的技能过滤放行 `source === "cli"`——命名的文件是用户的
  直接指令，与「未信任项目不能往提示里写文本」是两回事。

测试：`cliArgs` 6 项（聚合/共处/短形式/缺值/不吞 prompt）、`skillLoader` 4 项
（直读/目录扫描/同名覆盖/禁用共存）；反向验证：`disableDiscovery` 失效 →
「silences every discovered skill」失败。**实机（pipe，print 模式）**：
`--skill ./flagless.md` 的无 description 诊断出现在 skills 组件日志（隔离 HOME
下的 `~/.cheers/logs/`），点名该文件——flag → parser → loader 全链在真实进程成立。

### 7.3 T3 —— glob 反斜杠（降级条款触发）+ 技能名边界

**降级条款触发的经过**：按 §3.1 的判别法施工后，`src\**\*.ts`（Windows 分隔 +
通配）被 `usesBackslashAsEscape` 判为「含 `\*` 转义序列 → 原样通过」——即
**判别法把最高频的 Windows 模式排除在归一化之外**。这正是 §3.1 预言的
「无干净判别法」边界：`\*` 在 POSIX 模式下是「转义星号」，在 Windows 习惯里是
「`*.ts` 通配」，**语法上不可区分**。实测四组数据（picomatch 直接跑）：
归一化 `src/**/*.ts` 匹配生效（A）；`a\\b.ts`/`foo\*.ts` 的字面用法当前可匹配
且必须保留（B/C）；`src\a.ts`（`\` 后是字母）当前匹配**字面** `src\a.ts`（D/E）。

**落点**：实现窄版归一化——**仅在整串无任何转义序列时**把 `\` 换 `/`
（`src\packages\a.ts` 这类无通配的 Windows 路径从「永不匹配」变为可用）；
含 `\*`/`\?`/`\\` 的模式**原样保留其既有转义语义**。Windows 通配模式
（`src\**\*.ts`）维持不可匹配——它在本 POSIX 模式匹配器下**从未匹配过任何
东西**，不做没有损失任何现有行为；文档如实记录这个边界，不宣称「支持
Windows glob」。测试 2 项正反两向；反向验证：去掉归一化 →
`src\packages\a.ts` 用例失败。

**技能名边界**：`inspectSkill` 补首尾连字符与连续连字符两条诊断（照 pi 的
`validateName` 形状），else-if 链保证一个名字只报最重的一条。测试 2 项；
反向验证：删分支 → `code--review` 用例失败。

### 7.4 验证汇总

| 项 | 结果 |
|---|---|
| `tsc -p tsconfig.build.json` | 0 错 |
| 受影响套件（turn/session/skills/glob/agent/cliArgs） | 582 项全绿 |
| `verify:import-cycles` / `check:config-consumers`（35/35）/ `check:declarations` | 全 pass |
| `verify:docs-drift:strict` | rules pass；source-drift 78 与 Phase 7 持平 |
| 全量套件 | 见提交信息 |
| 实机 | pipe 验证 `--skill` 全链（skills 日志点名命名文件）；CLI 启动横幅正常（PTY 脚本的 `--help` 预期错误——本 CLI 无 `--help` flag，`/help` 是 TUI 内命令，非回归） |
| 反向验证 | T1 origin 透传、T2 disableDiscovery、T3 归一化与连字符分支——各移除即有测试失败 |
