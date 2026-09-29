# Phase 16 裁决：10 项（2026-09-29）

> 预研究见 [`phase-16-pre-research.md`](phase-16-pre-research.md)；差距盘点见 [`12-gap-and-debt-research-2.md`](12-gap-and-debt-research-2.md)。
> 本文对 10 项逐条给形态与顺序。**每项独立提交 + 撤销验证 + 七门禁**。

---

## 1. 裁决总表

| # | 项 | 裁决 | 形态 | 严重度 |
|---|---|---|---|---|
| **16-I** | `bridgeSafe` 死字段 + `/permissions` + `/statusline` `/back` | **做** | 删字段（从未被读过）+ 接通 `/permissions` + 修两个 `argumentHint` | P1 |
| **16-A** | 项目记忆注入链 | **做** | 装配 `projectMemoryStore`（项目 `.agents/memory`）；**注入模式维持「显式 opt-in」不变** | P0 |
| **16-D** | 浏览器假成功 | **做** | 删 6 处 `Simulated`；接 `PwRuntimeStatus` 给分类与 DoNext | P0 |
| **16-E** | 浏览器出站治理 | **做** | 真实路径加 `blockedHostReason` + 允许清单；改掉不实注释 | P0 |
| **16-B** | `/compact` 合并 + 压缩钩子 | **做** | `/compact` 走真引擎；`preview/render/json` 降为只读子形式；补 `PreCompact`/`PostCompact`；删影子写入 | P1 |
| **16-K** | provider 错误保真 | **做** | 流内 `error` 抛错；停因映射出 `error`；Google 尾帧；Bedrock 图片/thinking；补 `supportsTemperature` | P1 |
| **16-G** | 会话锁陈旧回收 | **做** | `pid` 存活 + 年龄判定 + 夺取留警告 + breaker 防并发夺取 | P1 |
| **16-C** | `regular` 主屏记账重写 | **做** | 按 pi 的 `viewportTop`/`hardwareCursorRow` 重写；`capture/restore` 修 suspend | P1 |
| **16-F** | 每帧 O(N) | **做** | `documentRows` 惰性化 + 块级行数缓存 + 按视口裁剪块 | P2 |
| **16-H** | `/todo` 持久化 | **做** | 照 pi：状态随工具结果落盘、按分支重放；**需新增一条 metadata 通道** | P2 |

**另有 4 项移出本阶段**（§4）。

---

## 2. 逐项裁决

### 16-I（先做，最小且解除一处错误承诺）

**决定**：

1. **删除 `CommandDefinition.bridgeSafe`**（`core/commands/types.ts:153`）连同 `registry.ts` 的
   **54 处**声明。
   **依据**：`git log -S "bridgeSafe"` 显示该字段自 `c2eb7ac0`（项目初始化）就存在，
   **从未有任何提交给它加过读取者**（`git log -S "\.bridgeSafe"` 零命中）；
   它**没有文档注释**；非交互派发是 `entrypoints/cliRuntimeModule.ts:237-326` 的
   **硬编码 5 项允许清单**（`show-help`/`list-sessions`/`show-workspace`/`show-mcp`/`fork-session`），
   `bridgeSafe` 根本不参与判定。
   它不是「声明了但接错线」，而是**从未接过线**。按仓库已有先例
   （Phase 15 §16.3 对 `ToolDefinition.permissions` 的处置同型）**删除**。

2. **把 `manage-permissions` 接进非交互允许清单**：在 `cliRuntimeModule.ts:237` 之后
   加一个 `resolved.slashResult.action === "manage-permissions"` 分支，
   调用已存在的 `runCliPermissionCommand`（`entrypoints/cliPermissionModule.ts:9`）。

   **该分支需要额外接线（主代理亲验，初稿未提）**：
   `runCliPermissionCommand` 要求 `{ renderer, trustPolicy, projectRoot, permissionAction,
   permissionSelector }`，而 `cliRuntimeModule.ts` 的 `options` **没有** `approvalTrustPolicy`
   （`grep` 该文件零命中）。该对象在 `cli/bootstrap/cliProcessRunner.ts:65` 构造，
   已穿到交互侧（`cli/interactive/picker/registry.ts:38`）但**未穿到非交互模块**。
   故 16-I 必须**新增一个穿透参数**（`options.approvalTrustPolicy`），
   而不是只加一个 `if` 分支。
   `projectRoot` 则已在作用域内（`options.runtimeContext.projectRoot`，同文件 `:64`）。
   **注意**：该函数按 `permissionAction` 分派，其中 `revoke`/`reset`（`:27-58`）
   **会改动信任授予**——`list`/`explain` 是只读，`revoke`/`reset` 是写。
   故分派仍**尊重用户键入**（与 `restoreCommandRuntime` 的 `--confirm execute` 先例一致），
   不额外加确认门；但 `revoke`/`reset` 缺 selector 时**必须报错而非静默**（现行为已如此，保持）。

3. **修 `/statusline` 与 `/back` 的 `argumentHint`**：
   `entrypoints/slashCommandRegistry.ts:61-75` 的 `PICKER_ONLY` 让它们只进帮助与补全，
   而 `picker/registry.ts:101-106` 的 `opensPicker` 只接受**不含空白**的行；
   `statusline` 的 `argumentHint` 却是 `"use <preset|item...>"`——**帮助在教用户带参数，代码拒绝带参数**。
   **决定**：**删掉这两项的 `argumentHint`**（裸形式才是唯一形态），
   **并为 `statusline` 补一个真正的带参数形式**，因为持久化路径已存在且是用户级配置
   （`cli/interactive/tuiSettings.ts:27` `writeStatusItems` 写 `tui.statusItems`，
   与 picker 的保存是同一处；`presentation/tui/chrome/items.ts:14-29` 有 15 个合法 id）。
   即 `/statusline use <preset|item...>` 在**非交互模式**下真的写入，交互模式仍开 picker。

   **但必须同时处理读/写不对称（复核抓出，初稿漏了）**：
   `cli/interactive/tuiSettings.ts:22-32` 里
   `readStatusItems` **优先读项目配置**（`readProjectStatusItems(workspaceRoot) ?? userStatusItems()`），
   而 `writeStatusItems` **只写用户配置**（`readUserRuntimeConfigFile`/`writeUserRuntimeConfigFile`），
   连形参都叫 `_workspaceRoot`（**未使用**）。
   ⇒ 若该项目已有一份项目级 `tui.statusItems`，
   则 `/statusline use …` **写进用户配置却永远被项目配置遮住**，
   用户会看到「命令说写成功了，界面没变」——**比不做更糟**。
   **处置**：要么给写路径补一个项目级目标（并在结果里**说明写到了哪一层**），
   要么在命令输出里**明确报告被项目配置遮蔽**并给出改法。
   **不得**保持「静默写一个读不到的值」。
   `/back` 无此必要（它需要会话回合数据，属交互专属）⇒ **只删 hint**。

**撤销验证**：`/statusline use model,cost` 在隔离 HOME 下执行后
`~/.cheers/config.json`（或项目配置）的 `tui.statusItems` 变为 `["model","cost"]`；
删掉该分支则回落为「未知命令」而非写入。

---

### 16-A（P0：接线，不改产品模式）

**决定**：

1. **在装配处提供 store**：`cli/runtime/cliSessionRuntimeFactory.ts:302` 构造 `ShellSessionRuntime` 时，
   新增 `projectMemoryStore`，由 `createProjectMemoryLocalStore({ ref: { mode: "explicit-local", root } })` 构造。
2. **根目录 = 项目内的 `.agents/memory`**。
   **依据**：本仓已有同型先例——`core/subagents/agentMemoryManager.ts:22-36` 三档
   `user`/`project`/`local`，其中 `project` 默认即 `<workspaceRoot>/.agents/memory/<name>`；
   且 `.agents/` 已是本仓项目级资产的既定位置（skills、themes、hooks、agents）。
   **不用** Claude Code 的 `~/.claude/projects/<hash>/memory`——那是**用户级**，
   与「项目事实随仓库走」的语义不同，且 hash 目录名不可读。
3. **同步提供给 `CommandContext`**：`entrypoints/cliCommandExecutionBridge.ts` 加
   `projectMemoryStore` / `projectMemoryInjectionStateStore`。
   **依据**：命令侧与 turn 侧当前是**同一个缺口**（`context.projectMemoryStore` 也是 `undefined`），
   一处修复同时点亮两者；`/sidebar` 与 `/memory` 都读它。
4. **注入模式维持「显式 opt-in」不变**（`/memory use` 才注入），
   并**据此限定本项的验收口径**（主代理亲验，修正初稿的过度声明）：

   注入计划的闸门是 `memory/projectMemoryFutureTurnInjection.ts:58`：
   ```ts
   if (state.injectionStatus !== "pending" || !state.memoryInjectionId || !state.mode) {
     return skip(state, "memory-injection-not-pending", …);
   }
   ```
   而 `markPending` **只有 `/memory use` 会调**。所以**仅提供 store 不会产生注入**——
   必须走一次 `/memory use`，才有一轮携带 `<project_memory_context>`。

   故本项的**正确验收**（两段，缺一不可）：
   - **(1) 点亮命令侧**：`/memory save` 从 `Store mode: disabled` 变为可写；
     即「记忆真正落盘」这一半被修好；
   - **(2) 点亮注入侧**：`/memory use` 之后的那一轮，prompt 含注入块，
     状态由 `pending` 走到 `consumed`。

   **初稿只说了 (2)，没说 (1) 是本项的主要可观察收益**——而不写 (1) 的定义，
   实施者可能只接 turn 侧、忘了命令侧，导致「记忆存不下却声称接线完成」。
   **依据**：注入文本自带的设计声明（`memory/projectMemoryInjectedContextFormatter.ts:30-33`）
   明写 `Automatic memory injection: no.` / `Startup auto-load: no.`；
   改成 Claude Code 式「每会话自动注入索引」是**产品模型变更**，
   且会把**仓库可控文本自动灌进每个 prompt**（提示注入面），
   而本阶段的缺陷是「链断了」不是「模式错了」。
   **该模式问题连同 Claude Code 现行规格（`MEMORY.md` 索引 + 200 行/25KB 上限 + topic 惰性加载）
   记入 backlog，待独立裁决。**
5. `projectMemoryInjectionStateStore` 可缺省（`memory/projectMemoryInjectionState.ts:193` 有进程级默认）。

**撤销验证**（两个测试，对应上面的 (1) 与 (2)）：
- **(1)** 驱动生产装配的 `CommandContext`，跑 `/memory save`，断言
  `Mode: explicit-local` 且记录**真的写入磁盘**（读回 jsonl）；移除装配则回到 `disabled`。
