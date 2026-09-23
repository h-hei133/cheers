# Phase 0 裁决报告（2026-09-20）

> **性质**：功能开发第一阶段的裁决记录。**零代码改动**——本文件只记录决策与依据，不施工。
> **依据**：[`.wiki/features/_index.md`](../features/_index.md) 与七份切片报告（2026-09-20）。
> **纪律**：沿用 `plan.md` §2.1/§2.2 的删除授权与前置检查；裁决与执行分离。
>
> **四项裁决全部采纳建议**，维护者已确认。本文件是执行阶段的唯一授权来源。

---

## 0. 裁决总表

| # | 决策 | 结论 |
|---|---|---|
| 1 | 保留哪套配置系统 | **选 A**：保留 `runtimeConfig`，删除 `settingsLoader` 的 `AgentSettings` 层 |
| 2 | 7 处「声明了没接」如何处置 | **选 C**：第 1 组接线、第 2 组接线、第 3 组删除 |
| 3 | 11 个未派发钩子事件 | **删除 4 个**（`PostToolBatch`、`UserPromptExpansion`、`TaskCreated`、`TaskCompleted`），**其余 7 个接入** |
| 4 | `getRuntimeConfig` 漏掉的字段 | 采纳建议：6 个随 P1 修、3 个保留待接线、4 个删除 |

**执行顺序**：决策 4 → 决策 1 → 决策 3 → 决策 2（理由见 §5）。

---

## 1. 决策 1：保留 `runtimeConfig`，删除 `settingsLoader`

### 1.1 裁决

**保留 `config/runtimeConfig.ts`，删除 `config/settingsLoader.ts` 的 `AgentSettings` 层。**

### 1.2 依据（已核实）

| | `runtimeConfig` | `settingsLoader` |
|---|---|---|
| 消费文件数 | **32** | **1**（`cli/interactive/tuiSettings.ts`） |
| 字段消费点 | **60** | **0** |
| 写它的命令 | `/connect`、`/model`（`writeUserRuntimeConfigFile` 8 处调用） | 无 |
| 文档记载 | 有 | **无**——`.agents/settings.json` 在 `docs/` 零命中 |
| env 插值 | ❌ 无 | ✅ 有（`parseSettingsJson`） |

核实命令：

```bash
# runtimeConfig 消费者
grep -rln "runtimeConfig\|getRuntimeConfig\|RuntimeConfig" packages/ts-shell/src --include='*.ts' \
  | grep -v test | grep -v '^./config/' | wc -l          # → 32

# settingsLoader 消费者（排除自身）
grep -rln "settingsLoader\|loadCascadingSettings\|AgentSettings\|DEFAULT_AGENT_SETTINGS" \
  packages/ts-shell/src --include='*.ts' | grep -v test | grep -v '^./config/'
# → 仅 ./cli/interactive/tuiSettings.ts

# .agents/settings.json 是否被文档记载
grep -rln "agents/settings.json" docs/ .wiki/
# → 仅 .wiki/log.md 与本轮新报告；docs/ 零命中
```

### 1.3 三条理由

1. **迁移方向由「谁在写」决定，不由「谁更干净」决定。** `/connect` 与 `/model` 是用户实际会用的命令，它们写 `config.json`。选 B 会让用户已存的凭据需要迁移，而迁移代码本身是新 bug 面。
2. **`settingsLoader` 的文件路径没有任何文档依据。** `.agents/settings.json` 在 `docs/` 里零命中——它不是「用户正在用的功能坏了」，而是**一条从未对外承诺过的路径**。这大幅降低删除代价。
3. **env 插值是真能力，必须搬而不是丢。** `config/schema.ts:1-10` 的 `parseSettingsJson` 支持 `${VAR}` 与 `$VAR`；而 `config/runtimeConfig.ts:167` 用裸 `JSON.parse`。这是选项 A 唯一的实质工作量。

### 1.4 执行清单

**迁移（唯一的新代码）**

- `config/runtimeConfig.ts` 的读文件路径改走 `parseSettingsJson`，把 env 插值带过来
- `cli/interactive/tuiSettings.ts:3,29,45` 的 `getSettingsPaths`/`readSettingsFileSafely` 改用 `runtimeConfig` 的路径函数

**删除（函数级）**

