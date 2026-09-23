# Phase 4 执行记录

> **依据**：[`phase-4-decisions.md`](phase-4-decisions.md) 的裁决（T1–T8 + 35 项补充裁决）。
> **前置研究**（证据层）：[`phase-4-pre-research.md`](phase-4-pre-research.md)。
> **本文件记录实际做了什么、以及执行中发现的与裁决不符之处。**
>
> **执行顺序**：T1 → T2 → T3 → T4 → T6 → T7 → T5 → T8。

---

## 执行总览

| 任务 | 范围 | 状态 |
|---|---|---|
| T1 | 死接口清理与门禁扩面 | ✅ **完成**（§1） |
| T2 | bash 参数面（`timeout` + 会话环境变量） | ✅ **完成**（§2） |
| T3 | 工具可见性白名单 | ✅ **完成**（§3） |
| T4 | 报数来源（cache token / 逐模型费率 / `tuiMode` / 主题热载） | ✅ **完成**（§4） |
| T6 | 发现面覆盖（技能祖先 / `APPEND_SYSTEM.md` / 主题发现） | ✅ **完成**（§5） |
| T7 | 终端收尾（主题补全 / redo + yankPop / 折叠键） | ✅ **完成**（§6） |
| T5 | 会话 entry 身份与分支接线 | ✅ **完成**（§7） |
| T8 | 输入面（快捷键 / `@` 引用 / 外部编辑器） | ✅ **完成**（§8） |

提交序列（`2bf8e04b` 之后）：

| 提交 | 内容 | 规模 |
|---|---|---|
| `86739806` | T1 | 19 文件，+463/−5183 |
| `066d8032` | T2 | 17 文件，+495/−2 |
| `10a8d64f` | T3 | 9 文件，+196/−0 |
| `6f1809e9` | T4 | 20 文件，+1014/−48 |
| `64af410e` | T6 | 15 文件，+614/−41 |
| `2099c61c` | T7 | 16 文件，+799/−35 |
| `4d2acd89` | T5 | 10 文件，+385/−51 |
| `02a20d21` | T8 | 18 文件，+1655/−262 |

净变化 −5,592 行中的绝大部分来自 T1 的 `runtime/events/` 删除（5,124 行）。

---

## 1. T1 — 死接口清理与门禁扩面

### 1.1 施工内容

- 删除 `runtime/events/`（`projection.ts` 2,997 行 + `stream.ts` 167 行 + 两个测试文件）。
- 接线三个**只能声明、从未派发**的钩子事件。
- 系统提示里的工具列表改为**从注册表派生**，不再手写。
- 新增 `scripts/check-declarations.mjs` + 10 个测试用例，接入 `package.json` 与 `.github/workflows/ci.yml`。

### 1.2 门禁的判定规则

新增门禁只覆盖两类，这是裁决 §1.5 的范围限定：

- **钩子事件**：每个声明的事件名必须在生产代码里有 `dispatch`。
- **工具工厂**：每个工具工厂必须被注册或显式记录。

**不做**接口字段与模块导出的检查 —— 那两类的误报面太大，一个经常误报的门禁会被关掉，等于没有。

### 1.3 关于「124 个不可达模块」

`phase-4-decisions.md` §1.2 已裁定：`runtime/events/` 的删除**不构成**对那 124 个模块的先例。它们由 2026-09-15 的「不动」裁决与 `plan.md` §4.6「10 项未接线候选：全部不恢复」覆盖，本轮未触碰。`plan.md` §2.1 的「可达性只用于分析，不授权删除」仍是有效约束。

### 1.4 验证

- 门禁自身：10 个用例，含「事件只声明不派发必须失败」与「工厂未注册必须失败」。
- 反向验证：移除一个 `dispatch` 调用 → 门禁失败。

---

## 2. T2 — bash 参数面

### 2.1 施工内容

- `bash` 工具新增 `timeout` 参数，经 ts-local 与 rust-daemon 两条路径。
- 5 个 `CHEERS_*` 会话环境变量注入子进程。
- 新增 `runtime/execution/commandTimeout.ts`、`runtime/execution/commandEnvironment.ts`。

