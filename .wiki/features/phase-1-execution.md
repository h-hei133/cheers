# Phase 1 执行记录（2026-09-20）

> **依据**：[`phase-0-disposition.md`](phase-0-disposition.md) 的四项裁决。
> **执行顺序**：决策 4 → 决策 1 → 决策 3 → 决策 2。
> **本文件记录实际做了什么、以及执行中发现的与裁决不符之处。**

---

## 1. 执行总览

| 决策 | 范围 | 状态 |
|---|---|---|
| 4 | 配置字段分三类处置 + 修 P1 | ✅ 完成 |
| 1 | 删 `settingsLoader` 团 + 迁移 env 插值 | ✅ 完成 |
| 3 | 删 4 个钩子事件 + 接 7 个 | ✅ 完成 |
| 2 第 1 组 | `setTheme` 接线 + rewind 分支摘要 | ✅ 完成 |
| 2 第 2 组 | metrics 接线 | ✅ 完成 |
| 2 第 2 组 | `read` 工具图片处理 | ✅ 完成（见 §6：原判「接线」实为缺陷修复） |
| 2 第 2 组 | runtime 事件流 | ✅ 完成（`--json`，见 §6） |
| 2 第 3 组 | 删（与决策 3 同一批） | ✅ 完成 |

---

## 2. 决策 4：配置字段与 P1

### 2.1 执行内容

**先写回归测试，确认失败，再修**：

```ts
it("keeps every declared optional field that a config file sets", () => {
  // 写一个含 contextWindow: 200_000 等字段的 config，断言读回
});
```

修前实测失败：`expected undefined to be 200000`。

**`getRuntimeConfig` 的 `return` 补齐 10 个字段**，`config/runtimeConfig.ts:197-207`：

```ts
temperature: merged.temperature ?? DEFAULT_CONFIG.temperature,
topP: merged.topP ?? DEFAULT_CONFIG.topP,
maxOutputTokens: merged.maxOutputTokens ?? DEFAULT_CONFIG.maxOutputTokens,
thinkingBudgets: merged.thinkingBudgets ?? DEFAULT_CONFIG.thinkingBudgets,
contextWindow: merged.contextWindow ?? DEFAULT_CONFIG.contextWindow,
reserveTokens: merged.reserveTokens ?? DEFAULT_CONFIG.reserveTokens,
agentMode: merged.agentMode ?? DEFAULT_CONFIG.agentMode,
promptCacheTtl: merged.promptCacheTtl ?? DEFAULT_CONFIG.promptCacheTtl,
theme: merged.theme ?? DEFAULT_CONFIG.theme,
tuiMode: merged.tuiMode ?? DEFAULT_CONFIG.tuiMode,
tui: merged.tui ?? DEFAULT_CONFIG.tui,
```

**删除 5 个字段**（4 个按裁决 + 1 个执行中发现）：

| 字段 | 依据 |
|---|---|
| `autoCompactPercent` | 裁决删除（与 `reserveTokens` 语义重叠） |
| `subagentPromptCacheTtl` | 裁决删除（无实现） |
| `subagentIsolation` | 裁决删除（无实现） |
| `permissionMode` | 裁决删除（与 `permissionScope.ts` 权限双源） |
| **`thinkingLevel`** | **执行中新增**——见 §2.2 |

### 2.2 执行中发现：`thinkingLevel` 是第五个权限双源同构项

裁决漏判了 `thinkingLevel`。它与 `permissionMode` 同构：

- 声明 7 档（`off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`）
- 实际的 thinking 控制走 `core/commands/thinkingCommandRuntime.ts:24` `getThinkingEffort(workspaceRoot)`——**读项目状态文件，不读 config**
- 消费者数：`0`

即：接线会产生「config 的 7 档」与「项目状态的 3 档」两个来源。**按裁决 4 对 `permissionMode` 的同一理由删除。**

### 2.3 裁决「6 个字段随 P1 修」的实际分层

执行中实测：**修好 `return` 只让 2 个字段真正生效**，其余需要额外接线。

| 字段 | 修 return 后生效？ | 额外接线 |
|---|---|---|
| `contextWindow` | ✅ 生效（`cliSessionRuntimeFactory.ts:84`、`sessionFacts.ts:68`） | — |
| `agentMode` | ✅ 生效（`sessionFacts.ts:59`） | — |
| `reserveTokens` | ❌ | 需进 `CompactionPolicy` |
| `temperature` | ❌ | 需进 `StepRequest` |
| `topP` | ❌ | 需进 `StepRequest` |
| `maxOutputTokens` | ❌ | 需进 `StepRequest` |
| `theme` | ❌ | 见 §5（决策 2 第 1 组） |

