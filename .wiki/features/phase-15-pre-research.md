# Phase 15 预研究：全面差距扫描（2026-09-28）

## 0. 方法与证据等级

3 个只读子代理（并发 3，`vsllm/gemini-3.8-flash-api:max`）分域扫描：
TUI 表面、agent 功能、会话生命周期，对照 `~/projects/pi`（主参考）。
**每条结论经我逐条核实**（读码复现或 live 验证）后才写入本文——子代理结论
不可盲信，本轮又过滤掉 2 条错误断言（见 §5）。

证据等级：
- ✅ = 我亲自读码/运行验证
- 📎 = 子代理给出 file:line，我抽查过上下文

## 1. 结论总览

**不是又一次「普遍 demo」**。TUI 核心（渲染引擎、输入、编辑器、transcript、
chrome）是全接线、全测试的生产代码，零 stub。真差距集中在 **6 个具体缺口**，
其中 3 个是「宣称完成但接线中断」类（与 Phase 14 D1–D6 同型），3 个是
「pi 有、我们确实没有」类。

| # | 缺口 | 类别 | 严重度 |
|---|---|---|---|
| G1 | MCP 工具调用返回硬编码假串，生产路径从不注入 mcpTools | 接线中断 | **高** |
| G2 | `/plugin` 明文承认「此构建不执行任何注册项」 | demo 声明 | **高** |
| G3 | `presentation/sidebar/` 整层未接 TUI，自述「无真实 sidebar UI」 | demo 声明 | 中 |
| G4 | 终端图形：图片显示（Kitty/iTerm2 协议）与 LaTeX 均无 | pi 有我们无 | 中 |
| G5 | 会话 fork/clone、`/import`、`/share`(gist) 无 | pi 有我们无 | 中 |
| G6 | 终端 title / 空闲桌面通知 / bell 无 | pi 有我们无 | 低-中 |

另有一批「实测不缺」记录（§4），防止未来误判重查。

## 2. 六个缺口（核实细节）

### G1 — MCP 模型侧调用是假的（✅ 逐行核实）

两层断裂：

1. **转发层**：`core/tools/registry.ts:795-803` — MCP 工具的 `execute` 检查
   `options?.mcpGateway` 存在后，**返回硬编码的
   `approvedResult("MCP tool ${qualifiedName} called")`**，从不调用
   `gateway.invokeTool()`。模型看到「调用成功」但什么都没发生——比直接
   报错更糟，是欺骗性的假结果。
2. **注入层**：`createCoreToolRegistry()` 生产调用点
   （`entrypoints/cliRuntimeInvocation.ts:454`）只传 `{ skills }`，
   **从不传 `mcpTools` / `mcpGateway`**——即使修好转发层，也没有任何
   MCP 工具被注册进模型工具池。

而底层是好的：`core/mcp/client.ts:147` 的 `invokeTool`（stdio）真实实现，
`gateway.ts:162` 的 `invokeTool` 真实转发，`/mcp status|tools|doctor|refresh`
经 `runCliMcpCommand` 在交互与非交互模式都接线（✅
`cliRuntimeModule.ts:267-274`、`interactiveCommandRouter.ts:225-232`）。
即：**用户侧 MCP 诊断可用，模型侧 MCP 调用是空壳**。

限制面（真实存在，需一并写清）：`client.ts:170-175` 非 stdio 传输
（SSE/HTTP）直接抛 `unsupportedTransportDetail`——stdio 是唯一传输。

**修复方向**（feature 15-A）：
- registry 的 MCP execute 改为真实 `invokeTool`，返回值映射进
  `AgentToolResult`（错误经 `errorTaxonomy` 分类）；
- cliRuntimeInvocation 从 gateway 取 `listTools()` 结果 +
  gateway 本身传进 `createCoreToolRegistry`；
- 补撤销验证测试：断言调用真的到达 gateway（用内存 double，防止
  Phase 14 那种「删掉修复照样过」的假测试）；
- SSE/HTTP 传输作为独立任务（15-B），不与本项混做。

### G2 — `/plugin` 无执行引擎（✅ 逐字核实）

`core/commands/pluginCommandRuntime.ts:155,173,310` 三处明文：
"Nothing is executed from a registration in this build." —— add/enable/
disable 只操作 `plugins.json` 元数据，无任何代码加载。这是**诚实的
占位**（比假装执行好），但按「不做 demo 模块」的标准必须收口：
或做真实加载器（pi 用 jiti 加载 TS 模块，可注册 UI/工具/命令/事件），
或删除该命令与存储层。**裁决点**——做全量扩展运行时是大工程，
与 G3/G4 有重叠，建议三缺合并规划。

### G3 — sidebar 整层是只读预览（✅ 逐字核实）

`presentation/sidebar/sidebarStateSurface.ts:28-30` 自述三行：
"State preview only: no actual sidebar UI exists yet." /
"Read-only: … no persistence, no automatic memory/startup injection." /
"Tool discovery not run: unknown/deferred entries are placeholders."
整层（27 文件，含 renderer/layout/runtime/store）**从未被
`surface/view.ts` 或 `render/engine.ts` 引入**，仅 `/sidebar` 斜杠命令
以纯文本输出（`sidebarCommandRuntime.ts:15`）。

选项：
- (a) 接成真 sidebar（alt-screen 侧栏，pi 有 box/h-stack 布局原语可参考）
- (b) 保持只读投影，但删掉「preview only」的伪装文案、把 27 文件
  压缩到真正被消费的路径
- (c) 删除整层（若裁决不要 sidebar）

### G4 — 终端图形缺失（✅ 空实现核实）

