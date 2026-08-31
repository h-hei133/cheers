# 全量工业级 TUI 交互引擎 1:1 本地化重构技术专著 (Full-Fidelity TUI Engine Adaptation Architecture)

## 1. 架构目标与全面升级路线

为了彻底告别碎片化手写玩具代码，我们对成熟标杆项目的全套 TUI 源码体系进行了完整的 1:1 架构映射与本地化设计（**严格采用纯原生命名，杜绝任何外部违规名词**）：

```
packages/ts-shell/src/presentation/tui/
├── terminal.ts                      # 生产级 ProcessTerminal: ConPTY 分块, Backlog 内存保护, Raw Mode 控制
├── terminalCapabilities.ts          # 终端能力探测: TrueColor, DEC 2026 同步输出, Kitty 协议, 超链接
├── utils.ts                         # Unicode Grapheme 字符簇切分, ANSI 折行, visibleWidth 真实列宽
├── tui.ts                           # 双缓冲差分渲染引擎: HistoryBatch 滚动条退役, Viewport 视口, CURSOR_MARKER
├── killRing.ts                      # Emacs 风格 Kill-Ring 剪贴环与 Yank 栈
├── input/
│   ├── stdinBuffer.ts               # StdinBuffer 输入流分块拼装与 Bracketed Paste 状态机
│   ├── keys.ts                      # 键盘序列解析 (Kitty 协议, CSI/SS3, 修饰键组合)
│   └── keybindings.ts               # 动作键映射管理器与用户自定义覆盖
├── components/
│   ├── editor.ts                    # 工业级多行文本编辑器 (Intl.Segmenter 折行, 撤销栈, 光标钉扎)
│   ├── selectList.ts                # 交互式选择器浮窗 (模糊匹配, 方向键平滑导航, 滚动条)
│   ├── box.ts                       # 容器 Box 组件 (支持 padding, 边框, 视口缓存)
│   ├── text.ts                      # 纯文本组件 (保留 ANSI 样式折行)
│   ├── spacer.ts                    # 布局留白组件
│   ├── scrollView.ts                # 可滚动视口容器
│   ├── statusLine.ts                # 多段自适应状态栏 (模型, 分支, Context 预警, 耗时)
│   ├── welcomeBanner.ts             # 极简 Welcome 卡片 (顶部工作目录与当前模型)
│   ├── transcriptContainer.ts       # 转录历史容器 (管理用户输入, 命令结果, 工具输出)
│   └── composer/
│       ├── types.ts                 # 框体样式接口 (ComposerStyle)
│       ├── registry.ts              # 样式注册表
│       ├── box.ts                   # 圆角全包围框 (╭─ ... ╮ / ╰─ ... ╯)
│       ├── rule.ts                  # 单横线通栏分割样式
│       ├── compact.ts               # 紧凑型边框样式
│       └── borderless.ts            # 极简无边框样式
└── interactive/
    ├── composer.ts                  # 视口组装器 (协调 Welcome, Transcript, Editor, StatusLine)
    ├── interactiveMode.ts           # 完整替代 interactiveLoop.ts 的交互模式编排器
    └── controllers/
        ├── inputController.ts       # 键盘事件分发与 Escape 取消阶梯
        └── commandController.ts     # Slash 命令执行、结果拦截与 TUI 上屏
```

---

## 2. 核心机制优势与彻底解决的痛点

1. **光标漂移与输入框破坏彻底根治**：
   - 全面引入 `tui.ts` 的 `HistoryBatch` 机制：历史输出不再直接裸写 stdout，而是作为不可变批次自然提交到终端系统的滚动条（Scrollback）中。
   - 输入框通过 `Composer` 永久固定在屏幕底部行，并通过 `CURSOR_MARKER` 自动计算绝对物理坐标（`\x1b[row;colH\x1b[?25h`），光标 100% 稳定钉在输入点。
2. **Slash 命令自覆盖彻底根治**：
   - 通过 `CommandController` 与 `TranscriptContainer`，所有 Slash 命令（`/help`, `/model`, `/cost`, `/context`, `/undo` 等）的结果直接作为一条消息块追加到上方的历史转录容器中，常驻上方，绝不被底部的输入框重绘所抹除。
3. **多行编辑与交互补全完美协同**：
   - 采用成熟的 `Editor` + `SelectList` + `InputController`，输入 `/` 弹出补全，方向键平滑选择，`Tab`/`Enter` 自动补全上屏，`Escape` 多级取消。

---

## 3. 结论

本套架构直接本地化吸收了成熟顶尖标杆项目的全部核心设计，彻底消除了手写原型玩具的零散缺陷，为打造 100% 工业级的终端体验提供了终极路线图。
