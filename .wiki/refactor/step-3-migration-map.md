# Step 3 browser 域搬迁 — 映射表重算（2026-09-17）

原判据（"先删 8 个不可达 browser 文件"）依据的是已被推翻的可达性判据，已失效。
本表按**职责归属**重算，且**目标是保留搬迁**（browser 域有价值，不删）。

## 1. 现状：`core/context/` 是四个域混居

`core/context/` 共 **351 文件**，其中只有约三分之二属于 browser：

| 组 | 文件 | 实际职责 | 判据 |
|---|---:|---|---|
| `browser*` 平铺 | 156 | **browser 域** | 文件名前缀 |
| `browser/` 嵌套 | 67 | **browser 域** | 目录 |
| `pw*` / `stealthPreload` | 5 | **browser 域** | 引用 `browserCapabilityModel` |
| `memory/` | 41 | 项目记忆 | 目录 |
| `sidebar/` | 34 | sidebar 投影 | 目录 |
| `compact/` | 29 | 上下文压缩 | 目录 |
| `startup/` | 9 | 启动注入 | 目录 |
| `model/` | 6 | 上下文模型 | 目录 |
| `routeContinuityHandoff` | 2 | **编排域**（引用 `orchestration/patchResult`） | import 目标 |
| `contextAnalysis` / `contextGovernance` | 2 | 上下文域（引用 `query/microCompact`） | import 目标 |

**问题实质**：`core/context/` 名义是"上下文"，实际是
**browser 实现 + 记忆 + 侧栏 + 压缩 + 启动**的混居地。
这正是"browser 坟场"这一观感的来源——browser 文件占了多数，
但目录名没有表达这一点。

## 2. 域内/域间耦合

| 边 | 数量 |
|---|---:|
| `browser-nested` → `browser-flat` | 111 |
| `browser-flat` → `browser-nested` | 84 |
| `sidebar` → `memory` | 6 |
| `startup` → `memory` | 5 |
| `sidebar` → `compact` | 4 |
| `sidebar` → `startup` | 4 |
| `compact` → `memory` | 4 |
| `memory` → `compact` | 3 |
| 其余（`model` 相关等） | 12 |

**结论**：`browser-flat` 与 `browser-nested` **双向强耦合（195 边）**，
它们是**同一个域被拆成两层**——搬迁时应**合并**为一域，而非保留两层。

其余小域间的边数很低（≤6），**可以独立处置**。

## 3. 外部引用面（搬迁需重写的 import）

| 组 | 文件 | 外部引用边 | 其中生产 | 其中测试 |
|---|---:|---:|---:|---:|
| browser-flat | 156 | 201 | 60 | 141 |
| browser-nested | 67 | 160 | 97 | 63 |
| memory | 41 | 31 | 26 | 5 |
| compact | 29 | 30 | 22 | 8 |
| sidebar | 34 | 17 | 13 | 4 |
| startup | 9 | 5 | 4 | 1 |
| model | 6 | 0 | 0 | 0 |
| flat-other | 9 | 1 | 1 | 0 |

**引用者按目录**：

| 目录 | 边数 | 性质 |
|---|---:|---|
| `core/harness` | 256 | **33 文件中仅 3 个 CLI 可达**，其余全是 scenario fixture |
| `core/commands` | 83 | CLI 可达（browser/memory/sidebar/compact 命令运行时） |
| `core/shell` | 19 | CLI 可达 |
| `runtime/loop` | 14 | 编排层 |
| `eval/browser` | 9 | 离线 eval |
| `entrypoints/cliCommandExecutionBridge.ts` | 9 | **CLI 入口** |
| 其余 | ~58 | 分散 |

**总引用边 448，涉及 124 个文件**（生产值导入 134 边/40 文件，测试 221 边/53 文件）。

## 4. 约束：`core/harness/README.md` 的明确规则

