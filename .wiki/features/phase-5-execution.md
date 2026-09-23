# Phase 5 执行记录

> **依据**：[`phase-5-decisions.md`](phase-5-decisions.md) 的裁决（T1–T8 + 22 项补充裁决）。
> **前置研究**（证据层）：[`phase-5-pre-research.md`](phase-5-pre-research.md)。
> **本文件记录实际做了什么、以及执行中发现的与裁决不符之处。**
>
> **执行顺序**：T2 → T1（含 T5）→ T4 → T6 → T3 → T7 → T8。

---

## 执行总览

| 任务 | 范围 | 状态 | 提交 |
|---|---|---|---|
| T2 | 死投影族清理 | ✅ **完成**（§1） | `f7edc840` |
| T1 | 重试与错误分类（含 T5 投递模式） | ✅ **完成**（§2） | `5f87ffb3` |
| T4 | 配置降级与诊断 | ✅ **完成**（§3） | `7785e57a` |
| T6 | 压缩文件足迹跨压缩累积 | ✅ **完成**（§4） | `267f5aa7` |
| T3 | 模型目录扩展与请求整形 | ✅ **完成**（§5） | `049a5e5b` |
| T7 | 崩溃日志与启动计时 | ✅ **完成**（§6） | `0c46f435` |
| T8 | 多段编辑（`find` 部分**撤销**） | ✅ **完成**（§7） | `f3eb60b8` |

**7 项任务净变化**：93 文件，**+3,983 / −12,191**（净 −8,208 行）。
删除的绝大部分来自 T2（12,047 行）。

**含复核轮的总净变化**：105 文件，**+6,127 / −12,209**（净 −6,082 行）。
复核轮另加 **+2,144 行**，其中约一半是测试（8 处缺陷的回归测试与新增断言）。
提交序列：`f7edc840` → `f3eb60b8`（7 项任务）、`f5f2a771`（`stream` 修复）、
`e2063abd`（执行记录）、`3ba4abf8`（复核轮 8 处修复）。

---

## 1. T2 — 死投影族清理

### 1.1 施工内容

删除 **32 个生产文件 + 20 个只测试它们的测试文件**（8,330 行生产代码），
按裁决 §2 的三族 + 6 文件连带闭包：

| 族 | 文件 | 行数 |
|---|---:|---:|
| 工具调度与投影（`tools/dispatch` 全族等） | 11 | 2,491 |
| turn 层投影（`nextTurnBundle`/队列/`assistantResponse` 等） | 7 | 1,266 |
| provider 请求/响应包装 | 8 | 2,995 |
| 连带闭包（`session/replay/state` 等） | 6 | 1,578 |

### 1.2 施工前的三项检查（裁决 §2.3 的六项检查逐族执行）

1. **逐个列 importer**：用 `analyze-boundaries.py --list` 的逐文件标记判定「活」
   （CLI 或 scripts 可达），再筛出「非活、有非测试 importer、且 importer 全部非活」的集合。
   实测 **0 个活 importer 指向候选集**。
2. **闭包方向**：候选集**做类型导入**的下游（`session/replay/state.ts`、
   `evidence/savepoint/model.ts` 等）必须一并删除，否则 `tsc` 报悬空 import。
3. **测试引用面**：20 个测试文件引用候选集，其中 11 个**同时**引用活模块。
   逐个核实后确认：**没有任何活模块的唯一测试覆盖落在这 20 个文件里**（实测 0 个）。

### 1.3 验证

- `tsc -p tsconfig.build.json` → **0 错**（闭包算对了才会是 0）
- `verify:import-cycles` → 0 环
- `check:config-consumers` / `check:declarations` → 全过
- `analyze-boundaries.py`：生产 **963 → 931**，**CLI 可达 802 → 802 不变**
  ——整批删除对产品完全不可见
- 全量套件：首跑 3 项失败（性能预算 + cli-baseline），**全部为既有负载敏感项**，
  单独跑通过

### 1.4 执行中发现的一处连带问题

**删除让一个绑定规则与一份 active 文档悬空**。`verify:docs-drift:strict` 报：

- `agent-rules/file-placement-and-naming.md` 的**命名约定示例**列出了
  `session/continuation/readiness.ts`（已删）→ 换成两个仍然存在的文件