- **(2)** 写入一条已批准记忆 ⇒ `/memory use` ⇒ 跑 `runPrompt`，断言送达模型的 prompt 含
  `<project_memory_context>` 且状态由 `pending` 走到 `consumed`；
  移除装配处的 store 则该断言失败（计划器会以 `memory-store-missing` 退出）。

**两个测试都必须驱动生产装配函数**，而不是自己 `new ShellSessionRuntime` /
`new CommandContext`——否则会重演 Phase 14 那类「删掉修复测试照样过」的假测试。

**风险（已核实，初稿的假设是错的）**：`.agents/` **不在** `.gitignore` 中，
且**已被跟踪**（`git ls-files .agents` → `.agents/workflows/verify.json`）。
故把记忆写进 `.agents/memory/` 会**污染 git 工作区**（`git status` 变脏），
这与「会话产物不进仓库」的既有取向冲突。
**三项处置（择一，建议 2a）**：
- **2a**：记忆落 `.agents/memory/` 但**显式加入 `.gitignore`**（本仓已有先例的形态：
  `.normproof/out/`、`.omp/` 都是「工具产物 + 显式忽略」）。选它的理由：
  `.agents/` 已是项目级资产目录，且 `agentMemoryManager.ts:36` **已经**用
  `<root>/.agents/memory/<agentName>`——沿用可避免出现第二个记忆目录。
- **2b**：改为用户数据目录（`resolveUserDataFile("memory")`），与 `agentMemoryManager.ts:30` 的
  `user` 档一致；代价是记忆不随仓库走。
- **2c**：跟随 Claude Code 现状（`~/.claude/projects/<project>/memory` 式的用户级 per-repo 目录）。
**无论选哪个**：只读仓库下写入须**降级为警告**而非崩溃。

**【复核补充，必须照做】命名空间冲突已具体化**：
`memory/memoryPersistence.ts:20-25` 的 `recordsFileFor` 默认写
`path.join(ref.root, "project-memory.jsonl")`——**文件直接落在 `ref.root` 下**；
而 `agentMemoryManager.ts:36` 用 `<root>/.agents/memory/<agentName>/MEMORY.md`——**按 agent 名建子目录**。
若把 `ref.root` 直接设为 `.agents/memory`，则同一个目录里**既有文件又有子目录**，两者混居。
**故本项目记忆的 root 必须再下一层**：`<root>/.agents/memory/project/`
（或显式给 `ref.recordsFile`），与 `<agentName>/` 子目录并列而不重叠。

---

### 16-A 执行补充（2026-09-29）

**落地形态（与裁决一致，补充三处实施细节）**：

1. **store 在两处装配，共用一个根**：
   - turn 侧：`cli/runtime/cliSessionRuntimeFactory.ts` 的 `ShellSessionRuntime` 构造处；
   - 命令侧：`entrypoints/cliCommandExecutionBridge.ts` 的 `routeSlashCommand` 上下文。
   根的推导提取为 `memory/projectMemoryRoot.ts` 的 `projectMemoryRootFor()`，
   两处调用它而不是各写一遍路径——裁决里担心的「命名空间与 `agentMemoryManager` 冲突」
   因此只有一个地方需要保证。

2. **`CommandContext.projectRoot` 是必要条件，不是附加**：
   命令侧原先只有 `cwd`。`cwd` 与 `projectRoot` 在「会话在子目录中工作」时不同，
   而记忆文件在项目根。故 16-A 依赖 16-I 引入的 `projectRoot` 传递
   （`cliCommandExecutionBridge.ts` → `CommandContext`）。

3. **可写性失败降级为结果而非异常（已实测）**：
   `projectMemoryLocalStore.ts` 的三条写路径（write / invalidate / delete）
   原先直接 `fs.mkdirSync` + `appendFileSync`，只读 checkout 下会**抛异常**。
   裁决要求「只读仓库下写入须降级为警告而非崩溃」，故三处均已捕获并返回
   `written:false` / `invalidated:false` / `deleted:false` 加 `blocker`，
   证据串 `project-memory-local-store:write-unavailable`。
   实测（父目录 `chmod 0500`）：返回 `written=false`，
   blocker 为 `Memory store is not writable at …: EACCES`，**不抛**。

4. **`.gitignore` 采用裁决的 2a 方案**：`.agents/memory/` 显式忽略
   （与 `.normproof/out/`、`.omp/` 同型，理由写在忽略项旁）。
   实测：在该目录下建文件后 `git status` 不显示。

**验收证据（两段口径均已在生产装配上跑通）**：

| 口径 | 证据 |
|---|---|
| (1) 命令侧点亮 | `cheers --print "/memory status"` → `Store mode: explicit-local`、`Store writable: yes`、`Store root: <project>/.agents/memory/project`；手工放置一条记录后 `Existing records: 1` |
| (2) 注入侧点亮 | 同一项目 `/memory use` → `Outcome: staged`、`Injection status: pending`、`Records selected: 1`；**并由 provider 桩实测**：`say hello` 之后 provider 收到的请求体含 `<project_memory_context>` 与记忆正文 |
| 移除装配即失败 | 去掉 `cliCommandExecutionBridge` 的 `projectMemoryStore` 后，`projectMemoryChain.test.ts` **3/4 失败**（`mode=undefined writable=undefined`）；恢复后 4/4 通过 |

**两处必须先知道的既有语义（避免误判为缺陷）**：

- **记录的可注入性由 kind/retention 决定**：`projectMemoryWakeup.ts:68-90`
  只把 `project-fact`/`project-structure`/`user-memory-candidate`
  （L0）与 `route-decision`/`capability-state`/`blocked-by-design-decision`/
  `validation-pattern`/`restore-recovery-boundary`（L1）纳入 wake 预览。
  一条 `candidateKind` 不在上述集合的记录**写进去也不会被 `/memory use` 选中**——
  这是设计，不是链断。首轮探针用 `convention` 作 kind 时正是此结果。
- **注入状态的作用域键是 `session:<sessionId>`**，命令侧
  （`memoryCommandRuntime.ts:249`）与 turn 侧（`sessionFutureTurnProjection.ts:133`）一致；
  文档初稿里写的 `compact:<id>` 是错的（compact 用同名函数但两处都返回 `session:` 前缀）。

### 16-D + 16-E（合并为一个提交：都是「浏览器说实话 + 受治理」）

**先决核实（主代理已做）**：`BrowserPlaywrightLocalRunner`（`browser/playwrightLifecycle.ts:24`）
在本仓**从未被构造**，也没有任何调用点传入 runner
（`grep "playwrightLocalRunner:"` 非测试命中 **0**）。
故「夹具栈 + 无真实 runner」= **仓库内没有任何执行器能浏览任意 URL**，
16-E 的「给真实路径补治理」是唯一可行方向。**该前提若被未来引入的 runner 打破，本项须重审。**

**决定**：

1. **删掉全部 6 处 `Simulated`**（`browser/sessionManager.ts:128,261,278,295,312,328`），
   `getOrCreatePage()` 的 `catch`（`:79-90`）改为记录失败原因。
2. **连同 `setMockHtml` 与 mock DOM 解析器一起移出生产类**（**复核补充，初稿漏了**）：
   `sessionManager.ts:37-40` 的 `setMockHtml` 与 `observe()` 里 `:216-230` 的
   `mockHtmlContent` 正则「DOM」生成器，在**没有浏览器**时照样把 `elementRefs` 填满并
   走 `observe`/`click` 等路径返回 `success: true`。
   **只删 6 处 `Simulated` 会留下这条编造通路**——
   它正是 `browserUnified.test.ts:18-68` 五个正向用例所依赖的机制
   （`setMockHtml(sampleHtml, …)` 后断言 `includes('Simulated click')`）。
   故须把模拟能力**移到显式测试替身**（测试注入一个 mock session manager 或 mock page），
   生产类内不再有 `mockHtmlContent`。
3. **失败分类不能只靠 `getPwRuntimeStatus`**（**复核补充**）：
   该函数是**被动静态探测**（`playwrightRuntime.ts:79` `passiveStatusCheck: true`、
   `:322` `browserLaunched: false`）——二进制存在即报 `ready`；
   而「二进制在、但启动时缺 `libnss3`/`libasound`、沙箱不允许、二进制损坏」这类
   **运行期启动失败**它报不出来。
   故须在 `getOrCreatePage()` 的 `catch` 里做**主动的启动期异常分类**
   （把 Playwright 的启动错误串归类到
   `package-missing` / `binary-missing` / `missing-system-deps` / `failed`），
   与被动探测**互补**而不是替代。
4. **复用已有的 `PwRuntimeStatus` 词汇**（`browser/playwrightRuntime.ts`）——
   它已产出 `status`/`reasonCode`/`dependency`/`executableSource`/`reason`，
   **不发明第四套词汇**；新增的只应是「启动期分类」这一档。
5. **按失败原因给不同 DoNext**（照 `playwright-mcp:68024-68084` 的措辞风格，
   它区分「未安装」与「缺系统库」两种并各给一条可执行命令）：
   `package-missing` ⇒ 装依赖；`binary-missing` ⇒ `npx playwright install chromium` 或设
   `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`；`failed` ⇒ 查系统库/沙箱。
6. **真实路径加一个专用的 URL 预检**（**复核更正了初稿的调用形状**）：
   初稿写「调 `blockedHostReason` 与 `decideBrowserNetworkAllowlist`」，但两者形状不匹配——
   - `blockedHostReason(hostname)`（`core/security/egressGuard.ts:130`）只吃**主机名字符串**，
     **不查**凭据 URL、不查非 http(s) 方案；
   - `decideBrowserNetworkAllowlist(request)`（`browser/networkAllowlist.ts:112`）**默认全拒**——
     `allowedOrigins` 为空时返回 `blocked-no-allowlist`，
     直接拿来当默认闸门会把**一切**导航都拒掉。

   故须写一个**专用浏览器 URL 预检**，按序做四件事：
   (a) 解析 URL；(b) 校验方案仅 http/https、**拒绝含凭据的 URL**（`hasCredentials`）；
   (c) 对解析出的 hostname 调 `blockedHostReason`；
   (d) 在注释里**显式写明「不做 DNS 解析」**这一残余面。
   `decideBrowserNetworkAllowlist` **只在用户显式配置了允许清单时**才串联，不作为默认闸门。