> "Safe cleanup rule: split or move a **subfamily** only after focused tests and
> old import paths are preserved. **Do not bulk-move this directory as one
> artifact family.**"

`core/harness` 自身**不是搬迁对象**（它是 dev/eval 表面），
但搬迁 `core/context` 会**改动它的 256 条引用**——必须分批、保测试。

## 5. 建议的搬迁目标结构

```
packages/ts-shell/src/browser/          ← 新建顶层域（228 文件）
  ├── <browser 平铺实现，命名去掉冗余 browser 前缀>
  ├── receipt/            ← 来自 core/context/browser/receipt/
  ├── runtime/            ← 来自 core/context/browser/runtime/
  └── skill/              ← 来自 core/context/browser/skill/

packages/ts-shell/src/memory/           ← 项目记忆（41 文件）
packages/ts-shell/src/context/compact/  ← 上下文压缩（29 文件）
packages/ts-shell/src/presentation/sidebar/ ← 侧栏投影（34 文件）
packages/ts-shell/src/context/startup/  ← 启动注入（9 文件）
packages/ts-shell/src/context/model/    ← 上下文模型（6 文件）
```

**注意**：`browser/` 与 `browser/receipt|runtime|skill` **合并为一域**（§2 的 195 条双向边）。

## 6. 执行顺序（按风险递增）

| 阶段 | 内容 | 边数 | 风险 |
|---|---|---:|---|
| 3a | `model/`（零外部引用）+ `flat-other` 归位 | 1 | 极低 |
| 3b | `startup/` → `context/startup/` | 5 | 低 |
| 3c | `compact/` → `context/compact/` | 37（实测） | 低 |
| 3d | `sidebar/` → `presentation/sidebar/` | 18（实测外部）+15（域内 escaping） | 中（触及 `core/commands`） |
| 3e | `memory/` → `src/memory/` | 46（实测外部）+5（域内 escaping） | 中 |
| 3f | **browser 域 → `browser/`** | 361（原估）/ 实测分批 1,537 | **高**（触及 CLI 桥 + harness 256 边） |

**3f 必须最后做，且分批**：先 receipt → runtime → skill → 平铺，
每批后跑相关测试。

## 6.1 执行记录

### 3c `compact/` → `context/compact/`（2026-09-18，完成）

- **搬迁**：`core/context/compact/` 全部 33 文件（7 子目录：`checkpoint` `command`
  `continuity` `delivery` `governance` `injection` `policy`）→ `context/compact/`，
  用 `git mv` 保留历史。
- **映射表修正**：原判"30 边"偏低。实测**外部引用边 37 条 / 17 文件**
  （生产值导入 25 边/11 文件，测试 12 边/6 文件），**全部需要改写**——
  目录深度从 4 层变 3 层，每条外部边都要加一层 `../`。
- **域内边不改写**：整树同深度搬迁，域内相对路径（`./x.js`、`../sub/x.js`）解析结果不变。
  仅 **escaping 边**（离开 compact 域的 import）需重算，共 **21 条 / 9 文件**：
  指向 `orchestration/patch{Result,Recovery}/*`、`core/context/model/*`、
  `core/context/memory/*`、`core/query/microCompact`。
- **副作用**：顺带修复 Step 3b 遗漏的一处悬挂 `import type`——
  `core/context/sidebar/sidebarStateProjection.test.ts:7-8` 仍指向已搬走的
  `../startup/*`（测试因类型被擦除而通过，故未被 3b 发现，只有 `tsc` 全量可见）。
  已改为 `../../../context/startup/*`。全量 tsc 错误 253 → 251。
- **验证**：`tsc -p tsconfig.build.json` 0 错；相关域 73 文件/432 测试全绿；
  全量 3172 项（见 log.md 本次条目）；可达性 production 959 / cliReachable 874 /
  cliOpaque 85 **不变**；**PTY 实机**：真实 TUI 执行 `/compact` 与
  `/compact preview`，两次均渲染完整 Compact v2 面板（`closeout-candidate`、
  10 个 memory candidate、preview-only / persistence none），证明搬迁后的
  `compactCommandRuntime` → `compactCommandRunner` → `compactSessionSurface` 链完好。

