# 生产级 TUI 引擎 1:1 全量适配技术专著 (Full-Fidelity Production TUI Engine Adaptation Architecture)

## 1. 调研方法与覆盖范围

通过 5 个并行专家子代理（模型 vyceai/deepseek-v4-flash，最高并发 5），对成熟标杆项目 `packages/tui/src/` 进行了全文穿透审计，涵盖：
- `tui.ts`（2,980 行）— 生产级双缓冲差分 TUI 引擎
- `terminal.ts`（2,006 行）— 生产级终端驱动
- `components/editor.ts` — 多行编辑器
- `autocomplete.ts` & `select-list.ts` — 交互补全
- `interactive-mode.ts`（5,978 行）— 交互模式编排器
- `composer.ts`（634 行）— 帧组装器
- `controllers/`（3 个文件）— 输入/命令/事件控制器

对照本项目当前 `packages/ts-shell/src/presentation/tui/tui.ts`（仅 103 行）与 `terminal.ts`（51 行），发现 **20 项核心架构缺陷**。

---

## 2. 20 项核心缺陷与 6 阶段适配计划

### 20 项缺陷概览（详见 problem.md）

| 类别 | 缺陷编号 | 核心差距 |
|---|---|---|
| **渲染管线** | #1-5 | History 原子提交、增量门控、视口锚定、resize 事务、帧调度器 |
| **交互管线** | #6-8 | Overlay 栈、焦点模型、输入流经 TUI |
| **行准备与样式** | #9-10 | normalizeTerminalOutput、SGR 合并、逐行 reset 终结符 |
| **生命周期** | #11-17 | 光标钉扎时机、clearScrollback 语义、stop() 恢复、DECRPM 协商、headless 保护、积压检测、崩溃恢复 |
| **协议与契约** | #18-19 | Provider 契约（rows/kind/ack/resize）、Container 组件树 |
| **子系统** | #20 | LoopWatchdog、inline images、mouse、OSC 66 等 |

### 6 阶段适配计划

```mermaid
graph TD
  P0["Phase 0: 支撑层<br/>utils.ts 扩展 + 能力探测 + 循环看门狗 + 帧协议契约冻结"]
  P1["Phase 1: 终端驱动重写<br/>terminal.ts 完整 Terminal 接口"]
  P2["Phase 2: TUI 核心全量替换<br/>Container 树 + 帧调度器 + #doRender + SGR 合并 + Overlay 栈"]
  P3["Phase 3: Resize 事务<br/>Alt-borrow + CPR 锚点探测 + 多路复用器模型"]
  P4["Phase 4: 切换替换<br/>删除 buffer.ts / altScreen.ts / tuiEngine.ts + 迁移调用方"]
  P5["Phase 5: 可选子系统<br/>内联图像 / OSC 66 / 调试服务器 / 进度条"]

  P0 --> P1 --> P2 --> P3 --> P4 --> P5
```

---

## 3. 环境变量前缀统一（去外部化）

| 原始外部前缀 | 本项目原生前缀 |
|---|---|
| `OMP_TUI_DEBUG` | `TSSHELL_TUI_DEBUG` |
| `PI_NO_SGR_COALESCE` | `TSSHELL_NO_SGR_COALESCE` |
| `PI_TUI_RESIZE_SCROLLBACK` | `TSSHELL_RESIZE_SCROLLBACK` |
| `PI_HARDWARE_CURSOR` | `TSSHELL_HARDWARE_CURSOR` |
| `PI_FORCE_IMAGE_PROTOCOL` | `TSSHELL_FORCE_IMAGE_PROTOCOL` |

---

## 4. 结论

通过 1:1 本地化吸收成熟标杆项目的全部 20 项核心设计，彻底消除了手写原型玩具的零散缺陷，为打造 100% 工业级的终端体验提供了终极路线图。