**根因**：`createProviderStep`（`entrypoints/cliRuntimeInvocation.ts:199`）构造 `StepRequest` 时**只传 5 个字段**，而 `turn/step.ts:113,115,116` 读的 `request.temperature`/`topP`/`maxOutputTokens` 从未被赋值——即使 config 有值也到不了请求。

**已接线**：`reserveTokens` 进 compaction policy；`temperature`/`topP`/`maxOutputTokens` 进 `StepRequest`（`entrypoints/cliRuntimeInvocation.ts:209-214`）。

**验证覆盖的准确边界（重要）**：

| 环节 | 验证方式 | 强度 |
|---|---|---|
| `createStepFunction` 把收到的采样参数写进请求体 | `turn/step.test.ts`「sends the sampling settings the caller configured」 | 实测（断言 `temperature`/`top_p`/`max_tokens`） |
| `createProviderStep` 把 config 值传给 `createStepFunction` | **类型 + 逐行核对** | **未实测** |
| config 文件 → `getRuntimeConfig` | `config/runtimeConfig.test.ts` 往返断言 | 实测 |

**诚实说明**：我做过一次反向验证（移除 `createProviderStep` 的三行传参），`step.test.ts` **仍然全绿**——因为该测试直接构造 `StepRequest`，不经过 `createProviderStep`。即**中间那一跳没有测试覆盖**，只有类型检查与人工核对。要真正覆盖它需要一个 `createProviderStep` 级别的测试，而该函数未导出。

---

## 3. 决策 1：删除 `settingsLoader` 团

### 3.1 执行中发现：整团可删，不是逐函数删

裁决记录已核实的三份文件构成封闭引用团。执行确认：

| 文件 | 结果 |
|---|---|
| `config/settingsLoader.ts` | 整文件删除（8 个函数） |
| `config/types.ts` | **整文件删除**（7 个导出零外部消费者；`TuiSettings` 也无用） |
| `config/schema.ts` | 整文件删除（`interpolateEnvVars` 已内联） |
| `config/settingsLoader.test.ts` | 整文件删除（3 个测试） |

**env 插值迁移**：内联进 `getRuntimeConfig` 的读文件路径（`runtimeConfig.ts:152-159`），并**新增一条测试**断言 `${VAR}` 与 `$VAR` 两种形式都展开。

**注意点（写入代码注释）**：`readUserRuntimeConfigFile` **不做**插值。它喂给 `/connect`/`/model` 的读-改-写路径，插值会把环境变量里的密钥**写回磁盘**。

### 3.2 `tuiSettings` 迁移

`cli/interactive/tuiSettings.ts` 改用 `runtimeConfig` 的路径与读写函数，并把 `statusItems` 提升为 `RuntimeConfigFile.tui` 的一等字段（新增 `TuiPreferences`）。

**行为变化（如实记录）**：原实现「项目设置胜出」，迁移后读的是 `getRuntimeConfig` 的级联（用户配置胜出，与 `providerCredentials` 一致）。对显示偏好而言用户胜出更合理，但这是一处**静默的行为变化**，此处显式记录。

---

## 4. 决策 3：钩子事件

- **删除 4 个**：`PostToolBatch`、`UserPromptExpansion`、`TaskCreated`、`TaskCompleted`。联合从 22 → **18**。
- **接入 7 个**，逐个给出派发点：

| 事件 | 派发点 |
|---|---|
| `SessionStart` | `turn/session.ts` 的 `drive()` 起始 |
| `SessionEnd` | `turn/session.ts` 的通道关闭前 |
| `PermissionRequest` | `turn/tools.ts` 的 `askPermission` |
| `PermissionDenied` | 同上，拒绝分支 |
| `PreCompact` / `PostCompact` | `session/compaction.ts` 的 `createCompactionStep`，经新的 `CompactionLifecycle` |
| `StopFailure` | `turn/session.ts` 的 `conclude()` 失败分支 |

**为 7 个事件补齐 payload 类型**（`core/hooks/types.ts`），使 `switch` 能收窄。

