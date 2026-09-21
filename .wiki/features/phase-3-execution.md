# Phase 3 执行记录

> **依据**：[`phase-3-decisions.md`](phase-3-decisions.md) 的裁决（7 项主任务 + T7 + 44 项补充裁决）。
> **对照研究**（证据层）：[`phase-3-comparison.md`](phase-3-comparison.md)。
> **本文件记录实际做了什么、以及执行中发现的与裁决不符之处。**
>
> **执行顺序**：T3 → T7 → T1 → T4 → T6 → T2/T2b → T5。

---

## 执行总览

| 任务 | 范围 | 状态 |
|---|---|---|
| T3 | 删除 `thinkingBudgets` + `promptCacheTtl`；`tuiMode` 加注释保留 | ✅ **完成**（§1） |
| T7 | 死字段门禁 | ⬜ 未开始 |
| T1 | 三层遍历 + `.gitignore` | ⬜ 未开始 |
| T4 | 逐模型窗口 + 逐模型压缩预算 | ⬜ 未开始 |
| T6 | 目录列举折进 `read` | ⬜ 未开始 |
| T2 / T2b | `AGENTS.md` 注入 + 技能（一轮） | ⬜ 未开始 |
| T5 | 声明式钩子 + 信任门 + 封堵既有执行面 | ⬜ 未开始 |

---

## 1. T3 — 删除两个说谎的配置字段

**提交**：见 §1.6。

### 1.1 裁决回顾

| 字段 | 裁决 | 理由（已更正版） |
|---|---|---|
| `thinkingBudgets` | **删除** | 无消费位点——我方 **4 条** `/chat/completions` 路径都不消费数值预算，且无 token 型 provider 适配层（无 `budget_tokens`/`thinking_token_budget`）。**不是**原判的「与 `reasoning_effort` 语义冲突」（该论证已被 pi 的实现推翻） |
| `promptCacheTtl` | **删除** | 标准 `/chat/completions` 无请求级缓存 TTL 参数；我方无 `cache_control` 也无 `cacheRetention` 层 |
| `tuiMode` | **保留**，加类型注释 | 它描述的能力**已实现**（`supportsFullScreenSurface` 从 TTY 能力自动判定，5 处消费），只是缺配置入口。与上两个的本质区别是「描述的能力是否存在」 |

### 1.2 施工内容

| 改动 | 位置 |
|---|---|
| 删除 `thinkingBudgets` 声明、默认值、合并行 | `config/runtimeConfig.ts`（原 `:75,113,136-141,223`） |
| 删除 `promptCacheTtl` 声明、默认值、合并行 | `config/runtimeConfig.ts`（原 `:79,117,145,227`） |
| 为 `tuiMode` 补类型注释，说明「已声明未接线」及与已删字段的区别 | `config/runtimeConfig.ts:79-89` |
| 新增回归测试 | `config/runtimeConfig.test.ts`（「does not carry a config key whose value nothing reads」） |

**净变化**：`runtimeConfig.ts` −12 行；测试 +21 行。

### 1.3 执行中发现的与裁决不符之处

**裁决记录说错了验证方式。** `phase-3-decisions.md` §4.5 原写：

> 删除字段会同时删除钉住它们的测试（这些测试只断言「字段存在」——属于「断言实现」而非「断言行为」）。

**实测：没有任何测试钉住这两个字段。** 全仓 `grep thinkingBudgets|promptCacheTtl` 于 `*.test.ts` → **0 命中**。

这个判断错误的**来源**是 `phase-1-execution.md` §2.1——那里记录的测试是**断言往返**（写入配置 → 读回），而该测试的字段列表里**本来就没有**这两个键（它只列 `contextWindow`/`reserveTokens`/`temperature`/`topP`/`maxOutputTokens`/`agentMode`）。裁决记录把「Phase 1 补了往返测试」误推为「这两个字段也被钉住」。

**后果**：删除时无需改任何测试——但**也因此，删除前没有测试能证明它们「曾是活的」**。这正是 T7（死字段门禁）要防的形态：一个字段可以在**零测试、零消费者、零文档**的状态下存活。

### 1.4 施工中发现的一个既有边界（记录，不修）