| 文件 | 删除对象 |
|---|---|
| `config/settingsLoader.ts` | `getSettingsPaths`（`:14`）、`readSettingsFileSafely`（`:27`）、`mergeModelSettings`（`:43`）、`mergeSkillsSettings`（`:54`）、`mergePermissionSettings`（`:67`）、`mergeTuiSettings`（`:80`）、`mergeAgentSettings`（`:91`）、`loadCascadingSettings`（`:116`） |
| `config/types.ts` | `ThinkingBudgetTier`（`:5`）、`ModelSettings`（`:7`）、`SkillsSettings`（`:16`）、`PermissionSettings`（`:23`）、`TuiSettings`（`:43`）、`AgentSettings`（`:48`）、`DEFAULT_AGENT_SETTINGS`（`:57`）——**即整文件可删** |
| `config/schema.ts` | 若插值已内联进 `runtimeConfig`，`parseSettingsJson`（`:12`）可随之删除；`interpolateEnvVars`（`:1`）若被内联则保留 |

> **两处已核实的关键细节（与初稿不同）**
>
> 1. **`TuiSettings` 也属于死代码。** `cli/interactive/tuiSettings.ts:21-26` 自定义了 `StoredTuiSettings`（只含 `tui.statusItems`），**从不使用 `config/types.ts` 的 `TuiSettings`**。因此 `config/types.ts` 的 7 个导出**全部无消费者**，整文件可删。
> 2. **`ThinkingBudgetTier`（`:5`）唯一引用者是 `ModelSettings.thinkingBudget`（`:12`）**，随 `ModelSettings` 一起消失。核实：`grep -rn "ThinkingBudgetTier" packages/ts-shell/src --include='*.ts' | grep -v test` → 仅 `types.ts` 自身两处。

**已核实的引用图（决定了删除的完整边界）**

```bash
# config/types.ts 的外部引用
grep -rn "from \"[^\"]*config/types" packages/ts-shell/src --include='*.ts' | grep -v '^./config/'
# → 空。仅 config 内部两处：settingsLoader.ts:12、settingsLoader.test.ts:4

# config/settingsLoader.ts 的外部引用
grep -rn "config/settingsLoader" packages/ts-shell/src --include='*.ts'
# → 仅 cli/interactive/tuiSettings.ts:3

# config/schema.ts 的外部引用
grep -rn "config/schema" packages/ts-shell/src --include='*.ts'
# → 空。仅 settingsLoader.ts:4 引用
```

**结论：三份文件构成一个封闭的引用团**，`settingsLoader` 是唯一出口，而它只有 1 个消费者（`tuiSettings.ts`）。迁移那 1 个消费者后，`types.ts` 与 `schema.ts` 也随之无引用。

| 文件 | 处置 |
|---|---|
| `config/settingsLoader.ts` | 整文件删除 |
| `config/types.ts` | 整文件删除 |
| `config/schema.ts` | `interpolateEnvVars` 迁入 `runtimeConfig` 后整文件删除 |
| `config/settingsLoader.test.ts` | 整文件删除（3 个测试测的都是被删函数），**但先把 env 插值那条迁走** |

**迁移与删除的先后顺序（强制）**

1. 把 `config/settingsLoader.test.ts:7` 的 `interpolates environment variables` 改写成 `config/runtimeConfig.test.ts` 里的一条——断言「含 `${VAR}` 的 config 文件读回时被插值」
2. 再删除 `settingsLoader.test.ts` 与三份源文件

**顺序不能颠倒**：先删测试再迁移，env 插值这条能力就失去了覆盖，而它是选项 A 唯一需要保留的能力。

### 1.5 一个必须避开的陷阱

`DEFAULT_AGENT_SETTINGS`（`config/types.ts:57-80`）里的默认值**全是死的**，其中这一条尤其危险：

```ts
permissions: {
  mode: "default",
  allowRules: ["read:*", "glob:*", "grep:*", "bash:git status*", "bash:git diff*"],
  denyRules: [],
}
```

`allowRules` 看起来像权限防线，**实际不生效**。删除时**不要**把它搬进 `runtimeConfig`——那会把「看起来有权限控制」的错觉带过去。权限实际由 `cli/approval/permissionScope.ts` 的三档（`ask`/`accept-edits`/`allow-all`）驱动。

---

## 2. 决策 2：7 处「声明了没接」——第 1、2 组接线，第 3 组删除

### 2.1 裁决

| 组 | 处置 |
|---|---|
| 第 1 组 | **接线** |
| 第 2 组 | **接线** |
| 第 3 组 | **删除** |

