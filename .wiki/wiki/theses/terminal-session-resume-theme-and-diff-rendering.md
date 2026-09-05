# 终端会话恢复、语义配色体系与差异渲染演进设计

## 摘要

本文档针对终端编码智能体（Coding Agent）交互界面的核心视觉与操作体感缺陷进行系统性对标研究与架构演进设计。主要涵盖四个维度：
1. **会话恢复与生命周期管理（Session Resume & Lifecycle）**：消除会话标识符裸露现象，确立基于提示词首行语义的内容派生命名机制，构建终端原生键盘事件驱动的会话删除（`Ctrl+D`）与即时重命名（`Ctrl+R`）交互状态机。
2. **终端视口与原生滚动协调（Terminal Viewport & Scrollback Coordination）**：解析全屏备用屏（Alternate Screen Buffer）与原生回滚历史的交互关系，确立基于 `Ctrl+End` / 视口跳转的平滑导航机制。
3. **数据驱动语义配色引擎（Data-Driven Semantic Theme Engine）**：基于工业界标杆深色主题（Dark Theme Palette）提取核心色彩变量表与语义 Token 映射，实现 24 位真彩色（TrueColor 16M）精准渲染，杜绝色阶下采样导致的色彩失真（如褐色背景变蓝）。实现零代码侵入的主题热插拔机制，新增配置仅需导入标准 JSON 规范。确立前景色与背景色的清晰语义分工：用户输入采用温润深炭黑背景气泡搭配纯白前景，其余内容严格采用差异化前景色区分（文件名浅蓝、思考过程灰调、命令各部分语法高亮、输出纯白、删除红、新增绿）。
4. **代码编辑差异高亮流水线（File Mutation Diff Pipeline）**：在文件更新与代码替换工具执行链路上打通统一差异（Unified Diff）生成通道，终端卡片实时提取并高亮新增与删除行，提供行内字符级反差强调。

---

## 一、 会话恢复与生命周期管理架构

### 1.1 现状缺陷诊断
在原有实现中，会话恢复界面（`/resume`）存在严重的标识符泄露与交互缺失：
- **名称标识符混淆**：会话选择器与历史列表直接展示内部技术标识（如 `sess_a1b2c3d4`），缺少对用户意图的语义概括；新建会话未持久化标题前，列表退化为无序 ID 集合。
- **删除与重命名能力缺失**：原生 TUI 事件循环接管了标准输入的原始模式（Raw Mode），传统 `readline` 交互由于未能消费 TUI 键盘事件导致阻塞死锁，用户无法在选择器中对无用会话执行物理清理或意图重命名。

### 1.2 语义标题自动派生机制
对标顶尖终端助手的设计规范，会话标题派生分为三级优先级降级策略：
1. **显式用户定义标题**：用户通过重命名或系统指令显式设定的 `session.title` 拥有最高优先级，永久锁定且不被后续自动生成覆盖。
2. **首轮提示词语义收敛**：在首个用户提示词通过 `persistSessionUserPromptBarrier` 写入会话栅栏时，提取提示词第一非空行，剔除控制字符与多余空白，截取不超过 60 字符的意图短语作为初始标题：
   $$\text{Title} = \text{truncate}(\text{normalizeWhitespace}(\text{firstLine}(\text{Prompt})), 60)$$
3. **安全回退保护**：对于尚未开始对话的空会话或低信息量输入，回退至所属工程根目录标签或 `New session`，严禁在主标题展示裸 ID。会话 ID 仅作为右侧或次行微弱注释用于精确消歧。

### 1.3 模态浮层内联交互状态机
在 `OverlayHost` 内部建立轻量级子状态机（`subMode: "none" | "confirm-delete" | "rename"`），完全避免跳出 TUI 或创建阻塞性子进程：
- **删除流程（`Ctrl+D` / `Delete`）**：
  - 选中目标项后触发，浮层临时挂载内联确认面板：`Delete session "<Title>"? [y/Enter] Confirm  [n/Esc] Cancel`；
  - 监听 `y` 或 `Enter` 触发物理删除 `sessionManager.deleteSession(id)`，即时触发数据重载与界面重绘；
  - 监听 `n` 或 `Esc` 无损退出确认态，保留当前选择焦点。