### 2.2 与裁决一致的两点

- **默认值保持 60 秒**（§2.2 裁决）。`pi` 无默认，我方不照搬：无默认会让一次挂起的命令永久占用回合。
- **上限 `2_147_483_647` ms 且拒绝而非截断**：一个被悄悄改成别的值的超时，比一个明确报错的超时更难查。

### 2.3 验证

- 反向验证三处：超时参数、环境变量、cache 维度。
- 实测两条执行路径（ts-local、rust-daemon）都收到参数。

---

## 3. T3 — 工具可见性白名单

### 3.1 施工内容

- `allowedTools` 白名单 + `--tools` CLI 参数。

### 3.2 失效方向

裁决 §3.2 定为 **fail-open**：白名单为空或不给 → 全部工具可见。这是安全侧的选择，理由是一个把工具全部藏起来的默认值会让「模型说它没有这个工具」变成最常见的故障，而用户无法从输出里看出原因。

### 3.3 验证

反向验证 8 个用例，其中 7 个在还原实现后失败。

---

## 4. T4 — 报数来源

### 4.1 施工内容

- usage 里带上 cache token。
- 逐模型费率。
- `/reload` 应用主题。
- `tuiMode` 接线（新增 `presentation/tui/render/mainScreen.ts`）。

### 4.2 执行中推翻的记录

- **`problem.md:6` 声称 `pi` 用 CPR（`CSI 6n`）——实测为假。** `pi` 没有 CPR，用的是相对光标移动（`tui-main-screen.ts`）。我方 `mainScreen.ts` 同样用相对移动，光标位置靠自己记账而非查询 —— 查询意味着每次帧都要一次带超时的往返。
- **`03-*` §2.3/§3.1 称 catalog `modelOverrides` 不生效 —— 实测为假**，`dedupeModels` 是 last-write-wins，本来就生效。真正的限制只是 `CatalogModel` 字段太少，`cost` 在 T4 补上。

### 4.2.1 `tuiMode` 接线时改错了默认值（**用户实测发现，收尾修正**）

**缺陷**：`tuiMode` 接线前**零消费者**，界面**无条件进备用屏**（独立页面）。接线时照抄了 `pi` 的默认值 `regular`，而 `regular` 的含义正是「不进备用屏」—— 于是**接线这个动作本身把界面从独立页面改成了主屏**，对所有没设过该字段的人是一次静默的外观变更。

**为什么错**：`DEFAULT_CONFIG.tuiMode = "regular"` 是早期提交 `613b82c2` 写下的**占位值**，从未生效过。`pi` 的默认值不能替我们决定一个**已发布外观**的默认值：接线一个字段时，默认值必须保持接线前的行为，否则「接线」就变成了「改外观」。裁决 §4.3 自己把 `fullscreen` 一栏写作「现状（进备用屏）」，即已承认现状是备用屏 —— 默认值应当跟着现状，而不是跟着参考实现。

**修正**：`DEFAULT_CONFIG.tuiMode` 改为 `"fullscreen"`（接线前的行为）。

**`regular` 标注为实验性**（用户实测确认）：它**尚未针对整体 TUI 适配**。按裁决 §9 第 22 项，只做了「不进备用屏 + 退出回写」两件事；`mainScreen.ts` 的固定块**只在 resize 时重锚，输出增长时不重锚**，所以打字时输入框与输出会错位。已在类型注释、`USAGE_MANUAL.md` §9.4 与裁决 #22 三处如实标注；**未做适配**（按用户指示）。

**补了回归测试**：`runtimeConfig.test.ts` 两条 —— 未设时默认不是 `regular`（反向验证：改回 `regular` 时失败），显式设 `regular` 时生效。缺口之所以存在，是因为**没有任何测试钉住过默认外观**。

### 4.3 门禁豁免表清空

`config-consumers` 的豁免表从有到无：24/24 字段都有生产读取者。

---

## 5. T6 — 发现面覆盖

### 5.1 施工内容