**`PreCompact` 可取消**：新增 `CompactionLifecycle.before`，返回 `false` 即放弃压缩。理由：压缩会丢弃被condense内容的原文措辞，能看见对话的调用方应当有权阻止。

**实测覆盖**：18 个事件**全部**有生产派发点（复核命令见 §7）。

### 4.1 一个测试钉住了旧行为

`turn/tools.test.ts:86` 断言 `expect(setup.dispatched).toEqual(["PreToolUse", "PostToolUse"])`。新增 `PermissionRequest` 后失败。

按 `agent-rules/testing-and-validation.md`，这是**断言新的正确行为**而非重新钉住旧文本——审批往返现在确实是「先请求、后执行」，故更新为 `["PermissionRequest", "PreToolUse", "PostToolUse"]`，并加注释说明为何。

---

## 5. 决策 2 第 1 组

### 5.1 `setTheme` → `applyTheme`

**问题**：159 处调用点持有 `defaultTheme` 这个 `const` 绑定，替换实例不会让它们看到新配色。

**做法**：`Theme` 增加 `apply(config)` **就地换色**，新增 `applyTheme(name)`。调用点无需改动——它们持有的那个实例本身变了。

**删除**：`setTheme`（零调用者）与 `getDefaultThemeInstance`（零调用者，与前者同生共死）。

**接线**：`cli/bootstrap/cliProcessRunner.ts` 启动时按 `runtimeConfig.theme` 调用 `applyTheme`，`auto` 时不动（留给未来跟随终端）。

**已实测**：`--json` 与普通 print 均正常，说明主题初始化未破坏启动路径。

### 5.2 rewind 分支摘要

**原状**：`rewindTo` 直接截断 `session.turns`，被丢弃的轮次不留痕。

**做法**：
1. 新增 `BranchSummaryTranscriptEntry`（`session/sessionEventCodec.ts`）+ `appendBranchSummaryEvent`
2. `projectTranscriptMessages` 把分支摘要投影为 `[Earlier Path]` 上下文条目
3. `rewindTo` 变 async，接受可选 summarizer；摘要成功即落盘
4. `SessionRuntimeDependencies` 增加 `summarizeAbandonedTurns`，工厂用 `requestCompactionSummary` 实现
5. `interactiveMode` 的 rewind 传入 summarizer

**设计要点**：summarizer 缺席时 rewind **照常进行**——回退是用户的决定，不该依赖摘要是否可用。

**已实测**：新增测试证明摘要经投影后出现在上下文里；**并做了反向验证**——移除解码器里的 `branch_summary` 分支后测试失败，确认测试有效。

---

## 6. 决策 2 第 2 组

### 6.1 metrics：从「有 API 无 sink」改为写入日志流

**问题**：`recordCount` 唯一的生产调用点写入一个从未安装的 sink，静默丢弃。

**做法**：不再要求安装 sink，直接把指标写成结构化日志条目（`component: "metric"`）。这样复用已有的**轮转、密钥脱敏、`/log` 读取**，且只有一个查看看地方。

### 6.2 `read` 工具与图片：裁决判为「接线」，实为**缺陷修复**

裁决记录把 multimodal 列为「接线」。执行中发现真正的形态是**一个可复现的缺陷**：

**实测**（真实 CLI）：

```
read probe-image.png
→ 返回 PNG 二进制乱码（\uFFFD PNG\r\n...）
→ 模型如实报告「看到了二进制乱码」
```

**这不是「图片不支持」，是「二进制被当文本读」**——返回的乱码**看起来像内容**，比明确的拒绝更糟。

**做法**（本轮完成的部分）：
- `read` 识别图片扩展名，返回 `image/png` 之类的说明 + 文件大小 + 「用 bash 检查」的指引
- 复用已有的 `model-adapters/multimodal.ts` 的 `isImageFilePath`/`getImageMimeType`/`formatNonVisionFallback`
- 工具描述同步说明该行为

**回归测试**：`core/tools/readImage.test.ts`。**已做反向验证**：移除修复后测试以 `expected '\uFFfdPNG\r\n...' to include 'image/png'` 失败。

**未完成的部分（如实记录）**：真正的**图片输入**（把图片作为附件送给视觉模型）需要：

1. `SessionMessage.content` 从 `string` 改为内容块联合（**156 处消费点 / 15 个文件**）
2. `ExecutionService` 增加二进制读取能力（当前只有 `readTextFile`）
3. 编辑器接收粘贴图片（需要图形协议探测）

