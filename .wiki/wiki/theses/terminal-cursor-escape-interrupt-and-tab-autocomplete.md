# 终端光标精准定位、DECAWM 防撕裂、Escape 取消与 Tab 补全架构论著 (Terminal Cursor, Escape Interrupt & Tab Autocomplete Architecture)

## 1. 调研背景与问题根因

在终端交互（TUI）体系中，光标漂移、框体被破坏、Tab 键插入空白字符以及快捷键职责倒置是终端应用最常见的四大体验暗礁：

```mermaid
flowchart TD
    subgraph ProblemFlow["四大终端渲染与交互暗礁"]
        P1["暗礁 1: 终端自动换行 (DECAWM 开启)<br/>- 行尾溢出 1 字符导致终端强制向下走一行，造成整屏'阶梯状'撕裂"]
        P2["暗礁 2: 硬件光标未定位<br/>- 差分刷屏后硬件光标留在右下角，打字时引起光标全屏乱跑"]
        P3["暗礁 3: Tab 键未拦截<br/>- ASCII 9 (\\t) 未被拦截，作为字面量插入并展开为 8 空格，打乱宽度计算"]
        P4["暗礁 4: Ctrl+C 错配为取消键<br/>- 误杀进程，违反 Escape 取消 / Ctrl+C 清空草稿的现代工业级交互阶梯"]
    end
```

---

## 2. 核心机制与算法模型

### 一、 硬件光标绝对定位与 DECAWM 防撕裂刷屏框架
每次差分绘制必须在严密的终端协议帧保护下执行：
1. **`PAINT_START` (`\x1b[?25l\x1b[?2026h\x1b[?7l`)**：
   - `\x1b[?25l`：隐藏硬件光标，防止重绘期间光标闪烁。
   - `\x1b[?2026h`：开启 DEC 2026 同步输出，通知终端仿真器原子缓冲。
   - `\x1b[?7l`：**关键核心！禁用终端自动折行（DECAWM Disable）**，即使写入满列字符也不会触发隐式换行。
2. **绝对行重写**：每行以 `\x1b[${row};1H\x1b[2K${line}` 绝对行寻址重绘，不依赖相对换行 `\n`。
3. **`PAINT_END` 与硬件光标钉扎**：
   - 提取输入框在当前视口中的绝对物理坐标 `(cursorRow, cursorCol)`。
   - 发送 `\x1b[?7h\x1b[?2026l` 恢复自动换行与结束同步。
   - 发送 `\x1b[${cursorRow};${cursorCol}H\x1b[?25h` **将硬件光标精准钉在框内输入点**，并恢复可见。

---

## 3. Escape vs Ctrl+C 阶梯响应模型

```mermaid
graph TD
    subgraph EscapeHierarchy["Escape 取消响应阶梯 (app.interrupt)"]
        E1["1. 存在打开的 Autocomplete 浮窗? -> 仅关闭浮窗，保留已输入文本"]
        E2["2. 存在正在执行的工具/大模型生成? -> 发送 AbortSignal 中断执行，不退出程序"]
        E3["3. 空闲输入状态? -> 保留草稿，不执行破坏性清空"]
    end

    subgraph CtrlCHierarchy["Ctrl+C 清空与退出阶梯 (app.clear)"]
        C1["1. 单击 Ctrl+C -> 清空当前输入框内的草稿文本 (clearEditor)"]
        C2["2. 500ms 内连按两次 Ctrl+C (或按 Ctrl+D) -> 触发优雅退出并输出 Resume 提示"]
    end
```

---

## 4. Tab 自动补全拦截与字符净化

1. **绝对禁绝 `\t` 录入**：
   - 在按键捕获流中，`\t`（ASCII 9）作为保留功能键拦截。
   - 在粘贴流中，所有 `\t` 自动展开为 2 个标准空格，保证 `visibleWidth` 几何列宽 100% 恒定。
2. **Tab 补全流转**：
   - 当 Slash 浮窗可见时：按 `Tab` 选中高亮项并完成自动补全上屏。
   - 当 Slash 浮窗关闭且文本以 `/` 开头时：按 `Tab` 强制呼出建议浮窗。
