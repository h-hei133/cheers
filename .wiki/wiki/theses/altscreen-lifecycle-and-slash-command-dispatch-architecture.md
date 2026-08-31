# 全屏备用画布生命周期与命令分发调度架构论著 (AltScreen Lifecycle & Slash Command Dispatch Architecture)

## 1. 架构缺陷根因剖析

通过对终端底层执行流与按键分发状态机的代码级全链路穿透，查明了两大核心痛点的根本原因：
1. **AltScreen 丢失**：`InteractiveMode.start()` 漏调了 `altScreen.enter()`，导致 TUI 差分帧直接刷在主终端上。
2. **Slash 命令回车死锁**：`InputController` 在检测到补全处于激活状态时，错误地在 `event.keyId === "enter"` 时拦截了按键，仅仅重置了编辑器字符串，而没有向下分发给 `onSubmit`，导致所有 Slash 命令在按回车后被静默吞噬。

---

## 2. 核心算法模型与方案解构

```mermaid
flowchart TD
    subgraph StdinStream["1. 键盘事件流 (Raw Stdin)"]
        Key["按键事件 (ParsedKeyEvent)"]
    end

    subgraph ControllerLadder["2. 按键分发阶梯 (InputController)"]
        Key -->|"Tab 键"| ApplyCompletion["应用补全 (editor.setText + trailing space) -> 关闭补全浮窗"]
        Key -->|"Escape 键"| Dismiss["关闭补全浮窗 -> 保留输入草稿"]
        Key -->|"Enter 键"| Submit["提交当前命令/Prompt -> onSubmit(text)"]
        Key -->|"Up / Down"| Navigate["浮窗激活: 切换高亮项 / 浮窗关闭: 翻阅历史"]
    end

    subgraph CommandExecution["3. 命令执行与转录 (Execution Pipeline)"]
        Submit --> Router["routeInteractiveCommand(text)"]
        Router --> Capture["capturingRenderer (收集命令输出文本)"]
        Capture --> Transcript["transcript.appendCommandResult(cmd, output)"]
        Transcript --> Redraw["tui.requestRender() (原子差分重绘上屏)"]
    end

    subgraph ScreenLifecycle["4. 终端屏幕隔离 (AltScreen Lifecycle)"]
        Start["InteractiveMode.start()"] --> EnterAlt["altScreen.enter() (\\x1b[?1049h\\x1b[2J\\x1b[H)"]
        Stop["InteractiveMode.stop()"] --> LeaveAlt["altScreen.leave() (\\x1b[?1049l) + 输出 Resume 提示"]
    end
```

---

## 3. 结论

通过修复 AltScreen 启动门禁与解除 InputController 对 Enter 键的错误拦截，所有 Slash 命令与全新独立页面将真正恢复 100% 工业级响应！
