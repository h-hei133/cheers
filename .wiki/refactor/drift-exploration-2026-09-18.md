# 文档与规则漂移探索（2026-09-18）

> 目标：初步探索并记录两件事——
> ① `./docs/` 大量过期、且"测试涉及这些文档"使删除受阻；
> ② `AGENTS.md` 需要更新以防止此类漂移重演，且它自身指向的文档也已过期。
> **本文件是探索结论，不含改动。** 所有数字由脚本实测。

---

## 1. 问题一 · 第一半：测试**并未**阻碍删除（实测推翻前提）

用户提出的约束是"test 中有涉及这些文档，导致想要直接删除这些文档也成为了一个问题"。
**实测该前提不成立。**

### 1.1 全部 12 个提及 docs 的测试文件，逐一核对

| 测试 | 引用形态 | 是否读取仓库 `docs/` |
|---|---|---|
| `session/continuation/stoppedSessionContinuity.test.ts` | `"docs/uncertain-edit.md"` 作为**提示文本里的目标文件名** | **否** |
| `session/SessionManager.test.ts` | `"docs/failed-edit.md"` 同上 | **否** |
| `core/commands/brainstormCommandRuntime.test.ts` | 断言命令**生成的文本**含 `docs/specs/...` | **否** |
| `core/commands/slashCommandsModern.test.ts` | `"export.md"` 写入 **tempDir** | **否** |
| `core/harness/browser*ScenarioExamples.test.ts`（5 个） | `fs.writeFileSync(path.join(projectPath,"README.md"),…)`，`projectPath` 是临时目录 | **否** |
| `context/discovery/scan.test.ts` | `fs.mkdir(path.join(workspaceRoot,"docs","agent-routes"))`，`workspaceRoot` 是**临时目录** | **否** |

**决定性证据**：

```
grep -rn "join(__dirname|join(process.cwd()|repoRoot" src --include=*.test.ts | grep -i docs
→ 空
```

**没有任何测试从磁盘读取仓库的 `docs/` 树。**
最接近的两处（`scan.test.ts:211/301`、`browser*ScenarioExamples`）
都在 `mkdtemp` 出来的临时工作区里**自建** `docs/` 结构。

### 1.2 非测试消费者同样如此

| 位置 | 引用 | 是否读取仓库 `docs/` |
|---|---|---|
| `scripts/real-provider-readonly-fixture.mjs:33,165` | `'docs/flow.md'` | **否**——在 `fixtureDir` 里**写入**该文件 |
| `packages/ts-shell/package.json`、`vitest.config.ts`、CI | 无 | — |

### 1.3 推论

**删除 `docs/` 没有任何测试或构建依赖阻挡。**
用户之所以认为有，很可能是看到测试里出现 `docs/...` 字样——
**那些字符串是提示语与夹具内容，与仓库文档树无关。**

**唯一真实成本是"知识丢失"**，不是"测试破坏"。**故这一步不需要改动任何测试。**

---

## 2. 问题一 · 第二半：过期程度实测

### 2.1 规模

| 项 | 值 |
|---|---:|
| `docs/` 总文件 | **810** |
| `.md` | **770** |
| 非 `.md` | 40 |
| 子目录 | 17 |

### 2.2 引用陈旧度（关键指标）

用正则提取文档中所有 `packages/ts-shell/src/<path>.ts` 引用，逐条检查文件是否仍存在：

| 项 | 值 |
|---|---:|
| **引用了不存在 `src/` 路径的文档** | **325 / 770（42%）** |
| **死引用总数** | **2417** |

典型（`docs/agent-routes/route01…md` 等）：

```
entrypoints/cli.ts                                ← 实际是 entrypoints/cli.tsx
orchestration/runMvpIntegratedFlow.ts             ← Step 4 已删除整个 orchestration/
orchestration/patchApplication/twoFileUpdateApply.ts  ← 同上
core/query/resultMapper.ts                        ← 已迁移
```

**`orchestration/` 占死引用的绝大多数**——该目录在 Step 4 被完整解散（123 文件分流）。

### 2.3 按最后修改提交分组（git，非 mtime）