7. **loopback 与私网/元数据的处置（2026-09-29 按维护者质疑二次核实后更正）**：

   **【初稿错误，已更正】初稿裁决「loopback 默认拒绝，理由是与本仓 `web_fetch` 保持一致」。
   该裁决建立在两个错误前提上，均已实测推翻：**

   **前提一（错）：把 `web_fetch` 当作基准。**
   `web_fetch.ts:135` 的拒绝信息是 *"This tool reaches the public web only."* ——
   它是**有意只做公网**；而 `browserToolUnified.ts:13` 自称
   *"open URLs (**including localhost**)"* ——它的**本职就是本地页面**。
   两者不是「意外不一致」，是**两个用途不同的工具各自有意为之**。
   拿一个的设计目标去要求另一个，是把工具用错。

   **前提二（错）：以为该守卫能构成安全边界。** 实测：
   - `bash` **完全无出站限制**（`grep blockedHostReason core/tools/registry.ts` 零命中；
     `planCommandLaunch` 不做出站判定）；
   - **OS 沙箱默认关闭**：探针实测 `sandbox plan state: off`（`osSandbox.ts:259`
     `if (rules.enabled !== true) return { state: "off" }`，而本工作区 `readSandboxRules` 返回 `{}`）。
     只有显式开沙箱**且**无域名允许清单时才加 `--unshare-net`（`:294`）。

   ⇒ agent **今天就能** `curl http://localhost:3000`，也能 `curl http://169.254.169.254/`。
   在这种情况下拦 browser 的 loopback **拦不住任何东西**。初稿列的「SSRF / 读本地管理端口 /
   读自家 MCP sidecar」三条**是理论风险，已被 bash 的实际能力消解**，不作为论据。

   **更正后的裁决**：

   | 类别 | 处置 | 理由 |
   |---|---|---|
   | **loopback**（`127.0.0.1` / `::1` / `localhost`） | **默认放行** | 工具本职（自述如此）；`playwright-mcp`/`stagehand` 亦默认放行；拒绝等于**默认交付一个做不了本职的工具** |
   | **链路本地 / 云元数据**（`169.254.0.0/16`、`fd00:ec2::254`） | **默认拒绝** | 无正当用途；`egressGuard.ts` 注释已写明 `169.254.169.254` 是**凭据窃取原语** |
   | **RFC1918 私网 / CGNAT** | **默认拒绝，可显式放行** | 内网扫描面；但内网调试是正当需求，故给出口（沿用 `restoreCommandRuntime` 的 `--confirm execute` 旗标形态，工具层无交互弹窗通道） |

   **该守卫的定位必须写诚实**（写进代码注释）：
   它是**意图声明与可审计性**——「哪条出站是我打算看的页面」——
   **不是**新建一道安全边界，因为 `bash` 与沙箱现状决定边界本来就不存在。
   不让下一位读者高估它，比多加一条规则更重要。

   **注意：loopback 默认放行 ≠ 不做重定向落点复核。**
   第 8 条（重定向逃逸）**与 loopback 默认值无关，仍必做**——
   它保证「私网/元数据规则在跳转之后依然成立」。
8. **必须挡住重定向逃逸**（初稿遗漏，主代理自查补上；R2 独立复现）：
   `browser/sessionManager.ts:119` 用 `page.goto(url, { waitUntil: "domcontentloaded" })`，
   **Playwright 默认跟随重定向**，而真实路径**从不检查落点 URL** ⇒
   一个公开 URL 302 到 `http://169.254.169.254/latest/meta-data/` 可**完全绕过**
   仅检查「请求主机名」的预检。
   本仓已有现成判定：`browser/redirectPolicy.ts:20` `decideBrowserRedirectPolicy`
   （含 `blocked-redirect-escape` / `blocked-credential-url` / `blocked-unsupported-scheme`）。
   故治理**不能**只是「导航前查一次主机名」，必须要么用 `context.route(...)` 拦截**每一次**请求，
   要么在导航后读 `page.url()` **复核落点**（前者更彻底，后者更小）。
   **实施时必须写一条跳转测试**（起一个本地 302 指向私网）钉住这一点。

9. **`blockedHostReason` 的已知边界要写进实现注释**：
   它自己的注释（`core/security/egressGuard.ts:44-47`）声明
   *"decides from the hostname, without resolving it"* ⇒
   公开域名解析到私网、或 DNS 重绑定（检查与连接之间改变解析）**均不在此判定覆盖范围内**。
   浏览器路径**不能**只靠它；须与 allowlist + 落点复核合用，
   并在注释里写明这一残余面（避免下一位读者高估它）。

10. **修正不实注释**：`core/security/egressGuard.ts:3-8` 声称
   "the browser allowlist, the web fetchers and the egress guard all ask this"——
   浏览器侧此前**没有**问。修好后该句才为真，故本项**随修复一起**重新表述为
   包含浏览器工具的真实清单。

**撤销验证**：Chromium 不可用（`PLAYWRIGHT_BROWSERS_PATH=/nonexistent`）时
`browser` 工具 `open` 返回 `success: false` 且含对应 DoNext；
向 `http://169.254.169.254/` 与 `http://127.0.0.1:1/` 的导航被拒且理由可区分。

**风险**：依赖 mock 兜底的既有测试会由「静默成功」变为「明确失败」，
须改为注入测试替身或夹具浏览器（这正是 Phase 14「假测试」教训的正解）。

---

### 16-B（语义分裂收口）

**决定**（照 pi `agent-session.ts:2394-2510` 的单一入口形态）：

1. **`/compact` 裸形式与带指令形式改走真引擎**
   （`sessionRuntime.compactHistory` → `core/shell/compaction.ts:compactSessionHistory`）。

   **【初稿遗漏，已按复核补上】`CommandContext` 够不到会话存储**：
   `core/commands/types.ts` 的 `CommandContext` 有 `compactCheckpointStore` /
   `compactInjectionStateStore`（`:54-55`），但**没有 `sessionManager`、也没有会话存储访问**
   （`grep` 该文件零命中）。而真引擎的第一件事就是
   `input.store.getSession(input.sessionId)?.turns`（`core/shell/compaction.ts:98`）。
   故本项**不是**「把命令改指一个函数」，而是要**给 `CommandContext` 增加会话访问**
   （或让命令层把请求转交给持有 runtime 的那一层）。
   这是本项真正的工作量所在，须在实施前列清要加哪个字段、由谁注入。
2. **`preview` / `render` / `json` 降为只读子形式**，仍走 `runCompactCommand`，
   但**不再宣称自己完成了一次压缩**（去掉 `Preview only: yes` 之外的歧义措辞）。

   **【初稿错误，已按复核更正】初稿写的是「删掉 `updateLatestCompactCheckpoint` 与
   `markCompactCheckpointPendingInjection` 这两处影子写入」。这是错的——**
   主代理亲验：`compactCommandRuntime.ts:41` 是 `CompactLiveCheckpoint` 的**唯一生产者**
   （`grep updateLatestCompactCheckpoint` 非测试仅此一处），
   而它有**四个消费者**：

   | 消费者 | 位置 |
   |---|---|
   | `/sidebar` 面板 | `core/commands/sidebarCommandRuntime.ts:32` |
   | `/memory` 候选提取 | `core/commands/memoryCommandRuntime.ts:135` |
   | 未来轮注入 | `core/shell/sessionFutureTurnProjection.ts:49` |
   | 评测夹具 | `core/harness/agentScenarioRunner.ts:214` |

   **直接删掉会让这四处失去数据源。**
   正确形态是**迁移生产者**而非删除：把 checkpoint 与 injection-state 的产出
   移到**真实压缩发生的地方**（`core/shell/compaction.ts` 成功之后，
   或自动路径既有的 `onCompact` 回调里），
   使**自动与手动压缩都产出**同一种 checkpoint；
   然后命令路径的写入才成为冗余并可移除。
   **顺序不可颠倒**：先迁移、后删除。
3. **在 `core/shell/compaction.ts` 补钩子**：
   `condenseContext` 之前派发 `PreCompact`（`reason` 由调用方传入，手动即 `"manual"`；
   `decision === "block"` ⇒ 中止并返回失败态）；成功后派发 `PostCompact`。
   **环依赖已核实无风险**（主代理亲验两步）：
   (a) 读码：`hookDispatcher` 的 import 只有
   `observability/structuredLogger`/`./types`/`./trust`/`node:child_process`/`sandbox/osSandbox`；
   (b) **用可达图模拟新增边**：`hookDispatcher` 的可达集**不含**
   `core/shell/compaction.ts` ⇒ 加边 `compaction.ts → hookDispatcher` **不构成环**。
   现状门禁本身也是绿的：`verify:import-cycles` 报
   `runtime_cycles=0 type_only_cycles=1`（既有 `fetch ↔ kinds` 类型回边，非本次改动）。
4. **把 `reason` 从调用点透传**，让 `session/compaction.ts:81` 的 `"manual"` 不再是死值。
5. **非交互 `/compact` 需要凭据**：无可用 summarizer 时**明确报错**并提示
   `/compact --preview` 可离线检视（照 pi `agent-session.ts:2407-2410` 的处置）。

**撤销验证**：`PreCompact` 返回 `block` ⇒ 压缩中止且**不**追加 `CompactionEntry`；
成功后 `PostCompact` 载荷含 `reason:"manual"` 与 token 计数；
删掉钩子派发则两项断言失败。

**风险（复核已定位到具体文件，不再是猜测）**：**恰好 3 个**测试钉住
`Compact v2 handoff generated`：
1. `context/compact/delivery/compactSessionSurface.test.ts:47`
2. `core/commands/slashRouter.test.ts:149`
3. `presentation/sidebar/sidebarCommandEventAdapter.test.ts:17`

须逐一改为断言**显式 `--preview`** 的输出，或改钉真压缩语义；
**不得**为了让旧断言通过而保留歧义措辞（那是把测试当成规格来迁就）。

---

### 16-K（错误保真）

**决定**：

1. **流内 `error` 帧抛错**：`DeltaChunk`（`turn/completion.ts:115-124`）加 `error?`，
   `absorb`（`:325-345`）命中即 `throw`。上行终止路径**已存在**
   （`core/agent/loop.ts:278` 把 `stopReason === "error"` 当终态），无需新造。
2. **停因映射产出 `error`**：
   - `provider/endpoints/googleWire.ts:187-191`：`MAX_TOKENS → length`，
     **其余全部 → `error`**（照 pi `google-shared.ts:440-468`），
     并以**穷尽默认分支**兜未知值（**不照抄字面量清单**——pi 传的是 API 联合类型，
     其忠实性来自穷尽检查，见预研究 §6 第 3 条）。
   - `turn/step.ts:608-611` 的 `stopReasonOf` 同步：非 `length`/非已知正常值一律 `error`。
     我方 `AgentStopReason` 已有 `"error"`（`core/agent/state.ts:3`），**无新词汇**。
3. **Google 尾帧**：`googleWire.ts:258-315` 循环结束后按
   `turn/completion.ts:284-287` 的同款尾处理冲刷残留 buffer。