- `docs/sprint/project-gap-and-priority-plan.md`（DOC_STATUS 标为 `active`）
  用 7 个已删测试作为**证据引用** → 按该文**自己已有的先例**（它已为上一轮清理写过
  一段「这些路径是历史存档」的说明）补写同型说明并去掉行内代码标注

**这不是本任务的范围扩张**，而是删除的必要收尾：门禁在删除后失败，说明引用已失真。

---

## 2. T1 — 重试与错误分类（含 T5）

### 2.1 施工内容

**两层重试**，与裁决 §1.2 一致：

| 层 | 位置 | 默认次数 | 看到什么 |
|---|---|---:|---|
| provider | `turn/step.ts` 的请求循环 | **0** | HTTP 状态、响应头（`Retry-After`） |
| turn | `core/agent/loop.ts` 的 `retryStep` | **3** | 完成后的 `stopReason` 与错误文本 |

- 新模块 `core/agent/retry.ts`：错误分类（两组正则）、退避、`Retry-After` 解析、
  可中止的等待、按层解析默认值
- `Retry-After` **优先于本地退避**，且仍受配置上限约束
- 上下文溢出**不重试**，保持 `CONTEXT_OVERFLOW_PREFIX` 走压缩恢复
- 取消的运行**永不重试**；账户限额类失败**永不重试**
- 重试进度复用**已有的 `query.retrying` 事件**（不新增事件名——那会让两处可能不一致）

**T5 一并完成**（同为「内核已有能力、无调用点」）：`steeringMode`/`followUpMode`
加配置字段并接到 `AgentCore` 构造处，默认值与内核原有一致。

### 2.2 模块放置的一处判断

`retry.ts` 最初写在 `turn/`，但 `core/agent/loop.ts` 需要它——而
`core/agent/` 不导入 `turn/`（实测）。**移到 `core/agent/retry.ts`**，
让内核拥有自己的重试策略，`turn/step.ts` 从内核导入。

### 2.3 验证

- **反向验证三层**：移除 turn 层重试 → 3 个 loop 测试失败；
  移除 provider 层重试 → 3 个 step 测试失败；
  移除配置往返 → 对应测试失败
- **实机**：见 §8
- 门禁：`config-consumers` 从 24 → **31 字段，全部有生产读取者**

### 2.4 ⚠️ 执行中发现的**自己引入的回归**（全量套件抓出，已修）

**症状**：`cli-baseline.test.ts` 的 `gates resume continuity` 从 **8 秒通过**变成
**37 秒超时失败**，输出停在 `Working through a temporary provider retry...`。

**定位过程**（四步，每一步都排除了一个可能）：

1. **不是负载敏感**：单独跑同样失败（37s），而基线单独跑 8s 通过。
2. **二分定位**：用 `git worktree` 逐个提交跑同一个测试 ——
   `f7edc840`（T2）**通过**、`5f87ffb3`（T1）**失败**。**T1 引入**。
3. **缩小到具体行为**：写一个只做「真实 HTTP mock + 一次请求」的探针复现，
   输出显示请求**成功到达**（mock 记录了 `/chat/completions`）却报
   `Network error: This operation was aborted`。
4. **根因**：重试循环里 `finally { releaseStream.abort(); }` **无条件**释放连接——
   而 `readCompletion` 是在这个循环**之后**才读响应体的。
   原代码的 `finally` 挂在读完之后，我把 `finally` 移到了请求循环内，
   **于是每次成功的请求都被自己的 `finally` 取消**。

**为什么单元测试没抓到**：`step.test.ts` 用**伪造的 `Response` 对象**
（`{ ok, status, headers, json, text }`），**没有 socket 可被取消**。
伪造对象上「释放连接」是个空操作，因此这个缺陷在那一层不可见。

**修复**：每次尝试自己持有 controller，**只有被丢弃的尝试立即释放**；
被保留的那次把 controller 交出去，在**读完响应体之后**才释放。

**新增回归测试**（`turn/stepStream.test.ts`，3 项）：**对真实 HTTP server** 发请求，
覆盖「流式回答」「延迟到达的回答」「重试后读第二次尝试的响应体」。
**反向验证**：把修复还原成 `finally { releaseStream.abort(); }` → **3/3 失败**。