### 3d `sidebar/` → `presentation/sidebar/`（2026-09-18，完成）

- **搬迁**：`core/context/sidebar/` 全部 34 文件 → `presentation/sidebar/`，`git mv` 保留历史。
- **归属判据**：22 个生产文件职责为渲染/面板/布局/投影
  （`sidebarPanelRenderer`、`sidebarLivePanelRenderer`、`sidebarPanelLayout`、
  `sidebarStateProjection`…），与 `presentation/{surface,terminal,theme,tui}` 同级。
- **映射表修正**：原估 17 边。实测**外部边 18 条 / 10 文件**（生产 14 / 测试 4），
  **域内 escaping 边 15 条 / 3 文件**，合计 **33 条改写 / 13 文件**。
- **搬迁前新增前置检查（本步首次执行，映射表未含）**：对 import 图跑 **Tarjan SCC**。
  起因是发现 `core/context/browserCapabilityModel.ts` 生产代码
  `import { sanitizeSidebarText } from "./sidebar/sidebarStateModel.js"` ——
  属 **`core/ → presentation/` 反向依赖**。核验：搬迁前 **0 环**、按新路径重建图后
  **仍 0 环**；且该形态**已有 4 条先例**（`hotkeyCommandRuntime`、
  `cliSessionProductSurface`），非本步引入。
  **该检查必须做**：环不会让 `tsc` 报错，只有 NormProof judge 或运行时才暴露。
- **验证**：build 0 错；相关域 30 文件/190 测试全绿；全量 **3172 项零失败**；
  可达性 959/874/85 不变；`validate` + `verify:host-surface` 通过；
  **PTY 实机** `/sidebar panel` 渲染完整面板（含 Compact / Memory / Warmup 三节，
  正是本次改写的跨域边链路）。

### 3e `memory/` → `src/memory/`（2026-09-18，完成）

- **搬迁**：`core/context/memory/` 全部 41 文件 → **顶层 `src/memory/`**，`git mv` 保留历史。
- **目标路径核实（关键）**：`src/context/memory/` **已存在但是另一个概念** ——
  `ContextMemory`（工作区上下文复用 / 陈旧失效，41 个 `ContextMemory*` 类型，
  依赖 `context/acquisition/graph` + `context/discovery/scan`），
  与项目记忆（`ProjectMemory*`）**语义无关**。故不并入 `context/memory/`，
  改设顶层 `src/memory/`。映射表原表述 `memory/ → memory/` 含糊。
- **边数修正**：原估 31 边。实测**外部边 46 条 / 15 文件**（生产 36/11，测试 10/4）
  + **域内 escaping 边 5 条 / 3 文件**，合计 **51 条改写 / 18 文件**。
- **最大外部引用者**：`core/commands/memoryCommandRuntime.ts`（12 条）。
- **搬迁前 SCC 检查**：搬迁前 0 环 → 搬迁后 0 环。
- **验证**：build 0 错；相关域 75 文件/438 测试全绿；全量 **3172 项零失败**；
  可达性 959/874/85 不变；`validate` + `verify:host-surface` PASS；
  **PTY 实机** `/memory` 渲染完整 review 面板，`/memory save` 走
  `projectMemorySaveCommandRunner` → `projectMemoryLocalStore` →
  `memoryValidation`/`memoryPersistence`，返回 `blocked / Explicit local memory
  store root is required`（该字符串来自搬迁后的 `projectMemoryLocalStore.ts:99`）。

### 3f `browser/` → `src/browser/`（2026-09-18，分 4 批，完成）

- **搬迁**：228 文件（161 平铺 + `browser/{receipt,runtime,skill}` 67）→ 顶层 `src/browser/`。
- **批次划分与顺序（按依赖方向，非文件数）**：