- 技能祖先目录搜索（新增 `core/project/directories.ts`）。
- `APPEND_SYSTEM.md`。
- 主题发现 + `/theme`（新增 `core/commands/themeCommandRuntime.ts`）。

### 5.2 不做 `SYSTEM.md`

替换系统提示会连带删掉 harness 自己的规则，与「追加」是不同的信任决定。只做 `APPEND_SYSTEM.md`，并有一个测试把 `SYSTEM.md` 钉为**未被认领**。

### 5.3 继承的既有取舍（记录，不修）

技能祖先搜索的边界复用 `projectInstructions.ts` 的 `.git` 标记循环，因此**继承 `phase-3-review.md` C-1 记录的同一个取舍**：worktree 里没有自己的 `AGENTS.md` 时主仓库规则不可见。C-1 已判定「是否要改属产品判断」，本轮不改，技能同样适用。

### 5.4 验证

反向验证祖先遍历。

---

## 6. T7 — 终端收尾

### 6.1 施工内容

- **`light.json` 补全**：原本只定义了 39 个 token 中的 23 个，缺 `text`，导致正文在近白背景上渲染成纯白。
- **redo + yankPop**：`ctrl+shift+z` / `alt+y`。
- **折叠键**：`ctrl+o` → 工具，`ctrl+t` → 思考。
- 新增 `presentation/tui/editor/` 四个模块：`killRing.ts`、`editHistory.ts`、`spans.ts`、`yank.ts`。

### 6.2 执行中发现并修复的真实缺陷

`spans.removeSpan` 在跨越换行时**删掉了整行而不是拼接**，会丢掉调用者没要求删除的文本。由新增测试暴露，反向验证确认。

### 6.3 模块规模的如实记录

`editor.ts` 在本次任务**之前**就已经超过 20 名的上限（28 名，且已在 `.normproof/dispositions.md` 里裁定为 defer）。本次新增 redo/yankPop 后若不做拆分是 35 名；拆出四个模块后是 31 名。

**收尾时降到 28**（`8127d017`）：AGENTS.md 要求「先试修，再记录 defer」，所以把本次新增留下的三个薄包装（`caret` / `caretState` / `pushKill`，各两个调用点）内联回去。31 → 28 后，`editor.ts` 回到了它已被复审过的那个数字，**本轮不再往上推**。

**仍高于上限 20**，与 `pi` 对照过：`pi` 的编辑器是 81 个方法一个文件。差异不在拆分遗漏，而在它是「一个类持有共享 caret 状态」——拆分要连同 `browsing` / `draft` / `historyIndex` 一起搬走，即整个 prompt history。已在 dispositions 里按协议记一条新行重申该裁定。

---

## 7. T5 — 会话 entry 身份与分支接线

### 7.1 施工内容

- `TranscriptEvent` 增加 `id`；三个事件工厂 + 两个 append helper 都赋值。
- 旧行没有 `id` → 读取时按行号合成 `line-N`，**不迁移文件**。
- durable thread 跟随会话（`catchUpSessionThread`）。
- `/export jsonl` 透出原始 transcript 行。

### 7.2 与裁决的偏离（一处，方向是**减少**代码）

裁决 §5.3 的 T5-2 是「把 `appendDurableSessionChild` 接到会话写入路径」。执行中发现：

**在 state snapshot 构建处 catch-up 更正确，且让那个函数失去存在理由。**

原因：snapshot 原本写 `current?.thread ?? buildLinear(...)` —— 线程写一次就被保留，之后的回合没有 entry。把 catch-up 放在这个判定点上，**每条写入路径**都会带上它；而接到某一个调用点只覆盖那一个调用点。实测（`.tmp-probe/t5persist.mts`，已删除）：无 snapshot catch-up 时持久化文件停在 `s1:turn-1`，有时是 `s1:turn-1/2/3`。

因此 `appendDurableSessionChild` 被**删除**（零生产调用者），`readSessionThreadSnapshot` 也在读取时 catch-up。裁决的**意图**（线程跟随会话）达成，**手段**改为覆盖更全的一处。

### 7.3 `parentId` 仍未做