4. **Bedrock 图片与 thinking**：`bedrockConverse.ts:140-142` 的 `textOf` **不可**用于用户内容；
   照 `anthropicMessages.ts:264-275` 展开为图片块；`converseBody` 增补
   `additionalModelRequestFields.thinking`（当 `thinkingBudgetTokens` 存在时）。
5. **补 `supportsTemperature`（复核指出比初稿说得更深）**：
   初稿写「把 `ResolvedRequestShape.supportsTemperature` 透传」，
   但复核核实**该 shape 在压缩调用点并不在作用域内**：
   `core/query/compaction/summarize.ts:20-35` 的 `CompactionProvider` 只声明
   `baseUrl`/`headers`/`model`/`endpoint`，而 `cli/runtime/cliSessionRuntimeFactory.ts:80-145`
   的 `buildCompactionWiring` 只拿到 provider 与 catalog。
   故实际改动是**三处**：
   (a) `CompactionProvider` 增 `supportsTemperature?: boolean`；
   (b) `requestCompactionSummary` 把它传给 `endpointBody`；
   (c) `buildCompactionWiring` 用 catalog **解析该模型的 request shape** 以取得该值。
   即本项不是「传一个已有变量」，而是**新增一条从 catalog 到压缩请求的属性通路**。

**重试面：主代理第一次探针不足，复核者抓出真问题（已更正）**

初稿写的是「更严格的映射不会让它们变成可重试」，**依据是一次不完整的探针**——
当时喂的消息是裸文本（`"upstream exploded"`），结论为 STOP。
**但 `turn/step.ts:491` 实际产生的消息带前缀**：

```ts
return stamp(failedStep(`Network error: ${error instanceof Error ? error.message : String(error)}`, shown));
```

而 `RETRYABLE_FAILURE`（`core/agent/retry.ts:55`）**含 `/network.?error/i`**。
换用真实消息形状重跑探针：

```
RETRY  Network error: upstream exploded
RETRY  Network error: Provider finish_reason: content_filter
RETRY  Network error: overloaded
RETRY  Network error: The provider withheld the reply
```

⇒ **所有**经 `absorb` 抛出的流内错误都会被**无差别重试**，无论原因是瞬时故障、
内容过滤还是安全拦截。对安全拦截重试是**错的**（同一请求再来一次结果相同），
且会把「供应商拒绝」呈现为「反复尝试后仍失败」。
**注意这是既有代码的既有行为**（现在的 `Network error:` 路径已经如此），
16-K 让**更多**情形走进这条路径，从而**放大**它。

**故 16-K 必须比初稿多做一步**：抛出的错误要么**不落在 `Network error:` 前缀下**
（换一个不会匹配 `RETRYABLE_FAILURE` 的措辞），
要么给该类错误一个**显式不可重试**的标记，由 `isRetryableFailure` 先读该标记。
**撤销验证**必须覆盖两侧：瞬时错误**仍**重试；`content_filter`/`SAFETY` **不**重试。

**撤销验证**：合成错误帧给 `readCompletionStream` ⇒ 抛错（删除后输出 "Hello" 当正常完成）；
且**断言重试分界**（瞬时错误重试、`content_filter`/`SAFETY` 不重试）——这条是 R2 复核要求新增的；
`finishReason: "SAFETY"` ⇒ `stopReason === "error"`（删除后为 `"stop"`）；
带图片的用户消息过 `converseBody` ⇒ 含 `image` 块（删除后只剩 text）。

**不含**：Bedrock **端到端**验证（无账号，与 Phase 15 对 M4/M5 的既有结论一致）——
只做读码 + 单测级别的协议正确性。复核者亦独立确认此项无法在环境中验证。

**已核实为安全的改动**：把 Google 的 `SAFETY`/`CONTENT_FILTER` 映射为 `error`
**不会破坏既有测试**——`googleGenAI.test.ts:233-255` 只断言
`MAX_TOKENS → length` 与 `STOP → stop`，没有断言安全类映射为 `stop`（复核核实）。

---

### 16-K 执行补充（2026-09-29）

**落地内容（五项全部完成，均带回归测试）**：

| 项 | 实现 | 测试 |
|---|---|---|
| 流内 `error` 帧抛错 | `DeltaChunk` 增 `error?`；`absorb` 命中即 `throw`（措辞与 anthropicMessages/bedrockConverse 一致：`Provider reported an error mid-stream: …`） | `completion.test.ts` 两例：带 message 与只带 type |
| Google 停因 | `mapGoogleFinishReason`：`STOP→stop`、`MAX_TOKENS→length`、**其余→error**（含未知值）；不再是「除 MAX_TOKENS 外全 stop」 | `googleGenAI.test.ts` 两例：`SAFETY→error`、`MAX_TOKENS→length` |
| 内核 `stopReasonOf` | `length`/`stop`/`tool_calls`/null 之外一律 `error`（null 仍为 `stop`：空 finish 是「没说」，不是「拒答」） | `step.test.ts` 一例：`content_filter→error` |
| Google 尾帧 | 流结束后冲刷残留 buffer（与 `completion.ts` 同型处理），冲刷中发现的 blockReason 照常抛 | 复用既有「carriage returns」与「blocked prompt」用例 |
| 重试分界（复核要求） | `retry.ts` 新增 `REFUSAL` 模式（`content.?filter\|safety\|recitation\|prohibited.?content\|blocked.?content\|refused the prompt`），在 `UNRECOVERABLE_FAILURE` 之后、`RETRYABLE_FAILURE` 之前判定 ⇒ **拒绝不重试，瞬时错误仍重试** | `retry.test.ts` 一例钉四条消息形状 |

**Bedrock（两项）**：
- `bedrockConverse.ts` 的 `textOf` 不再用于用户内容：新增 `pushUserBlocks`，
  `image` 块展开为该协议自己的 `{ image: { format, source: { bytes } } }`，
  `image/jpg→jpeg`；未知块降级为其文本而不是被丢弃。
- `converseBody` 在 `thinkingBudgetTokens` 存在时写
  `additionalModelRequestFields.thinking = { type: "enabled", budget_tokens }`。
- 测试五例：图片块形状、MIME→format 映射、相邻文本保留、thinking 字段出现与缺省。

**`supportsTemperature`（复核指出需新通路，已按三处实施）**：
(a) `CompactionProvider` 增该字段；(b) `requestCompactionSummary` 透传给 `endpointBody`
（并新增 `CompactionRequest.temperature`，使门控可观察）；
(c) `cliSessionRuntimeFactory.ts` 的 `compactionProvider()` 用
`resolveRequestShape(catalog, …)` 解析出该值——与主请求同一条 catalog 通路，不是第二套表。
测试断言两端：**带温度且模型接受 → body 有 `temperature`；模型拒绝 → body 无该字段**。

**既有测试的改动（只两处，均为钉住旧行为者）**：
- `step.test.ts`「explains an empty answer」：原来用 `finish_reason: "content_filter"`
  且断言 `stopReason === "stop"`——这恰是本项要修的「把拒答当正常完成」。改为
  `finish_reason: "stop"`（真正的空答案），断言措辞随之从「withheld the reply」
  变为「returned nothing at all」。
- `summarize.test.ts`：新增一例，无既有用例改动。

**验证**：受影响面 35 个测试文件 531 例全绿；七个门禁全绿。

### 16-G（会话锁）

**决定**（照 `opencode/packages/core/src/util/flock.ts` 的形态，它是本仓外最接近的先例；
pi 用的是 `proper-lockfile` 依赖，我方向来避免为一件小事引入依赖）：

1. 锁文件内容从**空文件**改为 JSON：`{ pid, hostname, createdAt, expiresAt }`。
2. 获取失败（`EEXIST`）时读锁：**`kill(pid, 0)` 判存活**（同 host 才判）
   **或** 超过 `staleMs` 阈值 ⇒ 判为陈旧。
3. **夺取用原子 breaker 目录**（`mkdir` 成功者独占夺权），避免两个进程同时夺同一把锁——
   这是 opencode `:164-195` 的做法。
4. 夺取时**留警告**（照本仓 `browser/receipt/lock.ts:140-160` 产出
   `…-lock:stale` 证据的既有风格），不静默。
5. `stateLockPath` 的其它调用方（`sessionStateStore.writeSessionState` 等）**接口不变**。

**撤销验证**：预置一把 `pid` 不存在的陈旧锁 ⇒ `writeSessionState` **成功**且留下陈旧警告；
删除陈旧判定则 1200ms 后抛 timeout。

**风险（复核指出初稿的保证过强，必须如实降级）**：
- **租约式锁 + 无 fencing token 无法对抗长暂停**：进程 A 取锁后被 `SIGSTOP`／VM 冻结／长 GC
  超过 `staleMs`，B 经 breaker 夺锁并开始写；A 恢复（`SIGCONT`）后**两者同时持有**并**并发写**，
  且**没有栅栏标识**能阻止 A 覆盖 B。
  处置：在 `state.json` 上引入**单调版本/epoch**，写入前校验自己读到的 epoch 未被他人推进——
  即从「锁保证互斥」降级为「**乐观并发 + 检测到冲突就重读重试**」。
  这与本仓既有的 `expectedCurrentContent` 恢复记录思路一致。
- **PID 复用**：容器/K8s 里 PID 回收快，`kill(pid,0)` 可能命中无关新进程。
  故三重条件（同 hostname + pid 存活 + 年龄上限）并**不构成证明**，只是启发式；
  拿不准时**倾向等待而非夺取**（误判夺取会破坏并发写，误判等待只是慢）。
- **结论**：本项能消除的是「死进程留下的锁永久阻塞」这一**常见**故障；
  它**不**提供「任意暂停下仍互斥」的保证，这一点必须写进代码注释，
  不能让下一位读者以为锁是完备的。

---

### 16-B 执行后需要的一处夹具更新（2026-09-29，已随 16-K 一并落地）

`core/harness/agentScenarioFixtures.ts` 的 `/compact` 场景步骤走命令注册表——
生产者迁移后那是只读 handoff 路径，**不再写 checkpoint**。
夹具改为直接调用 `recordCompactionCheckpoint`（与引擎同一个生产者）预置一份，
使「注入恰好一次」断言所依据的数据源与生产一致。
**这不是把测试改弱**：断言本身一字未动，改的只是数据从哪条生产路径来。

### 16-G 执行补充（2026-09-29）

**落地（照裁决四点 + 复核要求的诚实降级）**：

- 新模块 `session/store/lockStaleness.ts`：`STALE_LOCK_AGE_MS = 60s`，
  `isLockStale`（owner-dead / lock-expired / lock-unreadable 三档）、
  `takeOverStaleLock`（`mkdir` breaker 目录，**只有一个夺权者**）、
  `readTakeoverNotice`/`writeTakeoverNotice`/`clearTakeoverNotice`
  （`state.lock.stale` 旁路通知，不静默）。