- **重命名流程（`Ctrl+R`）**：
  - 选中目标项后触发，浮层进入单行文本编辑态：`Rename session to: ▸ <Draft>█`；
  - 键盘字符与退格键仅操作当前草稿缓冲区，`Enter` 提交持久化 `sessionManager.renameSession(id, nextTitle)` 并刷新视图；
  - `Esc` 放弃变更并恢复会话列表。

---

## 二、 终端视口与滚动导航体系

### 2.1 备用屏与滚动条权衡
终端环境中存在两套并行的滚动体系：
- **普通屏幕流式滚动（Normal Buffer）**：渲染器直接流式打印内容至终端标准缓冲区，终端原生滚动条随着行数增长自动拉长滑块，但在全屏交互组件刷新时容易产生界面撕裂。
- **备用屏幕自管视口（Alternate Screen Buffer）**：通过 ANSI `\x1b[?1049h` 建立独立视口，界面重绘通过行列差分（Diff Paint）完成，防止污染用户原生终端历史。

在当前全屏备用屏架构下，终端外壳（如 Windows Terminal）的原生滚动条在备用屏处于非活动态。此前尝试在最右列强行绘制字符滚动条（`│` / `█`）破坏了表格与行尾对齐，且视觉突兀。因此本次演进规范：
- 废除硬编码的字符占位滚动条，保持视口全宽内容布局的纯净度；
- 在键盘协议层建立快捷视口直达能力：`Ctrl+End` 全局绑定 `scrollToEnd()`，单键直达实时交互边缘；配合 `PageUp`/`PageDown` 与 `Shift+Up`/`Shift+Down` 满足大尺度历史回溯。

---

## 三、 数据驱动语义配色体系

### 3.1 色彩变量分层与主题解耦架构
为实现“一套规范、无缝扩充多套主题”，确立变量表（`vars`）与语义代号（`colors`）两层映射规范：

```json
{
  "name": "dark",
  "vars": {
    "accent": "#febc38",
    "blue": "#178fb9",
    "lightBlue": "#9cdcfe",
    "green": "#89d281",
    "red": "#fc3a4b",
    "yellow": "#e4c00f",
    "gray": "#777d88",
    "dimGray": "#5f6673",
    "darkGray": "#3d424a",
    "charcoal": "#221d1a"
  },
  "colors": {
    "accent": "accent",
    "border": "blue",
    "success": "green",
    "error": "red",
    "warning": "yellow",
    "muted": "gray",
    "dim": "dimGray",
    "text": "#d4d4d4",
    "thinkingText": "gray",
    "userMessageText": "#ffffff",
    "userMessageBg": "charcoal",
    "toolTitle": "text",
    "toolOutput": "gray",
    "filename": "lightBlue",
    "command": "yellow",
    "commandArg": "text",
    "diffAdded": "green",
    "diffRemoved": "red",
    "diffContext": "gray",
    "syntaxKeyword": "#569cd6",
    "syntaxFunction": "#dcdcaa",
    "syntaxString": "#ce9178",
    "syntaxNumber": "#b5cea8",
    "syntaxComment": "#6a9955"
  }
}
```