### 2.2 第 1 组 — 接线（有明确受益方等着）

> **✅ 2026-09-23 本组两项均已收口**，见 [`phase-4-execution.md`](phase-4-execution.md) §12–§13。
> 但**接法与本表原设想不同**：`sessionDagEngine.ts` 未接线而是**删除**（273 行、零生产调用者、
> 单文件 JSONL 格式与本产品目录三件套不兼容，与 `sessionThread.ts` 构成重复实现）；
> 分支能力由 `sessionThread.ts` + `store/threadState.ts` 承担，回退入口为 `/back`（或双击 Esc）。

| 项 | 位置 | 受益方 | 动作 |
|---|---|---|---|
| `setTheme` | `presentation/theme/theme.ts:168` | 浅色终端用户（当前被迫用深色） | 接到 `runtimeConfig.theme` 或 `/settings` |
| ~~`branchWithSummary` + `threadState`~~ | ~~`session/sessionDagEngine.ts:184`~~（已删除）；`session/store/threadState.ts:24-71` | rewind 分支摘要（`07-*` §3.1 的 M11） | ✅ 已接到回退链路（`SessionManager.revertTo`） |

**共同点**：**已经有明确的消费者等着**——接线即可交付。

**`setTheme` 是本批唯一「不接就是 bug」的项**：`light.json` 存在、`listThemes()` 会列出它，但 `setTheme` 零调用者，且生产代码 159 处引用 `defaultTheme` 全指向 dark。

### 2.3 第 2 组 — 接线（缺的是下游，不是接线）

| 项 | 位置 | 接线时必须一起做的 |
|---|---|---|
| `metrics` | `observability/metrics.ts:11` | **先决定往哪送**（建议本地 `RotatingFileSink`），否则接上仍空转 |
| `multimodal` | `model-adapters/multimodal.ts:33-68` | 三处一起：编辑器接收 → 存储 → `read`/消息附件。**单接它没有意义** |
| `runtime/events/stream.ts` | `runtime/events/stream.ts:97` | 它是 stdout transport 的一部分，**与 RPC 协议（M9）是同一件事** |

**维护者确认：第 2 组一并接入。** 每项须按其「一起做的」列执行，不得只做单点接线。

### 2.4 第 3 组 — 删除

| 项 | 位置 | 删除理由 |
|---|---|---|
| `hooks/types.ts` 中无派发可能的条目 | `core/hooks/types.ts:5-27` | 见决策 3（删除 `PostToolBatch`、`UserPromptExpansion`、`TaskCreated`、`TaskCompleted`） |

### 2.5 附带规则（强制）

**删除任一项时，同时删除钉住它的测试。** 按 `agent-rules/testing-and-validation.md`，测试**不得**重新钉到新文本上。

7 处里有 5 处有测试，这是本批删除工作的主要成本：

| 项 | 钉住它的测试 |
|---|---|
| `setTheme` | `presentation/theme/theme.test.ts:36-37`（调 `getTheme("light")`）——**接线后保留，它是接线正确性的证据** |
| `threadState` | `session/store/threadState.test.ts` ——**接线后保留** |
| `metrics` | 无 |
| `branchWithSummary` | `session/sessionDagEngine.test.ts` ——**接线后保留** |
| `runtime/events/stream` | `runtime/events/stream.test.ts`（6 处）——**接线后保留** |
| `multimodal` | `model-adapters/strictAndMultimodal.test.ts` ——**接线后保留** |
| `hooks` 4 个事件 | `core/hooks/hooks.test.ts`（164 行）——**仅删除涉及被删事件的部分** |

**注意**：第 1、2 组接线后测试**保留**（它们从「钉住未接线状态」变成「证明接线正确」）。只有第 3 组的删除才连带删测试。

---

## 3. 决策 3：删除 4 个钩子事件，接入其余 7 个

### 3.1 裁决

**删除（4 个）**：`PostToolBatch`、`UserPromptExpansion`、`TaskCreated`、`TaskCompleted`
**接入（7 个）**：`SessionStart`、`SessionEnd`、`PermissionRequest`、`PermissionDenied`、`PreCompact`、`PostCompact`、`StopFailure`

### 3.2 删除依据