**这条记录的价值**：它是本项目「伪造替身让缺陷不可见」的一个新实例——
与 `phase-4-execution.md` §15.6 的三处历史测试漏洞同型。
`cli-baseline.test.ts` 之所以能抓到，正因为它 **spawn 真实进程 + 真实 HTTP mock**。

---

## 3. T4 — 配置降级与诊断

### 3.1 施工内容

`getRuntimeConfig` 不再因配置语法错误抛异常，改为**跳过该文件 + 产出一条诊断**。
诊断经 `RuntimeConfig.configDiagnostics` 输出到三处：启动横幅、`/doctor`、CLI `doctor`。

### 3.2 一处**必须保持抛异常**的路径（执行中的关键判断）

`readUserRuntimeConfigFile` 服务于**读-改-写**路径（`/model`、`/connect`、
`/settings` 读它、改一个字段、写回）。若它也在坏文件时返回 `{}`，
**下一次写入会把用户整个配置替换成那一个字段**。

裁决 §4.2 只说了「改为降级」，**执行中识别出这条路径必须例外**，
并在源码注释里写明理由，避免后来者「统一」两者。

### 3.3 验证

- **反向验证**：恢复 `throw` → 4 个测试失败
- **实机**：见 §8（坏配置下 CLI 正常启动并报出文件名与位置）
- 三条既有测试钉住了旧的抛异常行为，**已改写为新契约**（不是删掉）

---

## 4. T6 — 压缩文件足迹跨压缩累积

### 4.1 施工内容

**执行中发现了一条比裁决更省的路径**。裁决 §6.2 要求「给 `CompactionTranscriptEntry`
加文件明细字段」。核实后发现：**足迹本来就已持久化**——压缩把它写进 checkpoint 文本，
而下一个压缩收到的 `previousSummary` 正是那个文本。

因此改为：**解析上一条 checkpoint 自己的足迹并合并**。
不新增字段、不需要迁移、不留第二处真相。

### 4.2 合并规则

- 改过的文件只算「改过」（两个列表都列等于把同一件事说两遍）
- 每类上限 200 条，**保留最新的**（长会话能碰几百个文件）
- 解析是防御性的：旧格式、手改过、被截断的文本一律得到空列表，不报错

### 4.3 验证

- 10 个单元测试（提取、解析、合并、上限、空值）
- 5 个端到端测试（经 `requestCompactionSummary`，用 stub provider）
- **反向验证**：还原为「只看当前 messages」→ 那条「上一条 checkpoint 记录过的文件
  仍然被列出」的测试失败

---

## 5. T3 — 模型目录扩展与请求整形

### 5.1 施工内容

`CatalogModel` 加 5 个字段（3 → 8）：`reasoning`、`thinkingLevelMap`、`maxTokens`、
`input`、`compat`。新模块 `core/models/requestShape.ts` 把它们解析成**四个改变
请求字节**的决定：system 角色的名字、输出上限字段名、是否发 `reasoning_effort`、
是否需要合成 assistant 桥接。

### 5.2 两处默认值的判断（执行中修正了自己）

1. **`reasoning` 的默认**：初版把「未声明」当作「不支持」，这会**静默关掉
   `/thinking`**——因为快照里**没有一个条目声明过 `reasoning`**。改为
   「未声明 = 照旧发送」（`false` 才是唯一会停发该字段的值）。
2. **未知模型的 level**：初版在模型不在目录里时完全不发 level，同样会静默关掉
   `/thinking`。改为**按档位名本身发送**——这正是目录能描述模型之前的行为。

两处都由测试钉住（`still sends a level for a model it does not know`、
`still drops reasoning_effort when the host refuses it`）。

### 5.3 验证

- 17 个解析器测试 + 3 个端到端 payload 测试
- **反向验证两层**：还原硬编码 payload → 1 个测试失败；
  把解析器缩成默认值 → **12 个测试失败**
- 门禁全过

---

## 6. T7 — 崩溃日志与启动计时

### 6.1 施工内容

- `observability/crashLog.ts`：保留最近 **5** 条，写 `<userDataDir>/crashes.json`；
  用 **`prependListener`**（后注册的监听器后运行，别的监听器先退出就会带走记录）；
  写入包在吞异常的 `try/catch` 里
- `observability/startupTiming.ts`：`CHEERS_TIMING=1` 时记录**相邻标记的差值**；
  关闭时**什么都不做**（不是「记录后不打印」）