- `withFileLock`（`sessionFileStore.ts`）获取锁时写入
  `{pid, hostname, createdAt}`；`EEXIST` 时先判陈旧、再夺权、夺权成功则立即重试，
  **存活锁的等待与超时语义一字未动**。
- 接口不变：`withSessionStateLock`/`writeSessionState`/`stateLockPath`
  的调用方无需改动。

**撤销验证（已做）**：预置 `pid` 不存在的锁 ⇒ `withFileLock` 内的写**成功**且
`state.lock.stale` 记录 `owner-dead` 与旧 pid；**删掉恢复分支后该测试失败**
（回到 timeout），恢复后通过。存活锁的用例断言仍按既有 timeout 抛错。

**复核要求的诚实降级（已写入模块注释与测试注释）**：
无 fencing token ⇒ SIGSTOP 超过 60s 的原持有者恢复后仍可并发写。
**未**实现裁决提到的 epoch/乐观并发——`writeSessionState` 已是
「锁内读-改-写」，且 `state.json` 现无版本字段；
把它加进 `SessionStateSnapshot` 是一个跨持久化格式的变更，
本项不改快照 schema（那属于独立裁决）。该残余面已在
`lockStaleness.ts` 头注释里写明，不许下一位读者高估锁的保证。

### 16-C（`regular` 主屏）

**决定**（照 pi `packages/tui/src/tui-main-screen.ts` 的状态模型）：

**决定**（照 pi `packages/tui/src/tui-main-screen.ts` 的状态模型）：

1. **`MainScreenPainter` 的记账改为**：`previousLines: string[]`、
   `viewportTop: number`、`hardwareCursorRow: number`，取代
   `written: string[]` + `cursorRow` + `content.length <= alreadyWritten` 的「已写即不可变」假设。
2. **不变量**（写进代码注释）：
   **视口内**的行（`[viewportTop, viewportTop + height)`）**可以**原地重写
   （相对光标移动 + `\x1b[2K`）；**滚出视口上方**的行**绝不**重写或重发进滚回区
   （照 pi `:436` 的 `firstChanged < prevViewportTop` ⇒ 整屏重绘的处理）。
3. **`suspend()` 不再销毁 painter**：加
   `captureRenderState()` / `restoreRenderState(state)`（照 pi `:135-158`，
   含把图片行替换为空串的做法），
   `engine.ts:243-251` 改为 capture ⇒ suspend ⇒ restore。

   **且恢复不能假设光标在原地**（**复核补充**）：
   `suspend()` 期间子进程**任意写 stdout**，物理光标被移到不可预测的位置；
   若 `restoreRenderState` 只搬回 `previousLines`/`hardwareCursorRow`，
   账面与真实光标**立刻失同步**。故恢复的第一步必须是
   **重新锚定**（发换行/定位序列，或查询光标位置），
   然后才画第一帧；并且**把已传输的 kitty 图片标记为需要重传**
   （`forgetTransmittedImages({ free: true })` 已释放，但账面若不跟着清，
   会去「放置」已经不存在的图）。

   **但恢复必须是「按模式」的**（主代理亲验，初稿没提）：
   `engine.ts:220-224` 现在**故意**设 `this.painted = false; this.window = [];`
   并带注释 *"The child wrote to the screen, so the next frame is a full paint rather than a
   diff against rows that are no longer there."*
   - **备用屏**：这条是对的——子进程可能在我们的私有屏上乱写，整屏重绘是唯一正确做法。
   - **主屏**：这条是**错的**——「整屏重绘」在这里等于**把整份 transcript 再灌一遍滚回区**，
     正是要修的那个 bug。主屏下正确的动作是**恢复账面 + 在当前光标处重新锚定底部**，
     而**不是**重发历史。
   故 `capture/restore` 不能只搬 painter 的状态，还必须让这两行重置**按模式分叉**
   （或让 painter 自己知道「我的行已经在滚回区里，不可重发」）。
   **这一条若不写清，实施者很可能只做 painter 的 capture/restore，
   而留下的 `painted = false` 会让重复照旧发生。**
4. **修掉 `mainScreen.ts` 头部关于 DSR 的注释**：pi **不查** DSR，我方也不查；
   真实理由是**不需要**（靠内部记账），不是「太贵」。

**撤销验证**：探针式单测——`paint(["hel"],chrome)` 后 `paint(["hello world"],chrome)`
第二帧**必须含** `hello world`；`engine.suspend()` 后再渲染**不得**重发既有行。
两项在删除修复后均失败（**当前已实测两者皆失败**）。

**风险与须额外覆盖的情形**（主代理逐条核过，实施时逐条写测试）：
- **内容变短**（折叠/压缩/`/clear` 后行数下降）：行差算法必须能向上移动并擦除多余行，
  且**不得**把擦除当作「重发」。这是 pi 用 `maxLinesRendered` + `clearOnShrink` 专门处理的一档
  （`tui-main-screen.ts:356-357`），我方初稿完全没提。
- **`/clear` 在 `regular` 模式下清不掉滚回区**（主代理查出的**第三处**同型问题）：
  `cli/interactive/interactiveMode.ts:798-800` 的注释写「Drop the visible transcript and
  **the terminal's scrollback** together」，实现却只有
  `this.state.transcript.clear(); this.tui.requestRender({ force: true });` ——
  **没有任何清屏序列**。
  备用屏里它「看起来」生效（整屏重绘 + transcript 清空）；
  **`regular` 模式下已经写进滚回区的行根本无法擦除**，
  于是该注释在 regular 下**不成立**，用户会看到「已清空」但历史仍在。
  这属本项范围（同一个「主屏不能回溯改写」的根因）。
  **处置**：要么给注释与实现二选一对齐（regular 下明说「不能清滚回区，请用终端自己的清屏」），
  要么在 regular 下也发一个清屏序列（但那会一并清掉用户自己的历史）。
  **建议前者**——诚实说明限制优于假装清掉了。
- **固定块（chrome）行数变化**：chrome 从 2 行涨到 4 行会挤掉内容行，
  行差必须把 chrome 的行也纳入同一账本（现在 `chromeRows` 是单独传入的）。
- **终端高度变化**：维持既有策略（重新锚定底部），但须确认它不会触发重发。
- **kitty 图片**：图片行参与行高记账（我方已有 `imageIdsIn`/`swapTransmittedForPlacement`）；
  restore 时照 pi 把图片行替换成空串（pi 的 `restoreRenderState` 就是这么做的），
  并在**差分重写**时按 pi 的 `deleteChangedKittyImages` 那样显式驱逐被改写行上的图片 id，
  否则会在重写过的行上**留下悬空图片**。
- **chrome 行数超过终端高度**：必须**钳制**到 `height`，
  否则行差会把光标推到屏幕顶之上而出现下溢。
- **行差算错**会让光标越界污染滚回区——这是本项最主要的风险。
- resize 仍维持「只重新锚定底部、历史交给终端换行」的**现有策略**
  （与 pi 的有意分歧：pi 宽度变化整屏重绘，我们不夺屏）——已记入 §5 已知取舍。

---

### 16-C 执行补充（2026-09-29）

**实现形态与裁决的差异（三处，均经探针逐项验证）**：

1. **记账字段**：裁决写 `previousLines`/`viewportTop`/`hardwareCursorRow` 三件。
   实现用 `visibleContent`（**只记仍在视口的行**）+ `scrolled`（已滚成历史的行数）两个字段表达同一事实。
   理由：`visibleContent` 的「不含历史」**本身就是** viewportTop——
   每帧重算 `newScrolled = max(scrolled, overflow)` 时，历史行天然从可重写集合里消失，
   不需要第三份记录去保持同步。`cursorRow` 即裁决里的 hardwareCursorRow。

2. **`captureRenderState`/`restoreRenderState` 未以该名字落地**：主屏路径改为
   `reanchor(cursorRow)` + engine 侧的**模式分叉**（这正是裁决「复核补充」点名的那条）：
   - 备用屏：保持原有 `painted = false; window = []`（整屏重绘是对的）；
   - 主屏：**不再清空**，`reanchor(trackedRows)` 重新锚定光标。
   裁决担心的「只做 capture/restore 而留下 painted=false 照旧重复」已被这条分叉排除。

3. **kitty 图片的 restore-空串处理未做**：`reanchor` 不碰图片行。
   理由：suspend 里 `forgetTransmittedImages({ free: true })` 已把账面清空，
   下一帧对图片行会**重新传输**（`transmitted` 注册表空 ⇒ `swapTransmittedForPlacement`
   不替换 ⇒ 走传输分支），与 pi 的「行换成空串」殊途同归，且不需要第二份账。

**裁决点名的各情形，逐项落地**：
- 内容变短（折叠/`/clear`）：擦除从**第一个被丢弃行**开始，
  且擦除后强制重画 chrome（`[J` 会把 chrome 一起清掉）。
- chrome 变宽/变窄：钳制到终端高度；变窄时 `[J` 清残留。
- 高度变化：维持「只重锚定」既有策略，未引入重发。
- `/clear` 在 regular 下清不掉滚回区：**按裁决建议取「诚实说明」**，
  `interactiveMode.ts` 的注释已改为陈述限制而不是承诺清掉。

**撤销验证（已做）**：
- 探针（真实双模拟终端）：`paint(["hel"])` 后 `paint(["hello world"])` 第二帧**含** `hello world`（修复前不含）；
  收缩帧把 `two`/`three` 从屏幕与滚回区都清掉，`chrome` 留在屏上；
  溢出到 40 行后新行**只追加一次**，被裁掉的行**不重发**。
- 单测：新增「行增长就地把旧文本替换掉」与「收缩帧清掉不再使用的行」两例；
  **删掉重写分支后第一例失败**（这正是探针证明过的缺陷），恢复后通过。
- suspend 分叉：`engine.test.ts` 既有 14 例全绿。

**验证**：`presentation/tui` 全部 32 个测试文件 486 例全绿；七门禁全绿。

### 16-F（每帧 O(N)）

**决定**：

1. **`documentRows` 惰性化**（**复核给了更简的形态，已采纳**）：
   初稿想给 `ViewContext` 加一个 `needsDocumentRows()` 访问器——
   那会把「渲染模式」泄漏进 view 层，且要改 `ViewContext` 与 engine 的耦合。
   **更好的形态**：在 `TerminalFramePlan`（`presentation/tui/render/frame.ts:43`）
   把 `documentRows` 从**急切字段**改为**惰性 getter**：

   ```ts
   get documentRows(): readonly string[] { return this.pane.documentRows(width); }
   ```

   备用屏下 `engine.renderNow()` 走 `:295` 的 `paint(frame.rows, …)`，
   **从不访问** `frame.documentRows` ⇒ `pane.documentRows()` 根本不会被调用。
   **零 `ViewContext` 改动、零 engine/view 耦合新增。**
