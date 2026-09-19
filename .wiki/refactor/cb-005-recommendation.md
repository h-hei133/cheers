# CB-005 建议（含对前两份文档的更正）

> 本文回答"你的建议呢？"。写之前又做了判定性测量，**推翻了我自己前两份文档里的两处论断**。
> 先列更正，再给建议——因为建议的走向完全由更正决定。

---

## 0. 对前两份文档的更正（我的错误）

### 更正一：CB-005 的成因表**指错了产生方**

`capability-backlog.md` §CB-005 的问题表写：

| 路径 | 数据形态 |
|---|---|
| `turn/step.ts` | 不产生 `codingResult` |
| `runtime/loop/*` + `provider/request/*` | **产生 `codingResult`** 但不经 turn |

**实测：两侧都不产生。**

| 检查 | 结果 |
|---|---|
| `grep -rn "codingResult\|CodingResult" runtime/loop/` | **0** |
| `grep -rn "codingResult\|CodingResult" provider/` | **0** |
| `git log -S"codingResult" -- runtime/loop` | **空**（历史上也从未有过） |

`codingResult` 的真实产生链在**第三个地方**，两者都不是：

```
core/query/runtime/actionAuthority.ts:105   blockedCodingResult(...)
  → result/projection/shell/assembly.ts:138  buildShellCodingResult(...)
  → result/projection/runtimeOutcomeProjection.ts:42
  → planning/task/taskLifecycleResult.ts / context/graph/contextPacketResult.ts
  → context/acquisition/graph.ts ← context/acquisition/engine.ts
  → planning/runtime/engine.ts
```

### 更正二：O1 **不会**消灭死条件——我把因果说反了

`cb-005-initiation.md` 第 187-189 行写：

> "O1 会自然消灭 O3 的大部分对象……§4 的 4 条死条件大多**自动消失**"

**实测：不消失。** 删除 `runtime/loop/` + `runtime/api/` + `runtime/evaluation/` 后，
我逐一检查的 **16 个死条件读取者全部仍然可达（16/16）**。

原因在更正一：死条件的读取者都在**活轨**（`session/continuation/*`、
`core/shell/sessionTerminalEvidence.ts`、`presentation/surface/sections.ts`），
它们由 `entrypoints/cliRuntimeModule.ts` 经 `session/SessionManager.ts` 直接可达，
**与 loop lane 无任何依赖**。

### 更正三（方法论）：类型导入让死代码**看起来是活的**

判定"某文件是否被使用"时，`import type` 会给出**假阳性**。

| 文件 | CLI 可达（含 type 边） | CLI 可达（仅 value 边） |
|---|---|---|
| `context/acquisition/graph.ts` | ✅ | **❌** |
| `result/projection/shell/assembly.ts` | ✅ | **❌** |
| `core/query/runtime/actionAuthority.ts` | ✅ | **❌** |
| `planning/runtime/engine.ts` | ✅ | **❌** |

`import type` 在 emit 时被擦除，**不产生任何运行时依赖**。
本仓已有 51 个生产文件**零 value 导入者**，其中 48 个仅靠 type 边"挂着"。

---

## 1. 于是 CB-005 的真实成因是

**`codingResult` 的产生链整条被孤立了，而孤立发生在 turn 迁移（`a7418fcb`）时。**

证据：

| 事实 | 位置 |
|---|---|
| `planning/runtime/engine.ts` **零 value 导入者**（链条终点） | 实测 |
| 迁移前有 10+ 个 value 导入者（含 `orchestration/MultiAgentOrchestrator.ts`、`core/shell/recovery.test.ts`） | `git grep` at `a7418fcb^` |
| 迁移删除了 `orchestration/`、`turn facade`、契约 query loop 与 engine | `a7418fcb` commit message |
| 活轨 `turn/projection.ts` 是**唯一**生产 `query.completed` 发出者 | `:120` `:138` |
| 它发出的 `result` **不含 `codingResult`** | `:110-145` 逐字确认 |
| 运行时证据：84 个 `state.json` 中 **0** 个含 `codingResult` | 本会话实测 |