| 事件 | 删除理由 |
|---|---|
| `PostToolBatch` | 我们的工具执行是 `tools/dispatch/executor.ts` 逐个调度，**没有「批次」这个实体**。接它要先造一个概念 |
| `UserPromptExpansion` | 我们没有「提示词展开」阶段（提示词模板本身还是 `01-*` 的 MISSING） |
| `TaskCreated` / `TaskCompleted` | 我们的 `todo` 是 `core/commands/todoCommandRuntime.ts` 的项目状态文件，**不是任务生命周期对象**。这两个事件名描述的是 pi 的模型 |

### 3.3 接入清单（7 个，逐个给出派发点）

| 事件 | 现成派发点 | 备注 |
|---|---|---|
| `PreCompact` | `session/compaction.ts:110-138` `createCompactionStep` 的 plan 与 apply 之间 | 可携带 preparation，支持取消 |
| `PostCompact` | 同上，apply 之后 | 携带 summary 与 tokensBefore |
| `PermissionDenied` | `turn/tools.ts:216` 附近的拒绝分支 | 拒绝路径已存在，只是没派发 |
| `PermissionRequest` | 与 `PermissionDenied` 配对（审批请求处） | 两者成对 |
| `SessionStart` | `cli/bootstrap/cliProcessRunner.ts` 的启动序列 | |
| `SessionEnd` | `core/shell/signalHandlers.ts` 的 `handleShellClose` | |
| `StopFailure` | 与已派发的 `Stop`（`turn/session.ts:199`）配对 | **成本近乎零** |

### 3.4 一个必须澄清的限定

**接线 ≠ 可扩展。** `01-*` §2.1 指出我们**没有外部注册路径**：

- `core/hooks/hookDispatcher.ts:38` `registerCommandHook` **零调用者**
- 无 `hooks.json` 加载（`grep -rn "hooks.json"` 仅命中 `hookDispatcher.ts:36` 的注释）
- `registerInProcessHook` 仅被 `core/hooks/builtin/index.ts:21-23` 调用（3 个内置）

**即使 22 个事件全部派发，第三方也挂不上去。** 所以：

$$\text{接线} \Rightarrow \text{类型诚实} \qquad \text{接线} \not\Rightarrow \text{可扩展}$$

**本决策只解决「类型说谎」。** 「建扩展宿主」是 `01-*` §2.1 的独立立项，不在 Phase 0 范围。

### 3.5 核实依据

```bash
# 未派发的 11 个（非测试引用数 = 0）
for e in SessionStart SessionEnd UserPromptExpansion PostToolBatch PermissionRequest \
         PermissionDenied PreCompact PostCompact TaskCreated TaskCompleted StopFailure; do
  n=$(grep -rn "\"$e\"" packages/ts-shell/src --include='*.ts' \
      | grep -v '\.test\.' | grep -v 'hooks/types.ts' | wc -l)
  echo "$e: $n"
done
# → 全部 0

# 我们自己的 3 个内置钩子只监听 PostToolUse
grep -n "event:" core/hooks/builtin/{postMutationLspGuard,affectedUnitTestRunner,evidenceReceiptCollector}.ts
# → 全部 "PostToolUse"
```

**关键新事实**：3 个内置钩子**全部只监听 `PostToolUse`**。即那 11 个已派发事件，目前**也没有内部消费者**——它们是给外部用的。

---

## 4. 决策 4：字段分三类处置

### 4.1 裁决

| 分类 | 字段 | 处置 |
|---|---|---|
| 随 P1 直接修（6） | `contextWindow`、`reserveTokens`、`temperature`、`maxOutputTokens`、`theme`、`agentMode` | 修 `getRuntimeConfig` 的 `return` 展开式 |
| 保留待接线（3） | `tuiMode`、`thinkingBudgets`、`promptCacheTtl` | 在 Phase 2/3 接线 |
| 删除（4） | `autoCompactPercent`、`subagentPromptCacheTtl`、`subagentIsolation`、`permissionMode` | 本次删除 |

### 4.2 删除依据

| 字段 | 理由 |
|---|---|
| `autoCompactPercent` | 与 `reserveTokens` 语义重叠。保留两个阈值旋钮会让人不知道哪个生效 |
| `subagentPromptCacheTtl` | 无子代理缓存隔离的实现 |
| `subagentIsolation` | `core/subagents/subagentLoader.ts` 有 `permissionMode`，但「隔离」是 worktree 级别，无对应实现 |
| `permissionMode` | **与 `cli/approval/permissionScope.ts` 的三档语义冲突**（详见 §4.3） |