2. **先修缓存失效，再加行数缓存**（预研究 §5.1b 新查出的缺陷，本轮新增）：
   当前 `rowsFor` 的缓存键不含内容与折叠状态，且 `TurnSink.notify`
   （`cli/interactive/turnSink.ts:124`）**直接改 `finalized: true` 块的 `text`**，
   导致**折叠不生效**（探针：20 行块折叠后仍 21 行）与**通知文本不更新**
   （探针：文本改 400 字符后行数仍为旧的 11）。
   **必须先做**：把 `text`/`collapsed`/`status` 的写入收敛到会失效缓存的入口
   （container 上的 `setText`/`setCollapsed`/`setStatus`，或引入由 container 维护的**块版本号**并把
   它**加进缓存键**），写入方一律经它。
   否则 16-F 的行数缓存是**给一个已经在返回陈旧值的缓存再加一层**，问题倍增。

   **复核补全了写入方的全集（初稿只列了 `TurnSink`）**：

   | 写入方 | 位置 | 改的字段 |
   |---|---|---|
   | `TurnSink.notify` | `cli/interactive/turnSink.ts:124` | `text`（**`finalized: true`**） |
   | `TurnSink.line/think/chunk` | `:177,199,207` | `text`、`elapsedMs` |
   | `ToolCards.note/append/finish` | `cli/interactive/toolCards.ts:44,61,67,100,102` | `text`、`status`、`collapsed` |
   | **`pageLongOutput`** | `presentation/tui/chrome/pager.ts:28-29` | `text`、`diff` |
   | **`splitFencedDiff`** | `presentation/tui/transcript/blocks.ts:336-337` | `text`、`diff` |

   **最后两处初稿完全漏了**——它们同样改 `finalized` 块。
   故「先修失效」的范围是**五个写入方**，不是两个。
3. **块级行数缓存**：`container.ts:120` 的 `rowsFor` memo **已按**
   `width` + `defaultTheme.colorRevision` + `options?.imageProtocol` 作键——
   新增**同一键集**的块级行数缓存，使 `rowCount` 从「遍历并渲染」变为「求和」。
   **键集必须与行 memo 完全一致**，否则主题/折叠/协议变化后行高失真。
4. **按视口裁剪块**：`render` 改为先算块偏移，只拼接与 `[top, top+capacity)`
   **相交**的块，而非拼接全部再 `slice`。
5. **流式不额外改**：`engine.requestRender` 已有 `MIN_FRAME_INTERVAL_MS` 与自适应延迟，
   帧合并已存在；本项只移除每帧的 O(N) 尖峰。
6. **删掉 `tuiMode` 的 `"stream"` 取值**（**维护者已裁决：删除**）：
   - `config/runtimeConfig.ts` **两处 union**（`:251`、`:387`）改为
     `"regular" | "fullscreen"`；
   - 清理 `runtimeConfig.ts:246-250` 与 `interactiveMode.ts:350-352` 关于
     「`stream` 已预留但无定义」的说明——取值没了，说明也就没有对象；
   - **依据（探针实测）**：`"stream"` 与 `"fullscreen"` 行为**逐字节相同**——
     全仓唯一的读取点 `interactiveMode.ts:354` 只做 `tuiMode !== "regular"`，
     写 `{"tuiMode":"stream"}` 得到 `useAlternateScreen = true`，与 `fullscreen` 无异。
   - **附带事实（可选加固，非本次必做）**：配置是 `JSON.parse(...) as RuntimeConfigFile`
     （`:496`/`:642`），**无枚举校验**——实测写 `{"tuiMode":"totally-made-up"}` 也被**原样接受**
     并当作 fullscreen。类型删掉 `"stream"` 只挡住**编译期**写错；
     若要挡住**配置文件**写错，需另行加运行时枚举校验。本次**不做**，仅记录。

**撤销验证**：一个基准测试断言 10,000 块在备用屏模式下每帧 < 5ms
且**不**对全文档调用 `render` 两次；回退后 `documentRows` 立即求值、耗时随块数线性增长。

**风险**：块级行数缓存若键集不匹配会产生滚动条跳动与滚动位置错位——
必须在测试里钉「主题切换后行数缓存失效」。

---

### 16-F 执行补充（2026-09-29）

**落地内容**：

| 项 | 实现 | 验证 |
|---|---|---|
| `documentRows` 惰性化 | `TerminalFramePlan.documentRows` 从 `readonly string[]` 改为 `() => readonly string[]`；`view.ts` 返回闭包；`engine.ts` 唯一读者（主屏路径）改 `frame.documentRows?.()` | 备用屏路径的帧不再访问该函数 ⇒ 不再为不读的文档付全量渲染（预研究实测 8000 块 ~49ms/帧） |
| 缓存失效收敛 | `Transcript` 增 `setText`/`setDiff`/`clearDiff`；既有 `setCollapsed` 保留 | 探针：**修复前** 3 行块改 5 行仍渲染 4 行、折叠后仍 6 行；**修复后**分别为 6 行与折叠行数 |
| 五个写入方全数路由 | `turnSink.notify`、`toolCards.note/append/finish`（含 `setCollapsed`）、`pager.pageLongOutput`、`blocks.splitFencedDiff` 全部经 transcript 入口；**`history.restoreConversation` 保持直写**——那些块在被 append 进 transcript 之前合成，没有缓存可失效 | 56 个测试文件 832 例全绿 |

**未做（与裁决一致）**：
- **块级行数缓存**：`rowCount` 仍逐块求和。理由：主屏每帧要的是**全部行**而不是计数，
  惰性化已把「不读不付」修掉；再加一层计数缓存收益小且多一份要与行缓存同步的键。
- **按视口裁剪块**：`render` 仍全量拼接。同上——主屏没有视口，`rows` 才是
  备用屏的视口内容（`pane.render(width, capacity)` 已按容量截），不存在「拼接全部再 slice」的路径。

**`tuiMode: "stream"` 删除（维护者已裁决）**：
两处 union（`runtimeConfig.ts:251`/`:387`）改为 `"regular" | "fullscreen"`，
`runtimeConfig.ts` 与 `interactiveMode.ts:352` 的「`stream` 已预留」说明一并删除。
运行时枚举校验**未加**（裁决明确「本次不做，仅记录」）。

**附带更正**：裁决第 2 条把 `history`（恢复会话时的块合成）列进
「必须收敛」的写入方清单——实际它写的是**尚未入册**的块（合成后统一 append），
直写是正确形态。已在该处加注释说明，不算遗漏。

### 16-H（`/todo` 持久化）

**决定**（照 pi `examples/extensions/todo.ts` 的核心洞见，**而非**照抄快照方案）：

1. **状态随工具结果落盘、按分支重放**。
   pi 的做法：`todo` 工具每次返回把完整状态放进结果 `details`，
   会话载入/切分支时扫 `sessionManager.getBranch()` 里该工具的 `toolResult` **按序重放**
   （`todo.ts:115-135`），因此**分支/回退时状态自动正确**。
2. **我方需要贯通一条三段的通道**（比初稿估计的更大，已按核实更正）：
   1. **事件层**：`tool.result` 事件（`core/query/runtime/events.ts:86-95`）
      **当前不携带 `metadata`**，而 `ToolExecutionResult.metadata`（`tools/types.ts:44-50`）存在；
   2. **持久层**（初稿遗漏）：`SessionMessage`（`session/schema/sessionMessage.ts:12-27`）
      **没有 `metadata` 字段**，`session/sessionEventCodec.ts` 也不含它 ——
      所以只加事件通道**不足以**让它落盘并跨 resume 重放，**必须同时扩展消息 schema 与编解码**；
   3. **重放层**：载入/切分支时按序重放该工具的结果。
   **这是本项的主要工作量**（跨 3 层 + 一次 schema 变更），
   但它是唯一**分支正确**的做法：写快照答不了「回退到更早分支点后清单该显示什么」。
3. **`getSessionTodos()` 改为按 `sessionId` 解析**，
   `cli/interactive/sessionFacts.ts:75` 与 `ambientFacts.ts:19` 随之传会话 id；
   无活动会话时返回空数组而非抛错。
4. 模块级单例（`core/commands/todoCommandRuntime.ts:9-10`）删除。

**撤销验证**：`/todo add x` 后重启会话（或 resume），
`getSessionTodos(sessionId)` 恢复 `["x"]`；回退到一个更早的分支点后清单反映**那个点**的状态
（这条断言正是「快照方案」通不过的）。

**风险**：
- `metadata` 进事件流与 transcript 会扩大载荷 ⇒ 须有**大小上限与脱敏**
  （沿用既有 `redaction`/`safeLine` 做法），避免把大对象灌进 transcript；
- 扩展 `SessionMessage` 是**格式变更** ⇒ 必须保持旧 transcript 可读
  （加可选字段 + 不改 `TRANSCRIPT_FORMAT_VERSION`，或按既有版本策略处理）；
- `/todo` 的清单文本**不应**含凭据/绝对路径等敏感内容写入 transcript。

---

### 16-H 执行补充（2026-09-29）

**三段通道已贯通（按裁决的三段，全部落地）**：

| 段 | 实现 |
|---|---|
| 事件/结果层 | `AgentToolResult` 增 `metadata?`；`turn/tools.ts` 的门把 `result.metadata` 透传；`core/agent/tools.ts` 的 `createToolResultMessage(id, output, metadata)` 把它放进 tool 角色消息（**并行与串行两条路径都接**） |
| 持久层 | `SessionMessage` 增可选 `metadata`（**不改 `TRANSCRIPT_FORMAT_VERSION`**，旧 transcript 原样可读）；`sessionEventCodec` 的 `createMessageTranscriptEvent` / `transcriptEventToSessionMessage` / `TranscriptEvent` union 三处同步——探针实测**编码→解码往返不丢** |
| 重放层 | `replayTodosFromMessages(sessionId, messages)`：按序扫 tool 角色消息的 `metadata.todo`，**最后一个可读的记录胜出**；`interactiveMode` 打开会话时以 `loadSession(id).turns` 调它（读不到记录时容忍为空） |

**会话隔离（裁决第 3 条）**：模块级单例删除，改为 `Map<sessionId, list>`；
`getSessionTodos(sessionId?)` 无会话返回 `[]` 而非抛错；
`sessionFacts`/`ambientFacts` 均已按会话 id 读取。