**配置文件中残留已删键不会报错，也不会有提示。** `getRuntimeConfig` 的解析路径**没有未知键校验**（全仓搜 `unknown`/`unrecognized`/`schema` 于 `runtimeConfig.ts` → **0 命中**），多余键被静默忽略。

- **好处**：向后兼容——用户的旧配置继续可用，不会因为升级而启动失败。
- **代价**：用户**无法知道**某个键已被删除。

**与 T7 的关系**：T7 防的是「文档声明了但代码没接」；此处是「代码删了但用户的配置还留着」。**两者都不报错。** 记录备查，不在 T3 解决。

### 1.5 验证

| 门禁 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc -p packages/ts-shell/tsconfig.build.json --noEmit` | **0 错误** |
| 全量 | `npm run test:ts` | **494 文件 / 2800 通过 / 1 跳过 / 0 失败** |
| import 环 | `npm run verify:import-cycles` | `runtime_cycles=0 type_only_cycles=0`（1433 文件） |
| 文档漂移 | `npm run verify:docs-drift:strict` | pass |
| 构建 | `npm run build:ts` | 成功，`dist/cli.js` 已生成 |

**反向验证（回归测试有效性）**：

- 只重新引入 `promptCacheTtl`（声明 + 默认 + 合并三处）→ 测试**失败**：
  `AssertionError: expected [ 'provider', 'daemonEnabled', …(18) ] to not include 'promptCacheTtl'`
- 移除后 → **通过**。

**即：测试对两个字段**各自独立**有效**（首次验证时两个都在，报的是 `thinkingBudgets`；反向验证时只放回 `promptCacheTtl`，报的是它）。

**实机验证（真实构建产物，非合成）**：

用一份**同时含两个已删字段**的 `.private-agents.json` 调 `getRuntimeConfig`：

| 检查 | 结果 |
|---|---|
| 存活字段正确加载 | `contextWindow: 200000`、`reserveTokens: 30000`、`temperature: 0.2`、`agentMode: "plan"`、`tuiMode: "fullscreen"` ✅ |
| 两个已删字段不在结果键集中 | `has thinkingBudgets: false`、`has promptCacheTtl: false` ✅ |
| 旧配置不报错（向后兼容） | 正常返回，无异常 ✅ |
| 真实 CLI 启动 | `node dist/cli.js` 于该目录正常启动，无错误 ✅ |
| `/context` 命令 | 输出 `Window: 200,000 tokens`——从配置读到，未被删除影响 ✅ |

### 1.6 提交

**提交**：`<见 git log>`（`fix(config): drop two config fields nothing read`）

---

## 2. T7 — 死字段门禁

⬜ 未开始。

---

## 3. T1 — 文件遍历剪枝与 `.gitignore`

⬜ 未开始。

---

## 4. T4 — 逐模型上下文窗口

⬜ 未开始。

---

## 5. T6 — 目录列举

⬜ 未开始。

---

## 6. T2 / T2b — 上下文注入与技能

⬜ 未开始。

---

## 7. T5 — 扩展宿主与信任边界

⬜ 未开始。

---

## 8. 文档结构调整（本轮顺带）

**`phase-3-execution.md` 已改名为 `phase-3-comparison.md`。**

**原因**：该文件的内容是**对照研究**（逐条列参考实现的决定并标注我方立场），不是执行记录。而 `phase-1-execution.md` 与 `phase-2-execution.md` 是**真实的施工记录**。**在开始真正施工时，这个命名会变成一句谎话**——两份不同性质的文件共用一个名字，且 `phase-3-execution.md` 会与即将写入的施工记录冲突。

**处置**：
- `phase-3-execution.md` → `phase-3-comparison.md`（标题改为「Phase 3 对照研究」，tags 从 `execution` 改为 `comparison, research`）；
- 新建**本文件**作为真正的执行记录；
- `phase-3-decisions.md` 中 5 处引用已同步更新（`grep phase-3-execution` → **0 处残留**）。

**符合** `agent-rules/file-placement-and-naming.md` 的「Avoid roadmap-title, phase-title, implementation-process names」精神——文件名应反映**内容性质**，而不是「第几阶段」这个流程位置。