与裁决 §5.4 一致：`parentId` 只在分支真的被写入时才有意义。本轮只做了追加路径；分支导航在后续会话中完成，见 §12。`firstKeptEntryId` 仍未接线（§5.5）。

### 7.4 验证

- 反向验证：还原 `asJsonl` 投影路径 → 导出丢失 `type` 与两种特殊 entry；还原 snapshot catch-up → 持久化文件丢回合。
- 实机导出：`compaction` 与 `branch_summary` 都以自身形态保留，且都带 `id`。

---

## 8. T8 — 输入面

### 8.1 施工内容

- 数据驱动快捷键（`keybindings.ts`）+ `~/.cheers/keybindings.json`。
- `@` 文件引用（`fileSuggestions.ts`）。
- 外部编辑器（`externalEditor.ts`）+ `TUI.suspend`。
- 新增 `inputPreferences.ts` 承载三者的状态与重载。

### 8.2 三处实现判断

- **action id 命名**：照 `pi` 的命名空间化命名（`tui.editor.*` / `app.*`），**含义相同才同名**。含义不同时用不同 id —— 共用一个名字但行为不同，会给迁移配置的人一个静默做错事的绑定。
- **覆盖是替换而非追加**：改了 `tui.editor.undo` 之后旧键必须空出来，否则配置文件说一套、界面做一套。用户绑定可以**从默认绑定手里抢键**（`app.retry: "ctrl+l"` 会顶掉 `app.clearScreen`），冲突会被列出。
- **`@` 只在行首或空白后**才算引用：`user@host`、装饰器不该弹文件菜单。接受时只替换 `@…` 一段（`Suggestion.from`），不清掉同一行其他内容。

### 8.3 执行中发现并修复的真实缺陷

1. **配置文件里的裸字符串被当作字符数组迭代** —— `"ctrl+-"` 会绑出 `c`/`t`/`r`/`l`/`+` 五个键。改为在**读取处**（而非仅加载处）归一化。
2. **冲突记录丢失** —— `(claimants.get(key) ?? []).push(...)` 丢弃了新数组，冲突永远为空。改为写回 Map。
3. **`$EDITOR` 带参数无法运行** —— `code --wait` 被当作程序名，ENOENT。改为拆分程序与参数（`splitEditorCommand`），且**不经 shell**：取值来自环境，经 shell 就等于把执行权交给设它的人。
4. **`RecordingTerminal.start` 不清 `stopped`** —— 测试替身的缺陷，被 suspend 测试暴露。

### 8.4 关于 `ctrl+-`

文档示例里 `"tui.editor.undo": "alt+z"` 而非 `ctrl+-`：legacy 终端编码只能表达 `Ctrl+A`–`Ctrl+Z`（码 1–26），`Ctrl+-` 的码是 31，**终端根本不发**。这不是绑定问题，是终端能力边界。

### 8.5 验证

- 实机（`.tmp-probe/t8e2e.mts`、`t8at.mts`，已删除）：改绑后新键生效、旧键空出、`ctrl+g` 到达 host；`read @model` + Tab → `read @src/core/model.ts `（保留 `read `）。
- 反向验证：还原「追加而非替换」语义 → 3 个测试失败；移除 `suspend` 的 `finally` → 3 个测试失败。
- 编辑器失败路径：`false`（非零退出）、不存在的程序、终端交接抛异常 —— 三条路径都恢复终端且清理临时目录。

### 8.6 模块规模

`interactiveMode.ts` 一度因新增两个方法升到 22 名（基线在 20 上限之下）。改为把状态放进 `inputPreferences.ts`（host 接口注入），**回到基线**，`module-facades` 的 monolith 列表回到 T1 前的 5 个。

---

## 9. 验证与门禁

### 9.1 每个提交前跑的门禁

```
npx tsc -p packages/ts-shell/tsconfig.build.json --noEmit
npm run verify:import-cycles
npm run check:config-consumers
npm run check:declarations
npm run verify:docs-drift:strict
npm run test:scripts
npm run analyze:module-facades
npx --package .normproof/normproof-*.tgz normproof judge   # 与 CI 同一条命令
```