这三项是**新基础设施**，不是接线。故本轮只交付可复现缺陷的修复，图片输入另行立项。

### 6.3 runtime 事件流：新增 `--json`

**裁决记录的判断需要更正**。原文称 `runtime/events/stream.ts` 是「stdout transport 的一部分，与 RPC 协议是同一件事」。执行中发现：

- `projectRuntimeEvents` 接受 ~20 个批量输入，产出**一批**投影事件
- `serializeJsonRuntimeEventStream` 把它 `JSON.stringify` 成**一个数组**
- **零生产消费者**

即它是**事后报告投影**，不是事件流。真正的活事件源是 `sessionRuntime.observeEvents()` 的 `QueryEvent`。

**做法**：新增 `--json` 标志，在非交互路径上订阅活事件流，按行输出：

```json
{"schemaVersion":"run-event-stream.v1","order":1,"eventType":"query.started",
 "facts":{...},"truthfulness":{"observationOnly":true,"terminalSuccessClaim":false}}
```

- 新增 `presentation/terminal/jsonEvents.ts`（编号写入器）
- `--json` 时把散文渲染导向丢弃 sink，避免两种输出交错
- 每行自带 `truthfulness` 信封

**实机验证**（真实 CLI，合成 provider）：

| 检查 | 结果 |
|---|---|
| 行数 | 44 |
| 非法 JSON 行 | **0** |
| `order` 单调且从 1 起 | ✅ |
| 全部 `terminalSuccessClaim: false` | ✅ |
| 散文是否泄漏进流 | 否 |
| 退出码 | 0 |
| 不带 `--json` 的 `--print` 仍输出散文 | ✅ |

---

## 7. 验证

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型 | `tsc -p tsconfig.build.json --noEmit` | **0 错误** |
| 全量测试 | `npm run test:ts` | **490 文件 / 2741 通过 / 1 跳过 / 0 失败** |
| import 环 | `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1427 文件） |
| 文档漂移 | `npm run verify:docs-drift:strict` | pass |
| 18 个钩子事件覆盖 | 逐个 grep 生产派发点 | **18/18 有派发点** |
| `--json` 实机 | 真实 CLI（合成 provider） | 44 行全部合法 JSON、order 单调、散文未泄漏、exit 0 |
| 图片读取修复实机 | 真实 CLI | 返回 `image/png` 说明而非 `\uFFFD` 乱码 |
| 反向验证 1（rewind 摘要） | 移除解码器分支后测试失败 | ✅ 测试有效 |
| 反向验证 2（图片读取） | 移除修复后测试以 `expected '\uFFFDPNG'…` 失败 | ✅ 测试有效 |
| 反向验证 3（采样参数） | 移除 `createProviderStep` 传参 | ❌ **测试仍绿**——见 §2.3 |

---

## 8. 与裁决不符之处（需要维护者知悉）

| # | 裁决原文 | 实际 | 处置 |
|---|---|---|---|
| 1 | 决策 4 删 4 个字段 | `thinkingLevel` 同构，也应删 | **已按同一理由删除**（§2.2） |
| 2 | 「6 个字段随 P1 修」（暗示修 return 即生效） | 只有 2 个如此；4 个需额外接线 | **已接线**（§2.3） |
| 3 | `settingsLoader` 逐函数删 | 三文件成封闭团，整团删除 | **整团删除**（§3.1） |
| 4 | multimodal 属「接线」 | 实为可复现缺陷（二进制当文本读）；真图片输入需新基础设施 | **修复缺陷 + 记录未完成部分**（§6.2） |
| 5 | runtime 事件流属「stdout transport 接线」 | 该模块是批量报告投影，非事件流；改用活 `QueryEvent` 实现 `--json` | **以活事件源实现**（§6.3） |
| 6 | `tuiSettings` 迁移（未提及） | 项目/用户优先级发生静默变化 | **已显式记录**（§3.2） |

---

## 9. 未纳入本轮

| 项 | 理由 |
|---|---|
| 图片输入（附件送给视觉模型） | 需 `SessionMessage.content` 类型迁移（156 处）+ 二进制读能力 + 图形协议探测，属新基础设施 |
| 完整 RPC 协议（双向 command/response） | 需定义新契约，属 Phase 5 |
| `OURS-ONLY` 的 16 项 | 维护者指示暂缓 |
| `context/compact/` 域（5,186 行） | 与 `session/compaction.ts` 的关系未理清前不动压缩层 |