| 最后修改 | 文档数 | 判读 |
|---|---:|---|
| 2026-09-18 | 1 | 当前（`architecture/control-plane-atlas.md`，已加陈旧横幅） |
| 2026-09-17 | 21 | 当前（Step 2.7/3 期间更新） |
| 2026-09-14 | 1 | — |
| 2026-08-31 | 7 | — |
| 2026-08-30 | 1 | — |
| **2026-05-12 ~ 06-08** | **约 700** | **"route 时代"文档，主体** |

**约 700/770（91%）的文档在 2026 年 5–6 月后再未被提交修改**，
跨越了本计划全部 Step 1–7 的重构。**42% 含死引用只是可检测的下界**——
未被引用的语句、架构描述、结论同样可能已失真，而那些**无法机械检测**。

### 2.4 为什么"直接删"是个真问题（与 §1 不矛盾）

§1 证明**技术上**无阻挡。但**决策上**仍有三个真问题：

1. **哪些能删？** `docs/` 里混着四类：route 时代的历史证据、当前架构图
   （`architecture/`、`project-map/`）、设计规格（`design/`、`specs/`）、
   以及 Step 2.7 要求保留的**审计底账**（`deleted-audit-*`、`restore-audit-*`）。
   **后两类不可删**，且它们恰好与过期文档混在同一棵树里，没有分界标记。
2. **`docs/DOC_STATUS.md` 是否存在并被遵守？** 见 §2.5。
3. **删除会否毁掉引用来源？** `.wiki/` 与本计划大量引用 `docs/` 下的审计文档
   （例如 §4 的约束来源）。**删文档需先确认引用它的当前文档如何处理。**

### 2.5 待核：是否存在文档状态登记

`docs/DOC_STATUS.md` 曾被本计划引用为"标注 `control-plane-atlas.md` 为 active"的依据。
**需核实该文件是否存在、是否覆盖 770 份文档、标注是否可信**——
若它存在但只覆盖少数文件，则它本身就是漂移的一部分。

---

## 3. 问题二：`AGENTS.md` 自身的漂移（实测）

### 3.1 好的一面：所有链接都还有效

`AGENTS.md` 指向的 11 个路径**全部存在**（9 个 `agent-rules/*.md` + `.wiki/_index.md`
+ `.normproof/dispositions.md`）。**没有断链。**

### 3.2 坏的一面：正文陈述与实际不符

| # | `AGENTS.md` 陈述 | 实测 | 性质 |
|---|---|---|---|
| 1 | `AGENTS.md:34` "Execution is an explicit runtime boundary/interface, currently implemented in TypeScript (`packages/ts-shell/src/`)" | **`src/execution/` 不存在**。执行面实际在 `src/sandbox/`、`core/tools/`、`runtime/loop/` 等。该句把 `src/` 整个目录当作执行面的位置——**等于没说，且指向一个不存在的一级域** | 漂移 |
| 2 | 架构摘要列 "TypeScript is the primary product runtime and control plane: shell, session, **orchestration**, query loop…" | `orchestration/` 已不存在；该词仍是**能力描述**，但读者会去找同名目录 | 歧义 |
| 3 | 引用 `agent-rules/architecture-boundaries.md`，而该文件的 Common Areas **仍列 `orchestration/patchResult/`、`orchestration/patchApplication/`** | 两条路径 Step 4 已消失（见 `architecture-exploration-2026-09-18.md` §5） | 漂移（间接） |

### 3.3 域列表与实际严重不符（15 个域不在名单内）

`AGENTS.md` 与 `agent-rules/file-placement-and-naming.md` 给出的 Owner Domains 是
14 个：`runtime/ turn/ context/ planning/ provider/ tools/ session/ evidence/ result/
presentation/ policy/ edit/ verification/ repair/`。

实际 `src/` 下有 **15 个顶层域不在该名单**：

```
artifacts  browser  cli  config  core  daemon  entrypoints
eval  memory  model-adapters  observability  renderer  sandbox  test-utils  workflow
```

其中 `browser`(1787 文件)、`core`(1515)、`session`(977) 是**体量最大**的域。
**规则说"用既有 owner domain"，但既有域一半不在它的名单里**——
这条规则在实际使用中**无法据此判断归属**。

### 3.4 为什么漂移会反复发生（根因，非表象）

**根因：规则文件与 `docs/` 都没有"随代码变更而更新"的机制，也没有检测手段。**

证据：

- `docs/`：770 份中 700 份自 2026-06 未动，跨越 7 个重构 Step，
  **没有任何门禁检测文档中的路径是否仍存在**。