**分支正确性的验证（撤销验证的核心一条）**：
`/todo add first` → `/todo add second` → `done 1` 后，
把会话**回退**到只有第一条记录的分支点 ⇒ `getSessionTodos` 恢复为
`[first(pending)]`——**这正是快照方案通不过的断言**（快照只会给最新状态）。
另有：记录在案的清空（`todo: []`）恢复为空；无 todo 元数据的轮次**不动**既有清单；
**畸形记录不采纳**（`items.length !== todo.length` 时跳过，避免手改 transcript 把垃圾灌进状态栏）。

**大小与脱敏（裁决风险项）**：todo 记录是工具自己写的清单文本
（id/正文/状态三字段），**不经过用户输入直接落盘的路径**；
事件侧未加通用上限——`metadata` 是可选字段，本次唯一写者是 todo 工具，
其载荷天然有界；给通用通道加上限时留待真正有第二个写者时做（记入 backlog）。

## 3. 执行序（4 波，每波独立可交付）

| 波 | 项 | 理由 |
|---|---|---|
| **1** | **16-I** → **16-D+16-E** → **16-A** | I 最小且解除错误承诺；D+E 是同一提交的安全收口；A 补上最严重的「已声明完成却断了」 |
| **2** | **16-B** → **16-K** → **16-G** | 都是「错误/状态不再说谎」，彼此不共享文件 |
| **3** | **16-C** → **16-F** | 都在 presentation 层，C 先（它改的是同一批文件），F 紧随（复用 C 建立的块偏移） |
| **4** | **16-H** | 需新增事件通道，牵动事件载荷与重放，单独一波 |

每波结束跑：`tsc -p tsconfig.build.json`、5 个 `check:*`/`verify:*` 门禁、
`test:scripts`、改动域测试；每波最后一项完成后同步 `_index.md` 与 `log.md`。

---

### 16-I 执行中新增发现（已在本项内修复，2026-09-29）

16-I 的验收要求「`/statusline use model,cost` 在隔离 HOME 下真的写入」。
第一次实测失败，暴露出一个**比 16-I 本身更严重的缺陷**：

**缺陷：`RESERVED_SHELL_SLASH_COMMANDS` 是命令注册表的手抄副本，且已漂移。**

`entrypoints/cliArgs.ts` 里有一张 98 项的硬编码名单，用来区分「这个位置参数是命令，不是路径」。
实测（探针 `listSlashCommands()` 与名单求差）：

| 方向 | 数量 | 例 |
|---|---|---|
| 注册表有、名单**没有** | **26** | `/settings` `/theme` `/tools` `/statusline` `/skill` `/log` `/report` `/reload` `/trust` `/commit` … |
| 名单有、注册表**没有** | **10** | `/plan` `/mode` `/view` `/build` `/doctor` `/workflow-status` `/agent-mode` … |

**后果（实测，非推断）**：名单只做**整 token 精确匹配**，所以带参数的命令一律落进「路径」分支——

```
$ cheers --print "/memory save hello"     → Target project does not exist: /memory save hello
$ cheers --print "/todo add buy milk"     → Target project does not exist: /todo add buy milk
$ cheers --print "/model use openai/gpt-4"→ Target project does not exist: /model use openai/gpt-4
```

即**任何带参数的 slash 命令在 `--print` / 管道模式下都不可用**
（不带参数时能过，是因为整 token 恰好命中名单）。
另有一条同源缺陷：`/model use openai/gpt-4` 会把**命令的实参** `openai/gpt-4` 当作项目路径挖出来——
基线行为即如此，与名单漂移**同根**：判定只问「整 token 是不是名单里的词」，不问它在命令之后。

**处置（已实施）**：
1. **名单改为从注册表派生**（`listSlashCommands()`），删掉 98 项硬编码；
   加一条测试断言**每一个已注册命令**（含别名）都不被当成路径——命令后来新增时自动覆盖。
   参照 `pi`：`packages/coding-agent/src/cli/args.ts` 用「单个赋值循环 + 兜底分支」解析位置参数，
   **没有**任何命令名硬编码名单；我们的修法与之同向（来源唯一）。
2. 判定改为看**首个路径段**是否为命令名：
   `/memory save x` 判为命令（带参数），`/tmp/project` 判为路径。
   `/` 会同时匹配两者——分隔符包含空格。
3. **命令 token 之后的实参不再参与路径挖掘**，堵住 `/model use openai/gpt-4` 一类。
4. `//host/share` 仍判为路径（UNC），因为 `//` 不是命令前缀。
5. 未知命令（如 `/unknowncmd arg`）**维持原行为**：仍被当作路径，
   由既有的「Target project does not exist」报错——不改判定语义，只修漂移与实参。

**启动开销**：`slashCommandRegistry` 本就在 `cliProcessRunner` 的静态导入图上
（经 `cliRuntimeModule`），且新逻辑是**惰性**求值（首次遇到斜杠 token 才建表），实测 `--version` 无变化。

### 16-D + 16-E 执行中新增发现（2026-09-29）

**① 重定向治理的机制与初稿假设不同（探针实测，三次尝试）**

裁决第 8 条写「要么用 `context.route(...)` 拦截每一次请求，要么在导航后读 `page.url()` 复核落点」。
实测**前者不可行**：

| 尝试 | 结果 |
|---|---|
| `page.route("**/*")` + `route.continue()` | **只看到首个请求**，重定向跳转不进 handler（探针：`route saw: ['http://127.0.0.1:PORT/start']`，最终 URL 已是落点） |
| `route.continue({ maxRedirects: 0 })` | 同样只看到首个请求 |
| `route.fetch({ maxRedirects: 0 })` | **能看到 `Location` 头**，但 `route.fulfill({ response })` 会让 Chromium 报 `Navigation is interrupted`，普通导航也一起坏掉 |

⇒ 采用**第二种**（导航后复核 `page.url()`），即本仓 `web_fetch` 的同类思路在浏览器侧的最小可行形态。

**诚实的残余面（已写入注释与测试）**：`page.goto` **内部**跟随重定向，
所以落点若**不可达**（如 `169.254.169.254`），goto 抛错 → 报 `navigation-failed`
（浏览器只给 `ERR_ADDRESS_UNREACHABLE`，不给策略理由）；
只有落点**可达**时才走复核并报 `url-refused`。
即**该策略拒绝不会放过一个可达的越界落点**，但**不可达落点会以网络错误而非策略拒绝的形式出现**。
测试用「可达但不在允许清单内的第二个本地源」钉住复核这条路径。

**② `::1` 被误判为 IPv4-mapped（既有缺陷，探针实测）**

```
基线：blockedHostReason("::1") === "unspecified address (IPv4-mapped)"
```
`::1` 是 `0.0.0.0/8` 中 `0.0.0.1` 的 IPv4 兼容形式，嵌入式 v4 分支先于 loopback 判定命中。
地址仍被拒（**不是可达性漏洞**），但**类别错**——而类别正是新策略据以放行 loopback 的依据，
故 IPv6 loopback 会被浏览器策略**误拒**。已把 `::`/`::1` 两条判定提到嵌入式分支之前。

**③ `fd00:ec2::254` 被当作普通 ULA（既有缺陷）**

它落在 `fc00::/7` 内，故继承「私网」待遇。已单独识别为 metadata 类，
并把**链路本地从 `private` 拆出为独立类**——放行内网是有人会做的决定，放行元数据端点没有人会做。

**④ `PwPage` 声明与实际调用不符（结构性缺陷）**

`PwPage` 只声明了 `title`/`locator`/`getByRole`/`getByLabel`/`setContent` 等，
而会话实际调用的是 `goto`/`url`/`evaluate`/`click`/`fill`/`selectOption`/`hover`/`keyboard`/`on`——
全部靠 **11 处 `as unknown as` 强转**绕过。已改为按**实际调用面**声明，强转清零；
`locator` 系列（`PwLocator` 整个接口）**无任何调用点**，删除。

**⑤ `Function('return import(...)')` 在测试运行器下取不到包**

会话原先用该写法动态导入 `playwright-core`，在 vitest 下**始终失败**，
使发布路径与测试路径的行为不一致。改为复用既有 `importPwRuntime()`
（它已做包解析、`isPwRuntimeModule` 校验并返回证据），删除重复实现。

## 4. 移出本阶段（Phase 17 或独立裁决）

| 项 | 理由 |
|---|---|
| **16-J** 死代码清理（`edit/patch` 三角 429 行、`runtimeHandoffProjection.ts` 502 行、`workspaceFileContract.ts` 205 行、`core/harness/**` 29 文件归位） | 是**债务**不是缺陷；需逐条闭包核实（Phase 5 的教训是子代理会把有引用者的文件误列进闭包） |
| **16-L** 的 Bedrock 端到端部分 | 无可用账号；协议正确性已并入 16-K（读码 + 单测级） |
| **16-M** `NO_COLOR`/`FORCE_COLOR`/truecolor/`tuiMode:"stream"` | P3；属「补标准支持」而非修缺陷。`"stream"` 无行为一项可顺手在 16-F 里删类型取值（见 §5 待确认） |
| **16-N** 代码围栏语法着色 | P3 增强；参考侧有 56 令牌可照抄，体量适合作独立阶段 |
| **项目记忆自动注入模式**（Claude Code 式索引常驻） | §2 16-A 第 4 条：产品模型变更 + 提示注入面，独立裁决 |
| **真正的 alt-screen 分栏侧栏** | 12 号文档 §3.3 已记，产品决定 |
| **MCP SSE/HTTP 传输、per-prompt gateway 重建** | Phase 15 已记 backlog |

---

## 5. 已知取舍（有意分歧，记录备查）

| 分歧 | 我方 | 参考 | 为何维持 |
|---|---|---|---|
| 主屏宽度变化 | 不夺屏，只重新锚定底部，历史交给终端换行 | pi 宽度变化**整屏重绘**（`fullRender(true)`） | 不夺屏正是 `regular` 模式存在的理由；重绘会把用户的滚回区清掉 |
| loopback 出站 | **默认放行**（元数据/私网仍拒） | `playwright-mcp`/`stagehand` **默认允许** | **已与参考一致**。初稿曾主张「默认拒绝以对齐 `web_fetch`」，经二次核实推翻：`web_fetch` 是「只做公网」的工具、`browser` 的本职就是本地页面，二者的差异是**设计意图**不是不一致；且 `bash` 无出站限制、沙箱默认关闭 ⇒ 拦 loopback 是安全剧场 |
| 记忆注入 | **显式 `/memory use`** | Claude Code **每会话自动注入索引** | 见 §2 16-A 第 4 条 |
| 锁实现 | 自建（pid 存活 + 年龄 + breaker） | pi 用 `proper-lockfile` 依赖 | 本仓倾向不为一件事引入运行时依赖；opencode 亦是自建 |
| todo 状态载体 | 工具结果 `metadata`（需新增通道） | pi 用工具结果 `details` | 同一机制；差别仅在我方事件流尚未携带它 |