- **图片显示**：`grep -ri 'kitty.*graphics\|iTerm.*1337\|sixel'`
  `presentation/` 零命中。现有 `terminalCapabilities.ts:36` 已探测
  KITTY_PID（仅用于键盘协议）。pi 在 `tui/terminal-image.ts` 实现
  Kitty `\x1b_G` + iTerm2 OSC 1337 + cell 尺寸查询 `\x1b[16t` +
  multiplexer 穿透。
- **LaTeX**：`grep -rn 'latex\|frac'` 零命中。pi 的 `tui/latex.ts`
  （1,506 行）把数学语法编译成 Unicode。我们的 transcript markdown
  渲染器对 `$...$` 无处理。
- 现状：图片**只进不出**——`clipboardImage.ts:182` 能收，终端看不到。
  对 agent 产品，模型产出图表（如 mermaid）已渲染，但截图/浏览器
  图片无法回显。

### G5 — 会话操作面缺三个命令（✅ 核实）

`registry.ts` 42 个命令对照 pi 的 slash 清单，缺：
- `/fork` `/clone`（pi `session-manager.ts:1810-1845` forkFrom 把树路径
  克隆成新会话文件；我们的 revertTo 是同文件内换 activeLeaf，语义不同）
- `/import`（从外部 .jsonl 恢复；我们的 sessionReadSurface 只读自家目录）
- `/share`（pi 发布 secret gist；我们 `/export` 有 html/md/jsonl 三格式
  ✅ 但无上传）
- `/name`（会话重命名——小项）
- `/settings`（TUI 设置面板——pi 有 settings-list 组件；我们只有
  分散的 /theme /thinking /fast + 配置文件手编 + /reload）

### G6 — 终端集成三件小缺口（✅ 零命中核实）

- **title**：无 OSC 0/2、无 `process.title` 更新
- **空闲通知**：无 OSC 777/99、无 Windows toast；`turnSink.notify`
  只写 TUI 内部 toast——长任务完成时后台用户无感
- **bell**：`\x07` 只作 OSC 52/8 分隔符，从不作为注意力信号

## 3. TUI 组件对照表（核通过的等价物，不缺）

| pi 组件 | 我们的等价物 | 判定 |
|---|---|---|
| select-list | chrome/options + modal + panel | ✅ 齐 |
| scroll-view | surface/pane + scroll + viewport | ✅ 齐（滚轮/拖选/边沿自动滚/点击折叠） |
| markdown | transcript/markdown + markdownScan + mermaid | ✅ 齐 |
| truncated-text | text/layout（ANSI 感知截断） | ✅ 齐 |
| kill-ring | editor/killRing + yank | ✅ 齐 |
| undo-stack | editor/editHistory | ✅ 齐 |
| word-navigation | text/motion（grapheme cluster） | ✅ 齐 |
| alt-screen-search | transcript/search + searchState（软换行内匹配、回环绕行） | ✅ 齐 |
| loader/cancellable | transcript/live（spinner/token/耗时/中断提示） | ✅ 齐 |
| mouse-region | cli/interactive/pointer（集中式几何查询，架构不同非缺失） | ✅ 齐 |
| box/h-stack/v-stack/spacer | 直接字符串数组布局画法 | 不需要（不同架构） |
| settings-list | 无交互设置面板 | **缺 → G5** |
| terminal-image / image | 无 | **缺 → G4** |
| latex | 无 | **缺 → G4** |

鼠标端到端已验证五条消费路径（滚轮/滚动条拖拽/文本拖选自动复制/
边沿自动滚/单击折叠 reasoning 块）✅。alt-screen 与 main-screen
双模式（`tuiMode: "regular"` 保 scrollback）✅。

## 4. 实测不缺（防止未来误查）

- **steering/followUp 双队列**：`agent.ts:38-48`、`loop.ts:94-95,321-328`
  完整对齐 pi（含 ctrl+q 排队、中断时未投递消息回填编辑器、TUI hint
  显示排队数）✅
- **审批 UX**：allow-once/always/deny 三选 picker + HookTrustStore
  SHA-256 指纹持久化 + 权限档位状态条 ✅
- **hooks 深度**：18 事件全有派发点（declarations 门禁），命令钩子走
  OS 沙箱、进程内钩子真实执行（`postMutationLspGuard`）✅
- **导出**：markdown（折叠 tool result）、jsonl（带版本头）、
  自包含 HTML（树侧栏+过滤+内嵌 base64）✅
- **/model refresh** 已接 `refreshCatalog()`（`modelCommandRuntime.ts:53`）✅
- **状态栏**：15 fact 项、/statusline picker 持久化到 `tui.statusItems` ✅
  （缺后台 git watcher 与扩展注入口——低优先，记 backlog）
- **prompt 模板**：`$1/$@/${1:-fallback}/${@:2}` 展开齐 ✅
- **cacheWaste 归因**：`CacheMiss{missedTokens, missedCost, idleMs,
  modelChanged}` 全有（子代理说缺是错的）✅

## 5. 子代理错误断言（核实后剔除，留档）

| 断言 | 核实 | 结论 |
|---|---|---|
| cacheWaste 无 idleMs/modelChanged 归因 | `cacheWaste.ts:38,40,204` 字段都在 | **错**，剔除 |
| transcript 缺 parentId 是「宣称完成 vs 现实」 | 属实但已有裁决：Phase 14 §5 Q5「维持不做」（分支拓扑归 thread state，双源必分歧） | **已裁决**，非新差距 |

## 6. 下一步

`phase-15-decisions.md` 将对 G1–G6 排序裁决：
- 15-A（MCP 真转发 + 注入）独立先行——纯接线修复，无裁决依赖
- G2+G3 合并规划（扩展运行时 or 删减）——需维护者拍板
- G4/G5/G6 逐项裁决做或不做