### 3.2 24 位真彩色（TrueColor）与下采样算法
传统 256 色下采样公式因颜色立方体分段粗糙，将暖炭黑 `#221d1a` 错误映射至青蓝色块（Color 59），导致用户气泡呈现刺眼的蓝色色带。
本引擎确立如下色彩编解码规则：
1. **TrueColor 优先**：若环境检测到 `WT_SESSION`、`COLORTERM=truecolor|24bit` 或现代终端程序，直接输出 24 位真彩色 SGR 序列：
   $$\text{ESC}[38;2;R;G;Bm \quad (\text{前景色}), \quad \text{ESC}[48;2;R;G;Bm \quad (\text{背景色})$$
2. **三原色精确解析**：解析十六进制色值至 RGB 分量，确保 `#221d1a` 呈现纯正、柔和的暗色黑巧色背景，突出用户输入气泡；
3. **前景语义分工表**：

| 语义角色 | 色值代号 | 视觉含义 |
|---|---|---|
| 用户输入正文 | `userMessageText` | `#ffffff` 高对比纯白，配合温润气泡背景 |
| 用户输入边轨 | `accent` | `#febc38` 暖金色左侧强调竖条 |
| 模型助手回答 | `assistantText` | `#d4d4d4` 清晰纯净的浅灰白 |
| 思考推演过程 | `thinkingText` | `#777d88` 低对比度中灰，折叠呈现 |
| 工具卡片标题 | `toolTitle` | `#d4d4d4` 加粗清晰标题 |
| 命令执行输出 | `toolOutput` | `#777d88` 柔和暗调灰色，不喧宾夺主 |
| 文件路径与名称 | `filename` | `#9cdcfe` 明朗天蓝，形成全局视觉锚点 |
| 命令主程序名 | `command` | `#e4c00f` 明亮金黄，清晰标识调用动作 |
| 差异新增内容 | `diffAdded` | `#89d281` 鲜明柔和绿色 |
| 差异删除内容 | `diffRemoved` | `#fc3a4b` 清晰警示红色 |
| 差异上下文 | `diffContext` | `#777d88` 弱化中灰 |

### 3.3 命令语法词元化着色器（Command Tokenizer）
在展示执行的 Shell 命令时，杜绝单一白色文本，引入基于词法模式的高亮处理器：
- **可执行文件**（命令首词或管道符后首词）：渲染为黄色 `command`；
- **命令行选项与参数开关**（`-`、`--` 起始词元）：渲染为天蓝 `syntaxKeyword`；
- **文件路径**（包含 `/` 或文件扩展名）：渲染为天蓝 `filename`；
- **字符串字面量**（单/双引号包裹）：渲染为暖棕 `syntaxString`；
- **控制操作符**（`|`、`&&`、`||`、`;`、`>`、`>>`）：渲染为金色 `accent`；
- **普通参数值**：渲染为纯白 `commandArg`。

---

## 四、 代码编辑差异渲染流水线

### 4.1 差异生产与传递规范
在代码修改工具（`edit`）执行成功后，工具底层读取原始内容（`original`）与修改后内容（`finalContent`），利用 Myers 差分算法计算并封装标准 Unified Diff 文本块：

````text
Edited src/app.ts

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,3 @@
 context line
-const oldVar = 1;
+const newVar = 2;
 context line
```
````

### 4.2 差异提取与块结构提升（Diff Hoisting）
工具卡片管理器（`ToolCards`）在接收到完成事件与输出文本时，自动调用 `splitFencedDiff`：
1. 识别并提取围栏内的 Unified Diff 片段，挂载至数据块的 `block.diff` 属性；
2. 剔除正文中的原始围栏代码块，避免大段未经渲染的文本充斥终端；
3. 渲染器检测到 `block.diff` 时，派发至专用 `renderDiff` 引擎，输出带有 `+`/`-` 标识、绿红背景高亮及行内字符级反差强化的差异视图。

---

## 五、 实施计划与验证标准

1. **会话管理**：
   - 修复 `overlay.ts` 中的 `Ctrl+D` 与 `Ctrl+R` 交互，实现纯 TUI 内部状态机驱动；
   - 在 `sessionPromptBarrier.ts` 与 `sessionCreation.ts` 中打通首提示词标题自动派生，彻底消灭列表中的裸 Session ID。
2. **视口纯净化**：
   - 移除 `frameSurface.ts` 中的伪字符滚动条，维持全宽文字阅读体验；
   - 验证 `Ctrl+End` 快速回底功能在长对话中精准生效。
3. **配色全面升级**：
   - 部署包含 `vars` 解析与真彩色转换的 `dark.json` / `light.json` 主题配置；
   - 在 `blocks.ts` 与 `toolCards.ts` 中完成思考文本、工具输出、命令语法分段与文件路径色彩注入。
4. **差异展示闭环**：
   - 扩展 `registry.ts` 中 `edit` 工具返回值，追加标准差异块；
   - 验证编辑后工具卡片展开时直观呈现红绿变更对比。
