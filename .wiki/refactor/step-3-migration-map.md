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
| 3c | `compact/` → `context/compact/` | 30 | 低 |
| 3d | `sidebar/` → `presentation/sidebar/` | 17 | 中（触及 `core/commands`） |
| 3e | `memory/` → `memory/` | 31 | 中 |
| 3f | **browser 域 → `browser/`** | 361 | **高**（触及 CLI 桥 + harness 256 边） |

**3f 必须最后做，且分批**：先 receipt → runtime → skill → 平铺，
每批后跑相关测试。

## 7. 验证纪律（§2.4）

- 每阶段：`tsc -p tsconfig.build.json` + 该域相关测试 + 全量测试。
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