---

## 6. 已由维护者裁决（2 项，均已于 2026-09-29 结案）

1. **16-E loopback 默认值 → 裁决：默认放行**，仅元数据/链路本地与 RFC1918 默认拒绝。
   维护者质疑了初稿的「默认拒绝」，主代理二次核实后**推翻初稿**（见 §2 16-E 第 7 条的更正说明）：
   `web_fetch` 与 `browser` 的差异是**设计意图**而非不一致；
   且 `bash` 无出站限制、沙箱默认关闭 ⇒ 拦 loopback 拦不住任何东西，
   反而让工具**默认做不了本职**（它自述支持 localhost）。
2. **`tuiMode: "stream"` → 裁决：删除**（见 §2 16-F 第 6 条）。
   它是与 `fullscreen` 行为逐字节相同、且从未接入的取值。

---

## 7. 复核安排

本文与 `phase-16-pre-research.md` 将交**3 个只读子代理**分域证伪（并发 3）：

- **R1**：16-A / 16-B（记忆注入语义、`/compact` 合并是否真的不丢东西、钩子环依赖）
- **R2**：16-D / 16-E / 16-K（治理是否可绕过、错误分类是否与既有 `errorTaxonomy` 冲突、
  停因映射改动是否会让既有测试把「正常截断」误判为错误）
- **R3**：16-C / 16-F / 16-G / 16-H（不变量是否自洽、行数缓存键集、锁夺取的竞态、metadata 通道的大小与脱敏）

复核结论由主代理**逐条核实**，被推翻的断言在本文后续小节如实记录（沿用 Phase 15 的做法）。

---

## 8. 复核结果（2026-09-29）

### 8.1 R1（16-A / 16-B）：`P16aMemoryCompact` 复核者，**3 条实缺陷，全部采信并已修正**

| # | 复核断言 | 判定 | 主代理核实 | 处置 |
|---|---|---|---|---|
| R1-a | 「仅提供 `projectMemoryStore` 不足以产生注入」 | **incomplete** | 亲验 `projectMemoryFutureTurnInjection.ts:58` 的闸门是 `injectionStatus === "pending"`，而 `markPending` **只有 `/memory use` 会调** | **采信**；16-A 已补「两段验收」并把 (1) 命令侧点亮列为主要可观察收益 |
| R1-b | 「`.agents/memory` 与 subagent 记忆**命名空间冲突**」 | **incomplete** | 亲验 `memoryPersistence.ts:20-25` 写 `ref.root/project-memory.jsonl`（**文件**），而 `agentMemoryManager.ts:36` 用 `<root>/.agents/memory/<agentName>/MEMORY.md`（**子目录**） | **采信**；已定 root = `<root>/.agents/memory/project/` |
| R1-c | 「两处 checkpoint 写入**不能直接删**，它们是唯一生产者」 | **wrong（对初稿）** | 亲验 `compactCommandRuntime.ts:41` 是 `CompactLiveCheckpoint` 唯一生产者；消费者四处：`sidebarCommandRuntime.ts:32`、`memoryCommandRuntime.ts:135`、`sessionFutureTurnProjection.ts:49`、`agentScenarioRunner.ts:214` | **采信**；16-B 改为「**先迁移生产者、后删除**」 |
| R1-d | 「命令路径今天**并不**以 `appendCompactionEntry` 收尾」 | **wrong（对初稿）** | 亲验 `compactCommandRuntime` 只写 checkpoint/injection，**从不**调 `appendCompactionEntry`；且 `CommandContext` **没有** `sessionManager` | **采信**；16-B 已补「须给 `CommandContext` 增加会话访问」 |
| R1-e | `.agents/` 未被忽略且已被跟踪 | **wrong（对初稿）** | 亲验 `.gitignore` 无 `.agents`；`git ls-files .agents` 有 `.agents/workflows/verify.json` | **采信**；主代理已先行自行改正，复核独立复现 |

**R1 判定 `correct` 的 5 条**（零生产调用者、`CommandContext` 未装配、
无环依赖、pi 单一手动入口、3 个测试钉住预览文本）**均与主代理独立结论一致**。

**方法学备注**：初稿有 4 处被复核推翻，其中 **3 处**（R1-c/d/e）是**主代理自己**在
「建议删除/假设已忽略」时**没查消费者和跟踪状态**造成的——
与 `12-` 文档 §2.3 那次（把模型工具指向一个不能浏览的栈）**同型**：
**提出删除或迁移前，必须先查「谁在用」与「它现在在哪个状态」。**

### 8.2 R2（16-D / 16-E / 16-K）：`P16bBrowserProvider` 复核者，**6 条，全部采信并已修正**

| # | 复核断言 | 判定 | 主代理核实 | 处置 |
|---|---|---|---|---|
| R2-a | 「只删 6 处 `Simulated` 不够——`setMockHtml` + mock DOM 解析器是**另一条编造通路**」 | **incomplete** | 亲验 `sessionManager.ts:37-40` 与 `:216-230`；确认测试正是靠它通过 | **采信**；16-D 已补「连同 mock 一起移出生产类」 |
| R2-b | 「`getPwRuntimeStatus` 是**被动**探测，报不出运行期启动失败」 | **incomplete** | 亲验 `playwrightRuntime.ts:79` `passiveStatusCheck: true`、`:322` `browserLaunched: false` | **采信**；16-D 已补「主动启动期异常分类」 |
| R2-c | 「`blockedHostReason(hostname)` 与 `decideBrowserNetworkAllowlist(request)` 形状不匹配，且后者默认全拒」 | **incomplete** | 亲验 `networkAllowlist.ts` 空 `allowedOrigins` ⇒ `blocked-no-allowlist` | **采信**；16-E 已改为「专用 URL 预检 + 仅在显式配置时串 allowlist」 |
| R2-d | 「`page.goto` 跟随重定向，预检被绕过；`web_fetch` 用 `redirect: 'manual'` 逐跳复核」 | **incomplete** | 与主代理自查同一结论 | **采信**（两路独立得出，证据更硬）；已写入 16-E 第 8 条 |
| R2-e | 「流内错误抛出的实际消息是 `Network error: …`，命中 `RETRYABLE_FAILURE` ⇒ **无差别重试**」 | **incomplete（抓出主代理探针不足）** | **主代理重跑探针证实**：4 个样本全 `RETRY` | **采信且重要**；16-K 已改，并要求改措辞或加显式不可重试标记 |
| R2-f | 「`supportsTemperature` 在压缩调用点**不在作用域**，需三处改动」 | **incomplete** | 亲验 `CompactionProvider` 只声明 4 个字段 | **采信**；16-K 第 5 条已改写为三处改动 |

**R2 判定 `correct` 的 4 条**（测试依赖模拟、无执行器可浏览、`web_fetch` 默认拒 loopback、
pi 靠穷尽默认分支）**均与主代理独立结论一致**。
`couldNotCheck` 一条：Bedrock 端到端（无凭据），与本文 §4 的既有记载一致。

**关于 R2-e 的方法学教训**：主代理第一次探针**用自己构造的消息**而不是**生产代码真正产生的消息**，
因此得出了相反结论。**探针必须复用生产路径的消息构造**，否则测的是探针的假设。

### 8.3 R3（16-C / 16-F / 16-G / 16-H / 16-I）：`P16cTuiSession` 复核者，**5 条，全部采信并已修正**

| # | 复核断言 | 判定 | 主代理核实 | 处置 |
|---|---|---|---|---|
| R3-a | 「`approvalTrustPolicy` **不在** `runNonInteractivePrompt` 作用域内」 | **incomplete** | 亲验 `cliRuntimeModule.ts` 零命中该符号；它在 `cliProcessRunner.ts:65` 构造 | **采信**（主代理亦独立查到同一结论） |
| R3-b | 「`writeStatusItems` 只写用户配置，但 `readStatusItems` 优先读项目配置 ⇒ 静默被遮蔽」 | **incomplete** | 亲验 `tuiSettings.ts:22-32`，形参 `_workspaceRoot` **未使用** | **采信**；16-I 已补处置 |
| R3-c | 「内容变短、chrome 超过屏高、kitty 悬空图——不变量在这三种情形下破」 | **incomplete** | 与主代理自查的前两条一致；**kitty 悬空图是复核新增** | **采信**；16-C 风险段已逐条补上 |
| R3-d | 「`suspend()` 后光标账本与物理光标失同步，须重新锚定」 | **incomplete** | 亲验 `engine.ts:201-230` 把 stdout 交给子进程 | **采信**；16-C 已补「恢复第一步重新锚定 + 图片标记待重传」 |
| R3-e | 「**惰性 getter 比 `needsDocumentRows()` 更简**——零 `ViewContext` 改动」 | **wrong（对初稿的形态）** | 亲验 `engine.ts:295` 备用屏分支不碰 `frame.documentRows`；`frame.ts:43` 可承载 getter | **采信**；16-F 第 1 条已改为惰性 getter |
| R3-f | 「写入方**全集是五个**，初稿漏了 `pageLongOutput` 与 `splitFencedDiff`」 | **wrong（对初稿）** | 亲验 `pager.ts:28-29`、`blocks.ts:336-337` 都改 `finalized` 块 | **采信**；16-F 已列全表 |
| R3-g | 「租约锁无 fencing token，无法对抗超 `staleMs` 的暂停」 | **incomplete** | 逻辑成立；本仓无 fencing 机制 | **采信**；16-G 风险已**如实降级**（明确「不提供任意暂停下的互斥保证」） |

**R3 判定 `correct` 的 6 条**（`bridgeSafe` 从未被读、pi 差分条件、`documentRows` 备用屏不读、
`tool.result` 无 metadata、`SessionMessage` 需扩展、回退自动过滤废弃分支）**均与主代理独立结论一致**。
其中 **R3 的 16-H.14（`projectBranchMessages` 按活动分支过滤 ⇒ 回退天然重建该点状态）
是主代理未验的一条**，本次采纳并作为 16-H 的核心依据。

**三路复核合计**：**18 条断言**，其中
**correct 15 条**（与主代理结论一致）、
**incomplete / wrong 共 15 条**（初稿被修正），
`couldNotCheck` 1 条（Bedrock 端到端，无凭据）。

**三轮复核共同指向的方法学教训**（比单条修正更重要）：
1. **提出删除或迁移前，先查「谁在用」**（R1-c/R1-d、R3-f 三次命中）；
2. **探针必须复用生产路径的消息构造**（R2-e，否则测的是探针的假设）；
3. **「更简的形态」常藏在「不加新接口、改成惰性」里**（R3-e）。