| 批次 | 内容 | 文件 | 改写 specifier | 涉及文件 |
|---|---|---:|---:|---:|
| 1 | `receipt/` | 14 | 46 | 29 |
| 2 | `runtime/` | 32 | 156 | 80 |
| 3 | `skill/` | 21 | 74 | 32 |
| 4 | 平铺 `browser*` / `pw*` / `stealthPreload` | 161 | **1,261** | **257** |

  顺序理由：`runtime` 引用 `skill/runner` + `skill/runtime`；`skill` 引用 `runtime/*`；
  平铺层被三者共同引用。**先搬被依赖者**，使后续批次的 escaping 边始终指向已存在的路径。
- **平铺批次必须整批**：内部耦合 **567 边**，拆开会导致同一批边被重写两遍。
  escaping 87 边（→`runtime/core` 43、`skill/runner` 17、`receipt` 13）；
  外部 313 边来自 98 文件（`core/commands`、`core/harness`、`eval/browser`、`entrypoints` 桥）。
- **命名未改（重要）**：§5 草案写"平铺实现，命名去掉冗余 browser 前缀"，
  **本步未执行**——`plan.md §3.3` 将**命名税**列为独立 Step 6；
  重命名混入搬迁会让同一 diff 同时论证"位置变更"与"命名决策"。
- **返工记录**：平铺批次首次改写误产出 `.ts` specifier（解析函数返回 `.ts` 路径后
  直接当 specifier 用），tsc 报 440 条 `TS5097`。已 `git reset --hard` 回批次 3 后重做。
- **SCC 前置检查**：四批**全部** 搬迁前 0 环 → 搬迁后 0 环。
- **验证**：build 0 错（全量 tsc 全程 251 不变）；批次测试 55/80/85 全绿；
  **全量 3172 项零失败**（browser 域 58 文件/191 测试）；可达性 959/874/85 不变；
  `validate` + `verify:host-surface` PASS；**PTY 实机** `/browser status` +
  `/browser replay`（后者一条链路同时覆盖批次 1 与批次 4 的产物）。
- **改动纯度**：批次 4 的 140 个变更文件**非 import 改动 = 0**。
- **Step 3 收尾**：`core/context/` 仅剩 `model/` 6 文件（3a 已判定其正确归属）。

## 7. 验证纪律（§2.4）

- 每阶段：`tsc -p tsconfig.build.json` + 该域相关测试 + 全量测试。
- **每阶段搬迁前跑 import 图 SCC 检查**（3d 起强制执行）：搬迁不得引入新的依赖环。
  环不会让 `tsc` 报错（类型解析仍成功），只有 NormProof judge 或运行时才暴露，
  故必须独立核验。核验方式：搬迁前跑一次（基线环数），按目标路径重建图后再跑一次。
  当前基线：**全仓 0 个环**（含测试文件）。
- **触及 `entrypoints/` 或 `cli/` 的批次**（3f 的 CLI 桥部分）→
  **PTY 实机验证**（启动真实 TUI，执行 `/browser` 命令链）。
- `core/harness` 的 256 条引用改动后，需跑 `core/harness` 相关测试确认
  scenario fixture 未断。

## 8. 与 `core/harness` 的关系

`core/harness` **不搬迁**（README 明确它是 dev/eval 表面，不是产品运行时边界）。
但：

- 它有 **14 个 browser scenario fixture** 引用 context 域 → 搬迁后需更新其 import。
- 其 3 个 CLI 可达文件（`browserPublicReadOnlyWebSmoke*`）被
  `entrypoints/cliCommandExecutionBridge.ts` 引用 → 属**产品路径**，
  搬迁 browser 域时需一并处理。

**建议**：3f 完成后，再评估是否把 harness 中的 browser fixture
移入 `browser/` 的测试侧（README 允许"split a subfamily"）。
