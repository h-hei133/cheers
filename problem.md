# Problem & Solutions Ledger (Full-Fidelity Production TUI Engine 1:1 Clean Adaptation)

## 1. 根本问题：103 行的 tui.ts 与 2000+ 行的生产引擎之间的巨大鸿沟

经过 5 个并行专家子代理对成熟标杆项目 `packages/tui/src/tui.ts`（2,980 行）与 `terminal.ts`（2,006 行）的全文穿透审计，对照我们当前 `packages/ts-shell/src/presentation/tui/tui.ts`（仅 103 行），共发现 **20 项核心架构缺陷**：

### 核心缺陷清单
| # | 缺陷 | 生产引擎行为（我们缺失的） |
|---|---|---|
| 1 | History 批量提交逐行 `\n` 写入 | 单次原子写入，含历史+视口帧 |
| 2 | 每次 History 提交后 prevViewport=[] 导致全量重绘 | 增量 acceptedHistoryBatchId 门控，视口保持可差分 |
| 3 | 视口绝对寻址 `rows - viewport.length` 假设占满底部 | 视口锚定在保留历史下方，滚动仅推入已提交行 |
| 4 | 无 resize 处理（无监听、无重排、无锚点恢复） | 完整事务：alt-borrow + 擦除 + 突发追踪 + 标签 CPR 锚点探测 |
| 5 | 无帧调度——每次 requestRender 同步绘制 | setImmediate 合并、30fps 节奏、自适应成本、输入宽限、256KB backlog 门控 |
| 6 | 无 Overlay 栈 | 完整 showOverlay/hideOverlay/anchors/fullscreen/mouse |
| 7 | 无焦点模型，CURSOR_MARKER 仅首次行内提取 | Focusable/OverlayFocusOwner，bottom-first 多行标记提取 |
| 8 | 输入未流经 TUI，interactiveMode 直接 `process.stdin.on("data")` | TUI #handleInput：CPR 过滤、监听链、焦点路由、key-release 过滤 |
| 9 | 无行准备：无 normalizeTerminalOutput、无截断、无宽度适配 | 完整行管线；长行当前损坏布局 |
| 10 | 无 SGR 合并；无逐行 reset/link 终结符（样式溢出风险） | 完整 SGR 合并管线 |
| 11 | 光标钉扎在 paint-end 之后（同步括号之外） | 光标移动+可见性在原子帧内 |
| 12 | 无 clearScrollback/force/resetDisplay 语义 | 完整 ED2→ED3 顺序 |
| 13 | stop() 留下模式、无 History flush、无光标恢复 | 完整生命周期 |
| 14 | 无 DECRPM 2026 协商 | 确认报告启用/禁用同步包装器 |
| 15 | 无 headless 保护：测试时向真实 stdout 写入转义字节 | isTerminalHeadless() 抑制 |
| 16 | 无断连/积压检测 | safeWrite 守卫 + 64MiB 断连 + ConPTY 16KiB 分块 |
| 17 | 无崩溃信号紧急恢复 | Postmortem 注册 emergencyTerminalRestore |
| 18 | Provider 契约不匹配（lines vs rows、无 kind:"replay"） | 完整契约 |
| 19 | TUI 非 Container——无组件树 | TUI extends Container |
| 20 | 缺失子系统：LoopWatchdog、inline images、OSC 66、mouse 等 | 完整实现 |

---

## 2. 解决方案：6 阶段 1:1 本地化适配计划

### Phase 0 — 支撑层（utils.ts 扩展 + 能力探测 + 循环看门狗 + 帧协议契约冻结）
- 扩展 `utils.ts`：normalizeTerminalOutput、truncateToWidth、sliceByColumn、extractSegments、coalesceAdjacentSgr
- 重建 `terminalCapabilities.ts`：终端 ID、多路复用器检测、DECRQM 钩子
- 新增 `frame-plan.ts`：完整契约类型（TerminalFrameProvider、HistoryBatch、Component 等）

### Phase 1 — 终端驱动重写（`terminal.ts`）
- 完整 Terminal 接口：start/enableInput/stop/drainInput、resize 监听、safeWrite 守卫、恢复电池、紧急恢复注册

### Phase 2 — TUI 核心全量替换（`tui.ts`）
- Container 组件树、帧调度器、#doRender 状态机、SGR 合并、#emitPlanFrame、start/stop 全生命周期、输入管线、焦点+光标、Overlay 栈

### Phase 3 — Resize 事务
- Alt-borrow + 突发追踪 + 标签 CPR 锚点探测 + 多路复用器模型 + 回放重排

### Phase 4 — 切换替换（删除手写路径）
- 迁移 interactiveMode.ts 到新契约，路由输入流经 TUI
- 删除 buffer.ts、altScreen.ts、tuiEngine.ts 及其测试

### Phase 5 — 可选子系统（内联图像、OSC 66、调试服务器、进度条等）