即：**不是"两条路径不连通"，而是"一条路径被删除后，它产生的数据无人接管"。**

---

## 2. 建议

### 结论

**CB-005 的最小真修复是「在 `turn/` 内接回 `codingResult` 产生」——
即 O2 的缩小版，而不是 O1。**

理由：

1. **O1 不解决 CB-005**（更正二已证）。删掉 loop lane 后，16 个读取者仍全在、
   仍全得 `undefined`。O1 是**卫生工作**，不是修复。
2. **O2 的"高成本"论断基于错误前提**。立项文档说 O2 等于"给 `turn` 补一整套投影层"，
   但**投影层已经存在**：`buildShellCodingResult`（`result/projection/shell/assembly.ts:138`，420 行）
   接受的是**显式输入**（`changedFiles` / `failedFiles` / `verification` / `evidence` / `provenance` …），
   **不依赖被删的编排层**。它只是**没人调用**。
3. **`turn/` 已经握有大部分输入**：工具结果、`isError`、
   `turn/tools.ts:172` 的 `[Verification feedback]`、`:123` 的审批 `{operation, decision}`。
4. **缺口是明确的单点**：`turn/tools.ts:173` 的 `afterToolCall` 返回类型
   `AfterToolCallUpdate`（`core/agent/tools.ts:50-54`）只有 `{output, isError, terminate}`，
   **无结构化出站字段**。加一个字段即可，不必新建投影层。

### 建议的执行顺序

| 步 | 动作 | 理由 |
|---|---|---|
| 1 | 在 `AfterToolCallUpdate` 加结构化字段（如 `observation`），`turn/tools.ts:173` 回传审批与验证数据 | 单点、可逆、无裁决依赖 |
| 2 | `turn/` 内累积 observation，`concludeRun` 时调用**已存在的** `buildShellCodingResult` 产出 `codingResult` | 复用而非新建 |
| 3 | 在 `query.completed` 的 `result` 里带上它 | 16 个读取者立即复活 |
| 4 | **然后**再裁决 O1（删 loop lane） | 此时它是纯卫生工作，不再背负 CB-005 |

**第 4 步的关键好处**：先做 1-3 后，`runtime/loop` 的存在与否**与死条件无关**，
O1 就退化成一个干净的删除决策，代价已在 `cb-005-o1-vs-o3.md` 测清（7 个生产文件、6 个仅类型）。

### 不推荐的

- **不要选完整 O2**（复活 `runtime/loop` 作为第二条真路径）。它的 provider 是硬编码合成
  （`runtime/api/host/runtime.ts:338` `createSyntheticModelBoundary`，`:357` `providerMode: "synthetic"`），
  类型 `HostProviderMode` 无 `real` 成员（`contract.ts:17`），
  且 `verify:host-surface.mjs:96-101` **断言 `"real"` 必须被阻断**。
  而且 `turn/synthetic.ts` 已经在活轨上提供了同等能力——**合成 provider 不再需要第二条路径**。

---

## 3. 仍待维护者裁决

| # | 问题 | 建议 |
|---|---|---|
| 1 | `index.ts` 的 host 导出去留 | **可后置**——先做第 1-3 步，此项不影响 CB-005 |
| 2 | `verify:host-surface` 门禁去留 | 同上 |
| 3 | `--host-command` 开关去留 | 同上 |

**这三问在建议路径下都不阻塞**，因为第 1-3 步不触碰 host lane。
它们只在第 4 步（O1）时才需要答案。

---

## 4. 一句话

**CB-005 不是"两条路径没连通"，是"一条路径死了，它的产出没人接管"。
修复 = 让活轨接管 `codingResult` 的产生（复用已存在的 builder），
不是删掉那条已死的路径。删路径（O1）是之后可做的独立卫生工作。**