全部通过。

`normproof judge` **exits 0，`didBlock: false`，0 条阻塞义务**（唯一阻塞项 `unresolved_specifiers` 为 holds）。
它同时报出 5 条模块上限发现（advisory，不阻塞）——其中 `editor.ts` 与 `turnSink.ts` 本轮各补了一条
`.normproof/dispositions.md` 记录；`editor.ts` 的那条是**收尾时先修后记**（31 → 28，见 §6.3）。

### 9.2 反向验证清单

每一项新测试都做了「还原实现 → 确认失败 → 恢复」：

| 任务 | 反向验证对象 |
|---|---|
| T1 | 门禁（移除一个 `dispatch`） |
| T2 | 超时参数、环境变量、cache 维度 |
| T3 | 白名单（7/8 用例失败） |
| T4 | `tuiMode` 判定 |
| T6 | 技能祖先遍历 |
| T7 | 主题完整性、redo/yankPop、`removeSpan` 换行拼接 |
| T5 | `asJsonl` 投影路径、snapshot catch-up |
| T8 | 覆盖语义、`suspend` 的 `finally` |

### 9.3 全量套件的既有失败（**非本轮引入**）

收工时的全量结果：**516 文件 / 3112 通过 / 1 跳过 / 8 失败**（`--no-threads`，333 秒）。

8 项失败分布在 5 个文件，与本轮开工前的 HEAD 基线**逐文件一致**（`git stash -u` 后复跑结果相同）：

- `src/core/mcp/gateway.test.ts`（1）
- `src/session/longSessionDurability.test.ts`（2）
- `src/core/state/projectState.test.ts`（1，NUL 字节路径）
- `src/sandbox/osSandbox.test.ts`（3，单独跑 12/12 通过 → 跨测试干扰）
- `src/core/messaging/messagingAndTeams.test.ts`（1）

`src/core/harness/browserCliExecutionScenarioExamples.test.ts`（4）与 `browserCacheMultiprocessScenarioExamples.test.ts`（1）在负载下也会失败，本轮未出现。

**本轮引入零个新失败。** T5 引入的两处断言更新（`sessionProjection.test.ts` 的存储形状、`threadState.test.ts` 的 entry id）都是**契约变化**，不是修 bug。

---

## 10. 未做（如实记录）

| 项 | 依据 | 原因 |
|---|---|---|
| `parentId` / 分支导航 | §5.4 | **后续已做**，见 §12 |
| `firstKeptEntryId` 接线 | §5.5 | 该字段活轨无人读；压缩切点仍用 `keptMessages` 计数 |
| `SYSTEM.md` | §6.2 | 与「追加」是不同的信任决定 |
| worktree 里主仓库规则不可见 | §6.1 继承 C-1 | 既有取舍，改动属产品判断 |
| 124 个不可达模块 | §1.2 | 2026-09-15「不动」裁决 + `plan.md` §4.6 |
| `editor.ts` 降到 20 名以下 | §6.3 | 已回到裁定的 28；再降需搬走整个 prompt history，改动面大于收益 |
| `pi` 的旧格式 keybindings 迁移 | §8.2 | 我方无历史格式 |

---

## 11. 文档更正

本轮执行中发现并**推翻**了三处既有文档记录：

| 文档 | 原记录 | 实测 |
|---|---|---|
| `problem.md:6` | `pi` 用 CPR（`CSI 6n`） | 无 CPR，用相对光标移动 |
| `03-*` §2.3/§3.1 | catalog `modelOverrides` 不生效 | `dedupeModels` last-write-wins，本来生效 |
| `03-*` §3.1 | `CatalogModel` 的限制在 overrides | 限制在字段太少；`cost` 已补 |

另有一处**执行中偏离裁决**（已在正文说明）：T5-2 的接线点改为 snapshot 构建处，并因此删除了裁决里要接的那个函数。T7 的 `editor.ts` 一度到 31 名，收尾时已内联回裁定的 28 名（`8127d017`）。

---

## 12. 后续：非破坏性分支导航（`parentId` 那项的落地）