- `agent-rules/architecture-boundaries.md`：Common Areas 指向 Step 4 删掉的目录，
  **没有任何门禁检测规则文件里的路径是否仍存在**。
- `tsconfig.build.json` 的 `exclude` 只有 `**/*.test.ts`——
  **没有门禁检测新增目录是否泄漏进产物**（见 `architecture-exploration` §2）。
- Step 6 的 **173 个文件改名**：`docs/` 中提到旧名的位置**未被更新**，
  因为改名只作用于 `src/` 内的 specifier。

**共同形态**：本仓的验证全部针对**代码**（tsc / vitest / SCC / judge），
**没有任何验证针对"文档与规则是否仍与其描述的代码一致"**。
因此每次重构都会必然扩大漂移，且漂移不可见。

**这正是用户问的"如何防止再次发生"的答案所在**——不是再写一份文档，
而是**给漂移加一个可运行的检测**。

---

## 4. 初步建议（供裁决，本轮未执行）

### 4.1 立即可做，零决策成本

| # | 动作 | 依据 |
|---|---|---|
| A | 修 `AGENTS.md:34` 的 execution 路径陈述 | 实测 `src/execution/` 不存在 |
| B | 把实际在用的 15 个顶层域补进 Owner Domains 列表（或明确"名单非穷举"） | §3.3 实测 |
| C | 修 `agent-rules/architecture-boundaries.md` 的两条 `orchestration/*` 条目 | 路径已消失 |

### 4.2 需要裁决的方向性选择

**① `docs/` 如何处置**（三类不同处置，必须分开，不能整树删）：

| 类别 | 规模 | 建议 |
|---|---:|---|
| route 时代历史（2026-05/06，含 2417 处死引用） | 约 700 | **归档**（移 `docs/archive/` 或标 `historical` 横幅），**不删**——它们是重构前的证据 |
| 当前架构（`architecture/`、`project-map/`） | 22（2026-09-17 起有更新） | **保留并纳入检测** |
| 审计底账（`deleted-audit-*`、`restore-audit-*`、`capability-backlog`） | 少数 | **保留**（`.wiki` 的约束来源依赖它们） |

**② 是否引入"文档-代码一致性"检测**（治根因的唯一手段）：

候选形式——一个 `scripts/verify-doc-references.mjs`：

- 扫描 `docs/**/*.md`、`agent-rules/*.md`、`AGENTS.md`；
- 对其中形如 `packages/…/*.ts(x)` 与 `src/...` 的路径引用，检查文件是否存在；
- 对已归档文档豁免（按目录前缀）；
- 输出 `[config-failure]`（沿用现有门禁的状态分类学）。

**这会把"42% 文档含死引用、2417 处"从不可见变为可见且可回归。**
与已有 25 个 `verify-*.mjs` 形态一致。

**③ 是否给 `AGENTS.md` 加"防再犯"条款**——例如要求：
每次搬迁/改名/删除必须同步更新 `agent-rules` 与 `docs/` 中被其影响的路径引用，
且该要求由 ② 的检测门禁强制。

**④ 是否收紧 `tsconfig.build.json` 的 `exclude`**（与 `architecture-exploration` §2 同一项）。

---

## 5. 本轮结论

| 问题 | 结论 |
|---|---|
| 测试是否阻碍删除 `docs/`？ | **不阻碍。** 12 个提及 docs 的测试全部只用字符串/临时目录，**零测试读取仓库 `docs/`**。删除无需改测试。 |
| `docs/` 过期程度？ | **约 700/770（91%）** 自 2026-06 未更新；**325/770（42%）含 2417 处死 `src/` 引用**（`orchestration/` 占多数）。 |
| 能否整树删？ | **不建议。** 树内混有四类资产，其中审计底账与当前架构不可删，且无分界标记。**应先分类再归档。** |
| `AGENTS.md` 漂移？ | 链接**全部有效**（11/11）；但**正文有 3 处与实际不符**，且 **15 个顶层域不在其引用的域名单内**。 |
| 为何反复发生？ | **根因：验证全部针对代码，零针对"文档/规则是否仍与代码一致"。** 无检测 ⇒ 每次重构必然扩大漂移且不可见。 |
| 防止再犯的关键？ | **不是再写文档，而是加一个可运行的漂移检测**（§4.2 ②），与既有 `verify-*.mjs` 门禁同形态。 |
