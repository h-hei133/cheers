# 待办与已知限制

## TUI 未实现项（明确决定不做或延后）

1. **多路复用器 resize 锚点探测**
   tmux / screen 在宽度变化后会重排整个窗格，锚点随之失效。参考实现借用备用屏并发起 CPR（`CSI 6n`）往返来精确恢复锚点。
   当前实现改为「宽度变化即重建」：清屏 + 清回滚 + 重放已定稿账本。语义正确，代价是回滚被重写，且会丢失本会话之前的终端内容。
   若要改为非破坏式，需要引入 CPR 往返与探测超时回退。

2. **内联图像与 OSC 66**
   未实现。原生回滚已提供滚轮回看与框选复制，因此鼠标上报协议也未启用。

3. **Markdown 表格与深层嵌套列表**
   `transcript/markdown.ts` 覆盖标题、无序/有序列表、引用、水平线、行内强调/代码/链接、围栏代码块。
   表格与三层以上嵌套列表按纯文本呈现。

4. **补全仅覆盖 slash 命令**
   `chrome/suggestions.ts` 的候选模型是通用的，但目前只接了命令注册表。文件路径、`@` 引用、历史补全尚未接入。

## 仓库既有失败项（本轮未触碰）

全量 `vitest run` 存在与 TUI 无关的既有失败（browser harness、MCP 网关、orchestration、session 持久化等）。
本轮改动涉及的套件（presentation、cli/interactive、renderer、core/shell、entrypoints、core/commands、observability）需保持全绿。