裁决 §5.4 把 `parentId` / 分支导航列为「产品设计，非接线」，本轮（Phase 4）未做。维护者在后续会话中决定做，因为**用户报告 rewind 用起来有问题**。探索由 5 个子代理并行完成（存储形状 / 现有 rewind 缺陷 / 死代码审计 / 参考实现交互 / 上下文重建路径），主代理逐条复现后施工。

### 12.1 真实缺陷：rewind 坏了两次，且两者互相掩盖

**第一层：截断从未落盘。** `rewindTo` 做 `session.turns = session.turns.slice(0, keep)`，然后 `writeSessionMetadata(session)`。但 `projectSessionMetadata`（`sessionMetadataCodec.ts:16-32`）**根本不写 `turns`** —— 而 `loadSessionRecord` 的 turns 来自 `projectTranscriptMessages(transcript.jsonl)`。所以：**截断写进了一个不含该字段的文件**，重开会话时被丢弃的轮次全部回来。

实测（已删除的探针）：`rewindTo(id, 0)` 之后内存里仍是全部 4 条，重开会话也是 4 条。

**第二层：设计上是破坏性的。** 即使落盘成功，它也是「删掉后面说的」。而 thread 本来就是树（entry 有 `parentId`、有 `activeLeafId`），回到某点只需**换一条分支**，不需要抹掉任何东西。

两层互相掩盖：截断没生效，所以没人发现它本该是破坏性的；而「既然反正是删，没生效看起来只是没删干净」。

### 12.2 施工内容

| 改动 | 内容 |
|---|---|
| turn 身份 | turn 在记录时即命名，thread entry 沿用同一个名字。这是「分支能还原成消息」的前提 |
| `sessionThreadPath` | 从 `activeLeafId` 沿 `parentId` 回溯到根 —— 当前分支 |
| `catchUpSessionThread` | 沿活跃路径计数，并**按名字**选取缺失的 turn，避免另一分支上的 turn 被重复追加 |
| `loadSessionRecord` | 只投影当前分支 |
| `rewindTo` → `revertTo` | 切换 active leaf 而非截断；picker 提供 entry id 而非位置下标 |
| 删除 `sessionDagEngine.ts` | 273 行的第二套树实现，存储格式（单文件 JSONL v3）与本产品不兼容，零生产调用者 |

### 12.3 施工中发现并修复的两个自己引入的缺陷

1. **重复 entry**：`catchUpSessionThread` 原本按「活跃分支计数」判断缺失，切换分支后会把另一分支上的 turn 当成缺失而**重复追加**（实测：`t2` 出现两次、`t3` 挂错父节点）。改为按名字判断。
2. **会话被清空**（更严重，静默数据丢失）：`loadSessionRecord` 按分支过滤后，若 thread 指向的 id 与 transcript 里的**对不上**（旧会话无 id 时就会这样），会返回**空会话** —— 读起来是「这个会话什么都没说」，而不是「这两个文件对不上」。改为：thread 若指不出任何一条消息，就不采信它。

### 12.4 验证

- 端到端（一次性探针，跑完即删）：回到 Q1 后换方向提问 → 两条分支都在、可来回切换且各自完整（7 个 entry 无重复）；无 id 的旧会话仍完整加载且可回退。
- 反向验证三项：重复 entry 防护、load 路径接线、thread/transcript 不匹配防护 —— 各自还原后对应测试失败。
- 全量套件：519 文件 / 3119 通过，失败 8 项分布在**与开工前完全相同的 5 个文件**（另见 §9.3）。
- 全部门禁通过（tsc / import-cycles / declarations / config-consumers / docs-drift / test:scripts）。

### 12.5 仍未做

- **树形可视化导航**（`/tree` 式）。当前入口沿用「空草稿上连按两次 Escape」的既有手势，选中的是**提问轮**并把原文放回输入框。参考实现的树选择器组件有 1435 行，其中搜索/过滤/标签/复制/时间戳属于锦上添花；本产品尚未做。
- 分支摘要仍写在 transcript 尾部（`branch_summary` 条目），未按分支归档。