- 新命令 `/crash`（含 `--stack`）与 `/timings`

### 6.2 验证（含一次意外收获）

**实机**：在真实 PTY 里跑 `/timings` → 输出 5 个阶段与 22ms 总计。
`/crash` 与 `/crash --stack` 都渲染正确。

**意外收获**：崩溃日志在测试过程中**真的记录了崩溃**——PTY 会话结束时
渲染中的 `write EPIPE` 被捕获（`StreamingRenderer.renderLine` 的调用栈）。
这正是该功能存在的场景，且**不是构造出来的**。

---

## 7. T8 — 多段编辑（`find` 部分撤销）

### 7.1 `edits[]` 施工内容

- 每个 segment 对**原文**匹配（不是对前一个 segment 的结果），
  否则结果取决于书写顺序
- **重叠拒绝**并指名是哪两段；任一段匹配失败则**一个字节都不写**
- 为做到这点，`editEngine.ts` 拆出 `locateInContent`（返回匹配**跨度**），
  九个策略与顺序不变，因此单段路径行为不变
- 从**后往前**应用，避免前一处替换移动后一处的偏移
- `replaceAll` 现在要求**精确**匹配（模糊匹配重复多次时每处覆盖的长度不同，
  「全部替换」就没有单一含义）

### 7.2 **撤销裁决的一半：不新建 `find`**

裁决 §8.2 的理由是「`glob` 返回匹配文件（含内容），`find` 返回路径列表，后者更省 token」。

**该前提经实测证伪**：

- `core/tools/glob.ts:82` 取的是路径，`:90` 是 `page.join('\n')` —— **只拼接路径**
- 全文件唯一的 `content` 命中是那个拼接结果的变量名，不是文件内容
- 底层 `listWorkspaceFiles`（`fileWalk.ts:217`）返回 `readonly string[]`

逐项对照 `pi` 的 `find`：模式匹配 ✅、只返回路径 ✅、尊重 `.gitignore` ✅
（优先问 git，退化到读 `.gitignore`/`.ignore`）、剪枝 ✅、`limit` ✅。
**新建即重复**，且会让模型在两个同义工具名之间做选择。

已在 `phase-5-decisions.md` §8.2 原位记录撤销与证据。

### 7.3 验证

- 12 个引擎测试 + 5 个工具层测试
- **反向验证**：关掉 segment 分支 → 3 个工具测试失败；
  关掉重叠检查 → 1 个引擎测试失败

---

## 8. 实机验证

| 任务 | 场景 | 结果 |
|---|---|---|
| T4 | 坏 `.cheers.json` 启动 CLI | 正常启动，报 `Invalid config at …/.cheers.json: Expected double-quoted property name in JSON at position 43` |
| T4 | 合法配置 | 无警告，`provider=anthropic`、`max-turns=7` 均生效 |
| T7 | 真实 PTY 执行 `/timings` | 5 个阶段 + 22ms 总计 |
| T7 | 真实 PTY 执行 `/crash`、`/crash --stack` | 空状态与带栈记录都正确渲染 |
| T7 | 崩溃日志捕获真实崩溃 | PTY 关闭时的 `write EPIPE` 被记录（非构造） |
| **复核轮** | **构建产物**中未捕获异常 | `NODE_OPTIONS="--import boom.mjs" node dist/cli.js` → **exit 7**，且 `crashes.json` 先写入 1 条 |
| **复核轮** | 用真实崩溃数据渲染 `/crash --stack` | 正确显示记录与栈 |

