# Problem & Solutions Ledger

## 问题 1：启动 CLI 进入交互模式前，原终端泄漏冗余启动文本
- **现状与现象**：在进入 Alt-Screen 全屏页面前，终端控制台输出了类似 `Private Coding Agents Shell - Project: coding-agents - Project root: /home/wang/projects/coding-agents` 的多行冗长日志，破坏了启动时的干净视觉。
- **用户期望**：进入 CLI 之后保持极简干净，不需要打印大量启动元数据；进入终端画布后只需要简要提示当前工作目录（CWD）和当前模型（Model）即可。
- **OMP 对标与解决方案**：
  1. 屏蔽/静默 `entrypoints/cliRuntimeInvocation.ts` 及 CLI 顶层打印的冗余 ASCII banner 和 debug 信息。
  2. 在全屏 Alt-Screen 顶部或 Welcome 区域渲染一个极简、紧凑的 Welcome Header（仅展示当前项目目录和当前已连接模型）。

---

## 问题 2：终端头部状态固定硬编码 `[Claude Mode │ claude-3.5-sonnet]`，缺少完整包围框及底部状态栏
- **现状与现象**：
  - 顶部分割线芯片写死了 `claude-3.5-sonnet` 和 `Claude Mode`。
  - 只有一条孤立的顶部横线，未形成完整的全封闭圆角边框（Box Composer）或真正的上下双向规范框。
  - 缺乏底部完整的状态信息组（当前模型名称、当前目录、当前 Git 分支、Context 窗口使用率与百分比）。
- **OMP 对标与解决方案**：
  1. 对标 OMP 的 `box.ts` / `composer` 机制：实现圆角双线外框（`╭─ ... ╮` / `╰─ ... ╯`），将输入提示符 `❯ ` 完整包裹在框内。
  2. 动态读取当前 Session 的实际配置：模型名称（如从 `runtimeConfig.providerCredentials` 或 active model 读取）、当前工作目录、真实 Git 分支（`gitBranch`）、动态计算的上下文 Token 占用（`kUsed/kTotal (percent%)`）。
  3. 彻底移除 `Claude Mode` 等固定写死的外部特化标签，将真实状态条（`statusLine.ts`）嵌入到底部横线或底部状态槽中。

---

## 问题 3：缺少 Slash 命令的实时交互式提示与自动补全浮窗
- **现状与现象**：在输入框中输入 `/` 符号时，终端没有任何反应，必须手动盲打全部命令，缺少现代 Coding Agent 标配的命令联想提示浮窗。
- **OMP 对标与解决方案**：
  1. 对标 OMP 的 `autocomplete.ts`：实现 Slash 命令实时匹配器（`findLeadingSlashCommandStart`）。
  2. 当输入文本以 `/` 开头时，自动过滤内置 Slash 命令列表（如 `/help`, `/model`, `/compact`, `/cost`, `/context`, `/undo`, `/clear`, `/exit` 等），并计算匹配项。
  3. 通过 2D 视口合成器（`compositor.ts`）在输入框上方/下方弹出悬浮的 Command Picker 菜单，支持上下箭头选择并按 Tab/Enter 自动补全。