### 4.3 `permissionMode` 是本次最需要强调的一项

当前它**完全不生效**（`getRuntimeConfig` 不返回它），所以无害。但一旦「顺手接线」，就会产生**两个权限来源**：

- `config.permissionMode`（`default`/`plan`/`auto`/`acceptEdits`/`bypassPermissions`）
- `cli/approval/permissionScope.ts` 的 `ask`/`accept-edits`/`allow-all`

**权限双源是安全缺陷的经典形态**——用户会以为设了 `bypassPermissions` 就等于关掉审批。**建议在 P1 时直接删除，而不是等接线时再发现冲突。**

### 4.4 P1 的回归测试

`config/runtimeConfig.test.ts:37-51` 的断言是：

```ts
expect(config).toEqual({ /* 恰好那 10 个字段 */ });
```

修 P1 会让它必然失败。**不要更新它。** 改为断言往返行为：

```ts
// 写一个含 contextWindow: 200000 的 config，断言读回 200000
```

这条替换本身就是 P1 的回归测试（修前失败、修后通过），符合 `agent-rules/testing-and-validation.md`。

---

## 5. 执行顺序：决策 4 → 决策 1 → 决策 3 → 决策 2

### 5.1 为什么是这个顺序

**先做决策 4 的 `permissionMode` 裁决，再做决策 1。** 时序陷阱：

如果先删 `settingsLoader`，`AgentSettings.permissions` 里的 `mode`/`allowRules`/`denyRules` 会随之消失，看起来问题解决了；但 `runtimeConfig` 里还留着 `permissionMode`——**同一个隐患换了个位置**。

### 5.2 顺序表

| 序 | 决策 | 产出 | 依赖 |
|---|---|---|---|
| 1 | 决策 4 | 删 4 字段 + 修 `getRuntimeConfig` 展开式 + 6 字段生效 | 无 |
| 2 | 决策 1 | 删 `settingsLoader` 层 + 迁移 env 插值 | 依赖 1（`permissionMode` 已处置） |
| 3 | 决策 3 | 删 4 事件 + 接 7 事件 | 无 |
| 4 | 决策 2 | 第 1 组接线、第 2 组接线、第 3 组删除 | 第 3 组的删除依赖决策 3 |

---

## 6. 验收标准

| # | 判据 |
|---|---|
| 1 | 决策 1：`settingsLoader` 的 8 个函数已删；env 插值已迁到 `runtimeConfig` 并有测试 |
| 2 | 决策 2：第 1、2 组各按「一起做的」列完成；第 3 组已删 |
| 3 | 决策 3：`HookEventName` 联合从 22 → 18；7 个新派发点各有生产调用 |
| 4 | 决策 4：13 个字段各自归位；`getRuntimeConfig` 不再漏字段 |
| 5 | 每条删除都标出连带删除的测试，且**未把测试重新钉到新文本** |
| 6 | `config/runtimeConfig.test.ts:37-51` 已改为断言往返行为，且**修前失败、修后通过** |
| 7 | 四道门禁全过：`tsc -p tsconfig.build.json`、`npm run test:ts`、`verify:import-cycles`、`verify:docs-drift:strict` |

---

## 7. 不在本裁决范围

| 项 | 理由 |
|---|---|
| `OURS-ONLY` 的 16 项 | 维护者指示暂缓，待结合其他参考项目 |
| 建扩展宿主（`hooks.json` 加载 + `registerCommandHook` 接线） | `01-*` §2.1 的独立立项 |
| RPC 协议 / HTML 导出 / session 分享 | Phase 5，需先定义新契约 |
| `context/compact/` 域（5,186 行） | `07-*` §5 标记为最大未覆盖区域；理清它与 `session/compaction.ts` 的关系前不动压缩层 |

---

## 8. 参考

- [`../features/_index.md`](../features/_index.md) —— 七切片缺口总表与 8 项硬缺陷
- [`../features/03-provider-and-model-layer.md`](../features/03-provider-and-model-layer.md) §2.1 —— P1 的实机验证记录
- [`../features/05-tools-and-execution-safety.md`](../features/05-tools-and-execution-safety.md) §2.8 —— 钩子派发缺口
- [`../features/07-context-management-and-compaction.md`](../features/07-context-management-and-compaction.md) §3.1 —— rewind 分支摘要
- [`plan.md`](plan.md) §2.1/§2.2 —— 删除授权依据与六项检查