**未做实机验证**：T1 的重试（需要可复现的 429/502 端点）、T3 的请求整形
（需要真实 provider）、T6 的多次压缩（需要长会话）。
三者都有 stub provider 层面的端到端测试，但**没有对真实端点验证过**——如实记录。

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
python3 scripts/analyze-boundaries.py
```

全部通过。`config-consumers` 从 **24 字段 → 32 字段**，全部有生产读取者。

### 9.2 反向验证清单

每一项新测试都做了「还原实现 → 确认失败 → 恢复」：

| 任务 | 反向验证对象 | 失败数 |
|---|---|---|
| T1 | turn 层重试 / provider 层重试 | 3 / 3 |
| T4 | 配置降级 | 4 |
| T6 | 足迹合并 | 1 |
| T3 | payload 整形 / 解析器 | 1 / 12 |
| T8 | `edits[]` 分支 / 重叠检查 | 3 / 1 |

### 9.3 全量套件

| 轮次 | 结果 | 说明 |
|---|---|---|
| 首跑（T1 未修时） | 3195 项，**2 失败** | `cli-baseline.test.ts` 的 resume 与 golden 两项，见 §2.4 |
| 修复后（第二次） | 3198 项，**1 失败** | `presentation/tui/surface/benchmark.test.ts`，见下 |
| 修复后（第三次） | **3197 通过 / 1 跳过 / 0 失败** | 同一套件，benchmark 这次通过 |

**剩余的 1 项**：`presentation/tui/surface/benchmark.test.ts` 的
「long-transcript budget」——它断言一次渲染在 **1000ms** 内完成，
实测 1233ms。**单独运行通过**（242ms），是全量并发下的负载敏感项，
与本次改动无关（它测的是 TUI 渲染性能，不触及 turn/config/tools/observability）。

**这一项在本轮之前就存在**：`phase-4-execution.md` §9.3 已记录过同类项
（性能预算 + cli-baseline 在负载下失败）。本轮**修掉了 cli-baseline 的真实回归**，
benchmark 仍是负载敏感项——**连跑三次里它失败一次、通过两次**，
这正是「负载敏感」与「真实失败」的区别：真实失败每次都失败。

**结论：本轮引入的失败为 0。** 唯一不稳定项是一个既有的、对机器负载敏感的
渲染性能断言（它断言 1000ms 内完成，实测 1233ms；单独跑 254ms）。

---

## 10. 未做（如实记录）

| 项 | 依据 | 原因 |
|---|---|---|
| `find` 工具 | §7.2 | **撤销**——`glob` 已是等价物（实测证伪原前提） |
| `ls` 工具 | 裁决 §9.1 | 能力已在 `read` 的目录分支里 |
| `powershell` 工具 | 裁决 §9.1 | `/shell use powershell` 已覆盖 |
| cache 保活、传输选择、订阅式 OAuth、RPC/SDK、HTML 导出、图片输入、Mermaid、转录内搜索、树形导航 | 裁决 §9.2 | 逐项附理由 |
| `evidence/savepoint/model.ts` 等 50 个零 importer 文件 | 裁决 §9.2 第 8 项 | 无可指名活轨承担者，按 `plan.md` §2.1 保留 |
| 主题 14 个零消费令牌的删除 | 裁决 §9.2 第 6 项 | 会让用户已写的主题名失效 |
| transcript header/version 行 | 裁决 §9.2 第 5 项 | 契约变更，且「给别人读」尚无消费者 |

---

## 11. 复核轮（Phase 5 之后）

对 Phase 5 的 8 个实质提交做对抗式复核：5 个子代理按切片并行，
外加主代理独立审计。**发现 8 处缺陷，全部已修并反向验证。**

### 11.1 子代理分工与结果

| 子代理 | 切片 | 结果 |
|---|---|---|
| `RvRetry-2` | T1/T5 重试 + `f5f2a771` 修复 | **零发现**（逐个 abort 点、外层循环终止性、分类正则、`Retry-After` 解析、两层默认值、`stepStream` 测试均已核） |
| `RvConfigCompaction` | T4 配置降级 + T6 足迹 | T4 **判定安全**（无降级回写路径）；T6 **1 处缺陷** |
| `RvModels` | T3 模型目录 | **3 处缺陷** |
| `RvObservability` | T7 可观测 + T8 编辑 | **3 处缺陷**（与主代理独立复核重合 2 处） |
| `RvDeletion` / `RvDeletion2` | T2 删除 | **两次均被上游 `content_filter` 中断**，主代理自行完成该审计 |

`RvDeletion` 与 `RvDeletion2` 均失败于供应商侧内容过滤（非本仓库问题）。
该切片的审计由主代理完成，方法与结论见 §11.3。

### 11.2 八处缺陷

| # | 位置 | 缺陷 | 严重度 |
|---|---|---|---|
| 1 | `observability/crashLog.ts:127` | **注册 `uncaughtException` 监听器会取代 Node 的默认终止行为**。注释写「已重抛」，代码从不重抛 → **每个致命崩溃都变成进程继续运行**。实测：无监听器 exit 1，加监听器 exit 99（存活） | 破坏用户可见行为 |
| 2 | `observability/crashLog.ts:103` | 注释称 `unhandledRejection` 的继续运行「是 Node 默认」，**错误**——Node ≥15 起未处理拒绝是致命的。该行为是真实改变，须如实说明 | 文档失真 |
| 3 | `core/commands/crashCommandRuntime.ts:50` | `args[0] === "--stack"` 按位置读标志 → `/crash foo --stack` **不显示栈，同时抑制了「加 `--stack`」提示**：用户既没拿到栈也没拿到怎么拿 | 破坏用户可见行为 |
| 4 | `core/tools/registry.ts:537` | `edits[]` 与 `oldText`/`newText` 同时给出时，**前者静默胜出并返回 `success: true`**，后者的替换被丢弃 | 破坏用户可见行为 |
| 5 | `core/tools/registry.ts:565` | 同上，`content` 与 `oldText`/`newText` 同时给出时 `content` 被静默丢弃（主代理实测发现，子代理未覆盖） | 破坏用户可见行为 |
| 6 | `core/query/compaction/fileFootprint.ts:58,130` | 输出前 `.sort()` **把「最近 200 个」变成「字典序最后 200 个」**。checkpoint 文本回读后顺序即字典序，**第二次压缩起按字母丢文件**。实测：`zzz.ts`（最旧）存活，`a000.ts`（较新）被丢 | 契约违反 |
| 7 | `core/models/catalog.ts` | `maxTokens`/`input` **零生产读取者**；且**所有内置模型零 `compat`** → T3 接线后对开箱模型**完全无效** | 未完成的功能 |
| 8 | `core/tools/registry.ts:509` | `replaceAll` 与 `edits[]` 同时给出时，**`edits` 路径从不读 `replaceAll`** → 调用方以为替换了全部出现，实际只替换第一处（主代理在同型缺陷排查中追加发现） | 破坏用户可见行为 |

**第 1 与第 7 项是同一类错误的两面**：一个把「声明了」当「生效了」，
一个把「写了注释」当「实现了行为」。

### 11.3 T2 删除的独立审计（子代理失败后由主代理完成）

结论：**删除是闭合的**。

| 检查 | 方法 | 结果 |
|---|---|---|
| 无悬空 import | 对 32 个被删模块路径全仓搜 `from "…<path>.js"` | **0 命中** |
| 无存活 importer | 在父提交 `f7edc840^` 列出每个被删模块的 importer，逐个比对删除清单 | **0 个未删的 importer** |
| 无悬空文档引用 | 搜 `.wiki/`/`docs/`/`agent-rules/`/`.normproof/`/`scripts/` | 仅 `phase-5-*` 自身（合法描述删除） |
| 被删测试未覆盖存活模块 | 逐个检查被删 test 的同名模块是否仍在 | **0 个仍在** |
| 行为有替代 | 读被删模块的导出，找现承担者 | `withFileMutationQueue`→`runtime/execution/fileLock.ts`；`deliveryPolicy`→`core/agent/agent.ts:47` 的 `PendingQueue`；流式/工具派发→`core/agent/loop.ts` |

活轨确认：`turn/session.ts:128` → `AgentCore`（内核），内核持有流式（`loop.ts:109`）
与工具派发（`loop.ts:216`），被删层确实已被取代。

### 11.4 修复方式

| # | 修复 |
|---|---|
| 1 | `onUncaught` 改为 `(): never` 并在写完记录后 **`throw error`**；注释写明「注册任何监听器都会取代默认终止」，并附实测退出码 |
| 2 | 注释改写为如实描述：该行为**是**对 Node 默认的改变，并说明为什么长会话要这样 |
| 3 | 改为 `const wantsStack = args.includes("--stack")`，读一次，按存在而非位置 |
| 4/5 | 三种写法改为**互斥校验**：`edits`×`content`、`edits`×`oldText/newText`、`content`×`oldText/newText` 全部拒绝，任一组合都不再静默丢弃 |
| 6 | 去掉 `extractFileFootprint` 与 `mergeFileFootprints` 两处 `.sort()`；并把「再次读到的文件」`delete` 后重加，使其真正移到最近端 |
| 7 | `maxTokens` 接线：新增 `ResolvedRequestShape.maxOutputCeiling`，`step.ts` 在 `request.maxOutputTokens` 未设时回退到它；`input` **删除**（无消费者，见裁决 §3.2 撤销记录）；`BUILTIN_PROVIDERS` 按证据补 `compat` |

**第 7 项的证据**：`pi` 的 `generate-models.ts:744` 对 DeepSeek 等设
`maxTokensField: "max_tokens"`，对 OpenAI 推理模型设 `max_completion_tokens`；
`:183,240` 设 `supportsDeveloperRole: false`；`:2269` 对 DeepSeek 设
`supportsReasoningEffort: false`。**独立核实**：OpenAI 官方帮助页确认
gpt-5/o 系列**拒绝 `max_tokens`**、要求 `max_completion_tokens` 与 `developer` 角色。
由于 `DEFAULT_CONFIG.maxOutputTokens: 4096` 且**总是发送**，
修复前**每一个 gpt-5/o 系列请求都会被拒**。

### 11.5 反向验证

每个修复都做了「还原 → 测试必须失败 → 恢复」：

| # | 反向验证结果 |
|---|---|
| 1 | 还原为吞掉异常 → **2/12 失败**（含真实子进程退出码断言） |
| 3 | 还原为按位置读 → **1/4 失败** |
| 4/5 | 还原互斥校验 → 新加的 2 项失败 |
| 8 | 还原 `replaceAll` 守卫 → 1/22 失败 |
| 6 | 还原 `.sort()` → 1/13 失败；单独还原「重加提升」→ 1/13 失败 |
| 7 | 还原 `compat` → **3/5 失败**；还原 `maxOutputCeiling` → 1/22 失败 |

### 11.6 新增回归测试

| 文件 | 覆盖 | 为什么单元测试原先抓不到 |
|---|---|---|
| `observability/crashLog.test.ts`（+`test-utils/crashRecorderProcess.ts`） | **真实子进程**的退出码 | 原测试直接调用 handler，**无法观察进程是否存活** |
| `observability/startupTiming.test.ts` | 首个 mark 非零、计入 total | 原测试**把 `first: 0ms` 断言为正确**——测试固化了缺陷 |
| `core/commands/reportCommands.test.ts` | `/crash` 的 `--stack` 三种位置、`/timings` 未开启时的说明 | 两个新命令**原先零测试** |
| `core/tools/highValueTools.test.ts` | 四种参数组合互斥 | 只测了 `content`×`edits` 一种 |
| `core/models/catalogShape.test.ts` | **内置目录**的线上取值 | 原测试只用手工构造的目录，**内置目录零断言** |
| `core/models/requestShape.test.ts` | `maxOutputCeiling` | 字段当时还不存在 |
| `core/query/compaction/fileFootprint.test.ts` | 跨两次压缩的最近性 | 原测试的 `many` 数组恰好**字典序 = 时序**，掩盖了缺陷 |

**共 8 处「测试固化了缺陷 / 测试看不到缺陷」**，与 `phase-4-execution.md` §15.6
记录的历史同类问题同型。其中 `fileFootprint` 那处最隐蔽：测试数据
`file-0.ts … file-249.ts` 的字典序**恰好等于**时序，所以 `.sort()` 不可见。

### 11.7 复核轮实机验证

用**构建产物**（`npm run build:ts` → `dist/cli.js`）验证崩溃链路，而不是只跑单元测试：

```bash
# 在 CLI 装好记录器之后抛出未捕获异常
NODE_OPTIONS="--import /tmp/boom.mjs" node dist/cli.js --print "hi"
# → exit=7        ← 进程仍然终止（修复前是继续运行）
# → crashes.json 写入 1 条 uncaught-exception
```

再用真实数据渲染命令：

```bash
printf '/crash --stack\n' | node dist/cli.js
# → 1 of the last 5 recorded, oldest first:
#   - `2026-09-23T14:48:18.697Z` **uncaught-exception**
#     real uncaught from the built CLI
#     ```
#     Error: real uncaught from the built CLI
```

**退出码 7 是决定性证据**：它证明进程**没有**被记录器救活。
修复前同一场景退出码是 99（探针的存活分支）。

### 11.8 复核轮后的门禁

- `tsc --noEmit`：通过
- `verify:import-cycles` / `check:config-consumers` / `check:declarations`：通过
- `verify:docs-drift:strict`：通过
- 受影响套件（34 文件 / 318 项）：全部通过
