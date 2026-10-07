---
title: "18：输入框、Slash 命令、启动耗时与首轮上下文研究与方案设计"
category: article
sources: [user-experience-report-2026-10-05, 14-user-experience-research.md, current-source-28ff98ce, pi, oh-my-pi, codex]
created: 2026-10-05
updated: 2026-10-05
tags: [research, tui, editor, slash-commands, startup, timings, context, token-accounting, subcommands]
summary: "针对短单行粘贴光标视觉残影、/res 候选 Enter 无法补全、裸 / 别名膨胀（117 项）、npm start 启动慢（2.5-5.4s）与 /timings 盲区、首轮对话约 5.4k 上下文构成、以及 /goal 空格后子命令参数选项无描述与易碎交互，区分已证实源码缺陷、历史探针与未复现现象，并结合 pi、oh-my-pi、codex 提出 Phase 19 待施工设计。"
confidence: high
---

# 18：输入框、Slash 命令、启动耗时与首轮上下文研究与方案设计

## 1. 范围与目标

本研究基于用户反馈及 [14：交互体验、工具成熟度与上下文来源研究](14-user-experience-research.md) 的现状梳理，聚焦用户提出的 6 个核心交互与性能问题进行深入机理剖析、参考项目对比和具体方案设计：
1. **短单行粘贴光标视觉残影**：输入 `Hello` 等短单行文本时，硬件光标处出现前一个字符的视觉重影（如 `He│llo` 误读为 `Heello`），正常逐字输入不出现。
2. **Slash 命令前缀输入后 Enter 不补全**：输入 `/res` 显示候选，但按 Enter 发送未补全的原字符串 `/res`（导致未知命令错误）。
3. **裸 `/` 候选列表别名过度膨胀**：58 个调度命令加 UI 专用 `/back`，再展开 58 个别名形成 117 行候选，列表信息噪声极大。
4. **`npm start` 启动耗时偏长（2.5–5.4s）且 `/timings` 存在大范围盲区**：内部计时仅覆盖 52–768ms，无法解释真实体感延迟。
5. **首次“你好”后状态栏显示约 5.4k 上下文**：按字符估算分解出站 Payload 构成（非 tokenizer 实测），解答 `AGENTS.md` 是否为主要根因及削减策略。
6. **Slash 命令后续参数选项（Subcommand Options）缺乏描述且交互易碎**：输入 `/goal ` 后虽展示子命令名，但缺乏任何描述（`detail` 为空），打错字符立即关窗，且与用户预期的 `set/resume/drop/...` 存在词表代差。

本轮仅修订研究与设计文档，不修改产品源码与配置。现状以本次源码复核为准；doc 14 的实测数字保留为历史样本。下述设计均待 Phase 19 施工与验收，决策汇总见 [Phase 19 决策](phase-19-decisions.md)。

---

## 2. 相对 doc 14 的证据增量与边界

[doc 14](14-user-experience-research.md) 对未知原因和测量口径的保留是正确的。本次审查补充源码证据，并撤回本研究初版超出证据的确定性解释：

1. **粘贴与光标**：内存探针证明样本没有重复插入，不能证明终端像素没有残影。源码确认 regular 正常界面未统一剥离 `CURSOR_MARKER`，也未把编辑器 caret 映射到该模式的光标账本；尚未证明这是用户 Windows Terminal 现象的根因。
2. **Slash 交互**：`selected=0` 的视觉高亮与 `chosen=moved` 的接受条件不一致；`/res` 会直接提交草稿，而且当前排序首项是 `/reset`。必须分别处理候选接受、排序和完整命令执行，不能用补全动作触发新会话。
3. **启动计时**：现有起点不是进程零点，最后打点也不是交互首帧。静态 import 的书写行号不能用于分配依赖图求值耗时；npm、转译、文件系统、TUI 各占多少仍需分段测量。
4. **上下文**：状态栏取最近一次影响上下文的请求经归一化后的 `lastPromptTokens`。doc 14 的字符估算样本为约 6,397，与用户真实约 5.4k 并非同一个账本；不得将字符估算分项除以真实 5.4k 得到占比。

## 3. 问题一：短单行粘贴光标视觉残影

### 3.1 现象与源码机理分析

用户反馈：在 WSL Ubuntu 下，使用 Windows 终端粘贴短单行文本（如 `Hello`），硬件光标所在位置看起来像复制了前一个字符（例如 `He│llo` 看起来像 `Heello`）。普通逐字敲击不出现。

深入排查渲染与输入管道：
1. **输入阶段（`stdinBuffer.ts`）**：
   终端在开启 Bracketed Paste Mode 后，粘贴 `Hello` 会发送 `\x1b[200~Hello\x1b[201~`。[stdinBuffer.ts](../../packages/ts-shell/src/presentation/tui/input/stdinBuffer.ts#L160) 的 `consumePaste()` 能够正确识别起止标记，并以原子单次触发 `pasteListeners`。由于文本长度远低于 320 字符阈值，[interactiveMode.ts](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L358) 直接调用 `editor.insert("Hello")`，并调用 `tui.requestRender()`。在底层字符串数据模型中，文本严格为 `Hello`，无冗余字符。
2. **光标定位与标记（`editor.ts` 与 `paint.ts`）**：
   Cheers 的编辑器采用 **纯硬件光标** 策略。在 [editor.ts](../../packages/ts-shell/src/presentation/tui/editor.ts#L462) 中：
   ```typescript
   rendered[caret.index] = `${head}${CURSOR_MARKER}${text.slice(head.length)}`;
   ```
   它在插入点嵌入了一个零宽转义序列 `CURSOR_MARKER = "\x1b_c\x07"`（APC 序列）。
   在全屏渲染 [paint.ts](../../packages/ts-shell/src/presentation/tui/render/paint.ts#L65) 中，`prepareRows` 将 `CURSOR_MARKER` 剥离，输出给终端的字符是纯净的 `╰─ Hello`；然后 `cursorTarget` 计算出 marker 处的绝对屏幕列号，并在帧末尾通过 `cursorPaint` 写入 `\x1b[row;colH\x1b[?25h` 将硬件光标放置在该处。
3. **已确认并修复的 regular 模式缺陷**：
   [engine.ts](../../packages/ts-shell/src/presentation/tui/render/engine.ts) 将 regular 正常界面交给 [mainScreen.ts](../../packages/ts-shell/src/presentation/tui/render/mainScreen.ts)。原路径没有消费内部 marker 或保存编辑器 caret 的相对行。Phase 19 现已复用共享行准备和帧控制，只处理新增及可见行，并把可见 caret 接入原 scrollback、重绘、暂停与恢复账本。regular 中的 fullscreen overlay 继续使用原全屏分支；验证与尚缺的实机证据见 §3.5。
4. **尚未归因的用户现象**：
   Windows Terminal 字体、光标形状、栅格化和刷新时序均可作为对照变量；本仓源码不能证明 DirectWrite、glyph overhang 或双缓冲行为导致了本次像素残影。`WT_SESSION` 当前已被 [terminalCapabilities.ts](../../packages/ts-shell/src/presentation/tui/terminalCapabilities.ts#L32) 用作 DEC 2026 同步输出能力条件，因此“默认打开同步即可修好”也没有证据。

### 3.2 参考项目对比：pi 的软件光标机制

参考只读项目 pi 在 [editor.ts](../../../pi/packages/tui/src/components/editor.ts#L566-L604) 中的实现，其采用了截然不同的 **软件光标（Software Cursor）** 方案：
```typescript
// pi: packages/tui/src/components/editor.ts
if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {
    const before = displayText.slice(0, layoutLine.cursorPos);
    const after = displayText.slice(layoutLine.cursorPos);
    const marker = emitCursorMarker ? CURSOR_MARKER : "";

    if (after.length > 0) {
        // 光标落在字符上：提取该字符（grapheme），用反色显示替换它
        const afterGraphemes = [...this.segment(after, "grapheme")];
        const firstGrapheme = afterGraphemes[0]?.segment || "";
        const restAfter = after.slice(firstGrapheme.length);
        const cursor = `\x1b[7m${firstGrapheme}\x1b[0m`;
        displayText = before + marker + cursor + restAfter;
    } else {
        // 光标在行末：追加反色空格
        const cursor = "\x1b[7m \x1b[0m";
        displayText = before + marker + cursor;
    }
}
```
**pi 的可借鉴决定**：
1. 光标覆盖已有字素时，通过反色样式保留该字素的宽度；行末则追加一个反色空格，占一列，并相应调整 padding，不能笼统声称所有位置恒宽。
2. 软件光标可使可见光标样式由应用控制；硬件 caret 仍需服务 IME 定位。它是可比较的显示方案，不是本次 Windows Terminal 残影已被消除的证据。

### 3.3 区分性验证方案

为了区分用户特定终端环境下的残影原因，应制定如下区分性黑盒与白盒录制方案：
1. **输入与 PTY 字节录制（Raw Bytes）**：
   使用探针挂载 `process.stdin` 与 `process.stdout`，分别录制普通键盘敲入 `Hello` 与剪贴板粘贴 `Hello` 下发的所有原始字节。重点核验是否存在多余控制码或局部 Echo。
2. **终端能力隔离测试（Sync & Cursor）**：
   - 设置 `TSSHELL_TUI_SYNC=1` 强制开启 DEC 2026 同步输出，对比 `TSSHELL_TUI_SYNC=0` 关闭同步输出下的渲染帧；
   - 切换 Windows Terminal 光标样式：分别测试 `bar`（竖线）、`vintage`（下划线）、`block`（方块），核实是否仅在特定光标形状下产生视觉混叠。
3. **显示模式对照**：
   对比 `tuiMode: "fullscreen"` 与 `tuiMode: "regular"`，分别验证 marker 是否泄漏、caret 定位是否准确及像素现象是否复现，三项结果独立记录。

### 3.4 改造方案设计（账本修复已实施，实机对照待验收）

1. **先修复内部 marker 与 caret 账本**：regular 主屏路径必须消费内部 marker，并把 caret 映射到其相对行、scrollback、重绘、暂停/恢复流程。不能直接搬入 fullscreen 的绝对 `cursorPaint` 调用，否则可能破坏主屏行账本。两种模式和 overlay 都应证明终端字节不包含内部 marker。
2. **再比较软件光标**：作为终端兼容性候选方案评估；需覆盖行末新增 cell、CJK/emoji 字素、换行、选区和 IME 定位。只有真实终端前后对照才能证明用户现象改善。
3. **保留能力判断**：沿用已存在的同步输出能力判定和显式开关，用开启/关闭对照定位问题，不把无能力终端一律强制开启。

### 3.5 Phase 19 实施证据

- regular 只在可见内容和裁剪后的 chrome 中寻找 caret，通过原相对移动函数定位并保存实际光标行；移除全部 marker，关闭行样式和 hyperlink，绘制期间禁用 autowrap，帧结束恢复。无 caret 时隐藏光标，退出和外部程序交接恢复显示。
- 组合 8 文件/234 项通过；最终性能修正后两份 renderer 套件由独立审查重跑，67 项通过。三组反转分别撤回 marker 剥除、caret 定位和最终行账本，均触发行为断言，隔离源码副本逐字节恢复。单元屏幕替身只覆盖所需控制序列，不代表完整终端 reflow。
- 实际 Node 20.3 构建 CLI 在 regular/fullscreen 的 VT 屏幕中验证普通输入、中间粘贴、分片中文粘贴、宽字素 caret、窗口缩小/放大、满行末列及历史追加后输入，原始输出不含内部 marker。主题重绘后成功 reload 结果仍可见，继续输入时 caret 正确；这为先前原始输出顺序异常补充了屏幕证据，不证明所有历史重排均正确。
- 独立代码审查发现首版每帧准备全部历史行的性能回归。改为只准备新增和可见行后，同一万行样式文本的无 I/O 探针由约 236 ms/帧降至 0.61 ms/帧；该数字不含真实终端或完整布局开销。
- 本批没有 Windows Terminal 逐帧像素录制、字体/光标形状对照或真实 IME 证据，不能据 Linux PTY 字节和 VT 屏幕推断用户现场残影根因已解决。regular 的终端历史 reflow 仍由终端处理。

## 4. 问题二与问题三：Slash 候选 Enter 补全与别名膨胀治理

### 4.1 现象与源码机理分析

用户反馈：
1. 键入 `/res`，候选中出现了 `/resume`，但按 Enter 键却直接发送了未补全的 `/res`，系统报错命令不存在；
2. 仅键入一个裸 `/`，弹出了 117 行候选（包含所有 alias），滚动负担极重。

#### 4.1.1 Enter 不补全机理分析
定位到 [suggestions.ts](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L78) 与 [keymap.ts](../../packages/ts-shell/src/cli/interactive/keymap.ts#L380)：
- 在 `SuggestionList` 中：
  ```typescript
  // suggestions.ts
  private selected = 0;
  private moved = false;
  get chosen(): boolean { return this.moved; }
  ```
- 在渲染器 [suggestions.ts#L158](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L158) 中：
  ```typescript
  const marker = active ? defaultTheme.fg("accent", "❯") : " ";
  const label = active ? defaultTheme.bold(item.label) : item.label;
  return active ? `${defaultTheme.bgOpen("selectedBg")}${...}` : ...;
  ```
  只要列表不为空，首项（索引 0）**在视觉上永远带有 `❯` 指针、加粗字体和选中背景色（`selectedBg`）**。
- 但在键盘处理器 [keymap.ts#L383](../../packages/ts-shell/src/cli/interactive/keymap.ts#L383) 中：
  ```typescript
  const accepts = action === "tui.input.tab" ||
    (action === "tui.input.submit" && view.suggestions.chosen);
  ```
  `Tab` 键无论是否移动过光标都会接受；而 `Enter`（`tui.input.submit`）要求 `view.suggestions.chosen` 为真，也就是必须 `moved === true`！
  用户看到第 1 项已经高亮，下意识按下 Enter，但因为没有先按 Down/Up 键，`chosen` 为 `false`，代码直接跳过补全分支，流转到 `submitDraft`，将原始未完成的 `/res` 直接送入执行引擎。
- 此外，在前缀匹配中，输入 `/res` 时，[matchSuggestions](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L49) 按照 `Tier.Prefix + (100 - Math.min(99, label.length))` 计分，由于 `/reset` 长度为 6，`/resume` 长度为 7，因此 `/reset` 排名高居第 1 位。即使 Enter 接受当前高亮，接受的也是 `/reset` 而非 `/resume`。

#### 4.1.2 裸 `/` 别名过度膨胀机理分析
定位到 [slashSuggestions.ts](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L18)：
```typescript
for (const command of listSlashCommands()) {
  for (const name of [command.name, ...(command.aliases ?? [])]) {
    suggestions.set(name, {
      value: `/${name}`,
      label: `/${name}`,
      detail: name === command.name ? detail : `${detail} (alias of /${command.name})`,
    });
  }
}
```
调度注册表有 58 个命令；交互投影额外加入 picker-only `/back`，形成 59 个 UI 主项，另有 58 个别名。无论用户输入的是裸 `/` 还是具体前缀，候选池直接预先生成了 117 项。在输入裸 `/` 时，`query` 为空，所有候选均获得相同的 `Tier.Prefix` 分数，导致 117 项全部呈现，且前几页充斥着各种别名。

### 4.2 既有 `keymap.test.ts` 契约冲突与历史设计意图

在 [keymap.test.ts](../../packages/ts-shell/src/cli/interactive/keymap.test.ts#L281) 中存在如下测试：
```typescript
it("submits on enter when no candidate was chosen", () => {
  // Typing a whole command must send on the first Enter; requiring a second
  // press because a menu happens to be open is the bug this guards.
  const { press, surface, actions } = build();
  for (const char of "/help") press(char);
  surface.suggestions.setItems([{ value: "/help", label: "/help" }]);
  surface.setSuggesting(true);
  press("\r");
  expect(actions.submit).toHaveBeenCalledWith("/help");
});
```
原作者编写此断言的意图是：**如果用户已经输入了完整的有效命令（如 `/help`），即便此时联想菜单刚好弹出了 `/help`，用户按 Enter 也应当立即执行该命令，而不是必须按两次 Enter（第一次补全、第二次发送）**。
现有实现以 `moved` 作为候选接受依据：
- 如果没有按过上下方向键，不管是输完了 `/help` 还是只输了一半的 `/res`，一律判定为未选，直接提交原始草稿；
- 这直接牺牲了未输完前缀时的 Enter 补全能力。

### 4.3 参考项目对比

1. **Codex（`codex-rs/tui/src/bottom_pane/command_popup.rs`）**：
   - **空过滤器隐藏别名**（L149–L156）：
     ```rust
     if filter.is_empty() {
         for command in self.commands.iter() {
             if matches!(command, CommandItem::Builtin(cmd) if ALIAS_COMMANDS.contains(cmd)) {
                 continue; // 空查询时，别名直接不展示！
             }
             out.push((command.clone(), None));
         }
         return out;
     }
     ```
     只有用户输入非空字符（如 `/sess`）时，别名才参与匹配，并在匹配项中指示主命令。
   - **Enter 接受语义**（`slash_input.rs#L345`）：
     当弹出菜单有选中项时，按 Enter 键直接执行/应用选中的命令（`complete_selected_slash_command...`）。
2. **pi（`packages/tui/src/components/editor.ts`）**：
   - 当联想菜单打开时，Enter 键（`tui.select.confirm`）统一接受当前高亮项；对于 Slash 命令，完成参数替换后直接提交或留在输入框等待输入参数。
3. **oh-my-pi（`packages/tui/src/components/editor.ts#L1934`）**：
   - 当在 Slash 命令上下文按下 Enter 时，自动获取 `getSelectedItem()`，应用补全并执行。

### 4.4 Phase 19 交互决定（待施工）

本方案采用参考项目的高亮项接受和空查询别名收敛，但不采用候选接受后立即执行的策略：Cheers 的 `/reset` 等候选会改变会话，排序或前缀命中不足以表达执行意图。补全只修改草稿；执行必须由用户对一条完整合法调用显式提交。契约与完整编辑范围定义以 [23 §4](23-command-argument-options.md#4-统一语法与补全契约待施工) 为准。

| 输入和按键 | 目标行为 |
|---|---|
| 完整合法 `/help` + Enter | 直接提交一次，保持现有单次 Enter 契约 |
| 不完整 `/res` + Enter | 接受当前高亮项到草稿，本次不执行；当前首项 `/reset` 会新建会话并清除当前 transcript，不能因前缀命中而误执行 |
| 任意候选 + Tab | 仅应用候选编辑，随后重算下一语法位置的选项 |
| 参数/文件候选 + Enter | 在候选接受上下文中只修改其编辑范围；不得套用命令名的执行逻辑 |
| 不完整或非法参数 + 显式提交 | 保留草稿，给出所属命令的合法语法和具体校验错误 |

- **空过滤**：裸 `/` 仅展示 59 个 UI 主项，别名保持可搜索和可执行。非空前缀检索别名，显示其归属；只有语义等价的候选才可去重。
- **原始调用语义**：保留 `rawCommandName` 与 invocation 形态；顶层 `/recall`、`/retain` 和 `/memory recall`、`/memory add` 当前并非可任意归一化的同一路由。
- **完整解析**：不能用 `draft.trim() === chosen.value` 判断命令是否可执行，也不能用 `getSlashCommand(newDraft.trim())` 解析包含参数的草稿。命令、参数、文件候选须有明确类型，按命令 owner 的语法判断合法性。
- **替换范围**：以原始草稿 UTF-16 半开区间 `[from,to)` 修改当前 token，保留前导空白、多级 token 和光标后 suffix。接受前校验 cursor、draftRevision、catalogRevision；异步旧结果不得应用。
- **排序**：精确合法主名/别名优先，其他前缀候选保持稳定排序；排序不得携带执行权限。helper 显示当前所选项的合法动态语法，无候选时显示明确的无匹配或不可用状态。

## 5. 问题四：启动耗时与 `/timings` 盲区治理

### 5.1 已有测量与可确认路径

doc 14 历史样本中，从 `npm start` 到终端出现输入框为 **2,482–5,378 ms**，内部 `/timings` total 为 **52–768 ms**。这是不同起止点的测量，不能用差值直接给 npm、tsx 或依赖求值分摊毫秒。

根目录 `start` 转发到工作区，后者通过 `tsx src/entrypoints/cli.tsx` 启动源码。可确认存在包装启动、运行时转译/依赖加载、bootstrap、交互初始化和渲染阶段；每个阶段耗时待测。本研究初版的“每进程 150–300ms”“包装链 800–1,200ms”“转译超过 2,500ms”没有对应分段证据，撤回。WSL2 使用 Linux 内核，不能描述为 Linux 内核模拟层。

### 5.2 施工前 `/timings` 的测量边界

施工前 [startupTiming.ts](../../packages/ts-shell/src/observability/startupTiming.ts) 的 `PROCESS_START` 是该模块求值时的 `Date.now()`，不是 OS 启动或 Node 进程零点。[cliProcessRunner.ts](../../packages/ts-shell/src/cli/bootstrap/cliProcessRunner.ts) 自身也导入此模块；仅凭 [cli.tsx](../../packages/ts-shell/src/entrypoints/cli.tsx) 的静态 import 书写次序，不能断言整棵依赖图耗时均排除在外。现已按 §5.5 改为运行时单调时钟。

现有 `arguments parsed`、`runtime bootstrapped`、`stdin captured`、`startup surface rendered` 标记不能表达输入框首帧已经绘制。`tui.start()` 在 [engine.ts](../../packages/ts-shell/src/presentation/tui/render/engine.ts#L141) 只安排渲染；在其返回后打点只能证明启动请求已发出，不能证明首次 paint/write 已完成，更不能证明终端像素已显示。

### 5.3 计时决定（已按 §5.5 施工）

1. 记录 `performance.timeOrigin` 或 `process.uptime()` 推导的进程时间基准；这仍不覆盖父 npm 包装进程的耗时。打点模块必须轻量。
2. 分别记录 bootstrap 完成、输入监听就绪、首次布局完成、首次终端写入完成。渲染完成事件由实际 paint/write 路径发出，并分别覆盖 regular/fullscreen。
3. 外部 PTY 从启动命令前计时，等真实启动提示符与可交互状态；单独记录终端可见首帧的观测口径。不能把 `terminal.write` 返回等同于用户已看见像素。
4. 更新检查只有在 trace 证明占据关键路径时才能归因；禁用计时的开销需测量，不承诺数学意义的零损耗。

### 5.4 固定环境基准矩阵

| 组别 | 启动方式 | 比较目的 |
|---|---|---|
| A | `npm start` | 用户实际开发入口 |
| B | 直接调用已安装的 tsx 二进制 | 排除两层 npm；不用 `npx` 引入额外包装/解析变量 |
| C | 直接运行现有预编译 JS 产物 | 比较转译与产物加载差异 |
| D | 现有 `build:exe` 产物 | 比较单文件分发入口；历史约 7 倍仅作线索 |

在同一主机、相同隔离配置、固定 provider 模式下重复采样，记录中位数、分位数及失败样本。应用临时缓存首次/重复使用与操作系统冷缓存分开；未经系统缓存控制不称 cold boot。与前序稳定提交对比时必须固定环境与起止事件。2026-10-07 矩阵见 §5.5。

### 5.5 UI-07 启动事件与入口矩阵（2026-10-07）

- 计时改用 `performance.now()` 的运行时单调起点，首个 modules-loaded 间隔包含计时模块求值之前的时间；父 npm/tsx 包装耗时仍归外部探针。每项同时给出距前事件间隔和进程累计时间，明确不是各模块独占 CPU 时间，系统墙钟跳变不改变间隔。
- 实际 terminal 安装 stdin listener/取得 raw mode 后报告 input ready；deferred input 在 enable 后才报告。首次有效布局由 render engine 报告；regular/fullscreen painter 均将首次 frame write 的回调交给设备，仅 stdout 成功回调报告完成。stop/restart 撤销旧 frame 观察，控制序列写入、排队 start、零尺寸和失败写入均不冒充首帧完成。输出流完成不等于终端像素可见。
- `CHEERS_TIMING` 未等于 `1` 时不采时钟、不安装观察回调。独立架构审查检出 engine 中条件表达式里的命名 callback 令函数数 20→21；回调归属和撤销移入 render owner 的 `startup.ts`，engine 恢复 20，无第二个绘制宿主。最终 Node 20.3 构建与 122 项通过，独立 APPROVE/CLEAR，反转与具体证据见 [主裁决 §8.100](phase-19-decisions.md#8100-ui-07启动计时的实际事件边界)。
- 实际 PTY 共 50 场：两种模式 × npm/tsx/JS/exe/关闭计时的 JS × 5 次；每组首次使用独立 TMPDIR，再复用该临时缓存四次，每场全新 HOME/项目/数据根。固定 synthetic/offline、120×60、同配置，50 场全部退出 0、配置不变、无模型 message。探针分别记录进程启动前→VT 提示符，以及输入探针文字出现在 composer；它不是 Windows 或真实前端像素证据。

| 入口 | regular 提示符中位数 / P95 ms | fullscreen 提示符中位数 / P95 ms | regular / fullscreen 输入回显中位数 ms |
|---|---:|---:|---:|
| npm start | 2121 / 2215 | 2088 / 2143 | 2164 / 2130 |
| 直接 tsx | 1550 / 1575 | 1552 / 1563 | 1594 / 1594 |
| 预编译 JS | 894 / 910 | 882 / 938 | 937 / 925 |
| 单文件 executable | 410 / 412 | 411 / 419 | 451 / 453 |
| JS，计时关闭 | 898 / 908 | 915 / 1006 | 940 / 959 |

- 表格仅重复缓存四场，P95 使用 nearest-rank（本样本量即最大值）；操作系统缓存未控制。关闭/开启计时样本重叠且顺序运行有噪声，不能据此宣称零开销或将负差当优化。该矩阵是当前入口对比，没有对前提交声称提速。证据 `.tmp/sm-642699446` 含首场、每次屏幕/记录及 summary。初轮失败分别是过长 TMPDIR 导致 tsx Unix socket 路径冲突、VT 夹具未处理 private DSR；缩短仓库内路径并补齐既有屏幕桩后重跑，无产品迁就。
- 实际请求上下文尺寸/来源账目见 §6.5，首帧计时与请求计量独立验证。

## 6. 问题五：首轮约 5.4k 上下文的口径与来源

### 6.1 状态栏口径

[sessionFacts.ts](../../packages/ts-shell/src/cli/interactive/sessionFacts.ts) 将存在且有限的非负 `usage.lastPromptTokens` 作为 `contextUsed`；缺失与显式零分开，压缩后等待新的请求测量。[usageTelemetry.ts](../../packages/ts-shell/src/observability/usageTelemetry.ts#L139) 对影响上下文的请求，将适配器归一化后的 prompt/cache read/cache write 用量汇总为该字段。

因此它表示**最近一次影响上下文的请求的归一化输入用量**，不是所有会话累计值，也不是按文件拆分的 tokenizer 账单。一轮中若产生多次 provider 请求，看到的是最近请求；不同 provider 的计数语义应由适配器归一化契约证明。

### 6.2 doc 14 历史 fixture 的字符估算

下表保留 doc 14 的隔离样本，不声称它就是用户实际 5.4k 请求。统一使用 `chars / 3.5`，整数作四舍五入：

| 历史样本部分 | 字符数 | 估算 tokens | 证据边界 |
|---|---:|---:|---|
| 根 `AGENTS.md` | 10,256 | 2,930 | 样本时文件大小，非当前仓库固定常数 |
| 指令包裹标签 | 103 | 29 | 与项目指令一起进入 system |
| 基础提示词 | 1,309 | 374 | 与当时 fixture 对应 |
| system 合计 | 11,668 | **3,334** | 从合计字符计算，分项取整存在舍入差 |
| 15 个工具 schema | 10,721 | **3,063** | 初版写成 2,200–2,500 不符合统一除数，已修正 |
| “你好” | 2 | 约 1 | 短中文文本尤其不宜据字符比推断精确 tokenizer 值 |
| 总计 | 22,391 | **约 6,397** | 不与真实约 5.4k 拟合，不计算其分项占比 |

[turn/prompt.ts](../../packages/ts-shell/src/turn/prompt.ts#L39) 还可纳入 skills、appended instructions、environment、history 等内容；不能声称所有真实首轮 payload 严格只有上述四类。工具 schema 也需在具体 provider 的序列化形态下统计。

### 6.3 可成立的结论与测量办法

`AGENTS.md` 和工具 schema 在历史 fixture 中均为主要体积来源；没有证据证明它们分别占真实 5.4k 的 54% 和 42%，也不能证明上游附加了提示词。

实施时以隔离 Mock Provider 截获最终出站 JSON，记录各段的精确字节数和字符数，并保存组装来源。精确 token 数需要目标 tokenizer 或 provider 的计数接口/usage，拦截 JSON 本身不能自动获得；若只能估算，必须展示估算算法与口径，不合并成精确账单。生产遥测只保留脱敏尺寸与分类，不输出原始指令或凭据。

### 6.4 优化决定（待施工与测量）

- **先可观测，再削减**：保留 `instructionBudgetBytes` 与 `--no-context-files` 的现有边界；不能为了匹配 5.4k 任意截断项目安全与架构规则。
- **工具选择保持能力完整**：先测 schema 冗余，再比较按需工具发现。初版“首轮仅留 read/edit/write/bash/glob”没有任务覆盖证据，不作为既定默认方案。
- **缓存如实呈现**：[anthropicMessages.ts](../../packages/ts-shell/src/provider/endpoints/anthropicMessages.ts#L147) 已有缓存标记能力，但是否命中受 provider、最小长度、TTL 和前缀稳定性影响。删除“第二轮必命中”和“降低 90% 以上”保证；上下文占用和账单优惠分开显示，只报告实际 usage 中存在的 cache read/write 数据。

### 6.5 UI-07 实际请求账目（2026-10-07）

- `/context` 从当前运行时的有效工具池测量 schema JSON 的 UTF-8 bytes 与 UTF-16 code units，估算沿用 code units / 3.5，当前工具池和最后已接受请求的工具片段各自显示。没有删减默认工具或指令来拟合历史 token 数。
- 主回合使用实际传给 fetch 的同一序列化字符串，HTTP 接受后只发布尺寸、协议/model/provider 标识和时间；五种已有协议自行声明 system/conversation/tools 字段。片段与 envelope 相加等于请求体，envelope 包含 JSON 键、分隔和其他设置；不包括 HTTP headers、传输帧或压缩。未知协议/不兼容结构只有总量，不推测分项。
- system 组装同时记录 base、project instructions、appended instructions、skills 和连接换行的原文尺寸；这是序列化前的来源，不与 wire 再相加。Provider usage 只关联同一前台请求，缓存输入按既有适配契约归一化；没有 tokenizer 时明确 unavailable，不按字符份额分配聚合 usage。共享子代理请求不覆盖前台收据。
- 收据属于现有 session usage 内存生命周期，不进入累计用量 snapshot；context-reset 清除，usage-gap 保留已接受收据但不借用上次请求用量。用户显式运行 `/context` 后，报告本身沿用已有语义报告持久化，不记录请求原文、指令正文、端点 URL 或 headers。
- 定向参考会话压缩后的用量新鲜度、host 收集有效状态再交给纯报告器的安排；保留本项目协议声明 owner，未引入第二个端点 dispatcher、usage registry 或 tokenizer。Node 20.3 构建和 180 项通过，三组有效反转/恢复后 33 项通过；两模式各两次本地 HTTP 请求逐项校验实际 wire bytes/code units、来源合计和 reported→unknown，100×60→40×18 reader 验证通过，配置未改、退出 0。详见 [主裁决 §8.101](phase-19-decisions.md#8101-ui-07实际请求与上下文来源账目)。

## 7. 问题、证据与施工决定汇总

| 问题 | 已确认 | 待施工或待验证 |
|---|---|---|
| 粘贴残影 | regular marker 消费与 caret 账本缺口 | 修复账本；Windows Terminal 像素根因仍需实机对照 |
| Slash Enter | 视觉高亮与 moved 接受条件不一致，`/res` 首项为 `/reset` | 补全只写草稿，完整合法命令才显式执行 |
| 裸 `/` 过密 | 58 dispatch + `/back` + 58 aliases = 117 UI 候选 | 空查询折叠别名，非空保留语义正确的检索 |
| 启动耗时 | 历史外部与内部起止点不同 | 分段计时与固定环境矩阵；无未经测量的耗时分摊 |
| 约 5.4k | 最近上下文请求归一化 usage | 来源账本；历史 chars/3.5 样本约 6,397 不拟合用户请求 |
| 参数补全 | 无描述、错误替换、连续联想中断 | 语法 owner、完整编辑区间、动态实体与真实预算 Goal 模式 |

## 8. 验证建议与本次边界

本次只修改 Markdown，未运行 build/tests/PTY/provider。后续实施必须验证：

1. regular/fullscreen/overlay 下 marker 不泄漏、caret 随滚动和暂停恢复准确；实机录制普通输入与 bracketed paste，区分字符串、ANSI 字节与像素证据。
2. `/help` 单 Enter、`/res` 接受后不执行 `/reset`、别名原始语义、补全不截断前后文；详细矩阵见 [23 §7](23-command-argument-options.md#7-实施验收标准)。
3. 以真实 first-paint/write 与可交互事件验证 `/timings`，重复启动矩阵后才能声称改进幅度。
4. 隔离 provider 捕获最终 payload 的精确字节并交叉验证 token 口径；无 tokenizer 时只给估算。

## 9. 问题六：Slash 命令后续参数选项（Subcommand Options）呈现机制与设计

> **本节是单命令（`/goal`）的实证样本**。该痛点实为**全仓横切**：58 条调度命令中 43 条声明 `argumentHint`；按实际有效语法分类有 44 条参数型命令，其中 26 条挂接补全 provider、18 条没有 provider。全量审计、逐命令目标词表与声明式设计见 [23：全命令参数与子命令选项](23-command-argument-options.md)。

### 9.1 当前现状深度剖析与源码链路验证

#### 9.1.1 实测探针表现与交互断层

本研究初版的隔离探针记录了以下 [slashSuggestions.ts](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts) 表现。本次只做源码复核，未重新执行探针；它描述的是当前轻量目标实现，不能作为新 Goal 模式已完成的证据：

| 用户输入草稿 | `slashSuggestions` 返回结果 | TUI 呈现行为与根因判定 |
|---|---|---|
| `/goal`（裸命令，无空格） | `[/goal, /objective (alias), /target (alias)]` | **符合预期**。命令尚未敲完或未敲空格时，联想浮层呈现的是命令候选与别名，详情行展示 `<goal instruction>` 语法提示。 |
| `/goal `（**带空格**） | `[pause, resume, complete, clear]` | **选项确实出现，但 detail 全为空**。候选项为 4 个纯文本标签，右侧描述完全空白，用户无法理解各项子命令职责。 |
| `/goal s` | `null` | **联想浮层瞬间关闭**。由于现有 4 个子命令无一以 `s` 开头，前缀匹配失败直接返回 `null`，导致浮层关闭。 |
| `/goal set` | `null` | **联想浮层关闭**。无匹配项，关闭浮层。 |

结合上述实测事实与源码追溯，当前 Cheers 的参数联想存在以下四大层面的结构性缺陷：

#### 9.1.2 源码链路一：子命令描述为空的根本原因（`detail` 丢失）

1. **注册表关联点**：
   在 [registry.ts](../../packages/ts-shell/src/core/commands/registry.ts#L522-L524) 中，`/goal` 命令通过 `subcommandCompletions` 挂接补全提供者：
   ```typescript
   argumentHint: "<goal instruction>",
   getArgumentCompletions: (prefix) => subcommandCompletions("goal", prefix),
   execute: (args, context) => runGoalCommand(args, context),
   ```
2. **硬编码字符串字典**：
   在 [argumentCompletions.ts](../../packages/ts-shell/src/core/commands/argumentCompletions.ts#L28-L54) 中，`SUBCOMMAND_VALUES` 将多条命令的子命令定义为纯字符串字面量数组：
   ```typescript
   goal: ["pause", "resume", "complete", "clear"],
   ```
3. **过滤与投影过程丢失上下文**：
   [argumentCompletions.ts#L59-L65](../../packages/ts-shell/src/core/commands/argumentCompletions.ts#L59-L65) 的 `subcommandCompletions` 调用 `prefixFilter`：
   ```typescript
   function prefixFilter(values: readonly string[], prefix: string, detail?: string): CommandArgumentCompletion[] {
     const lowered = prefix.toLowerCase();
     return values
       .filter((value) => value.toLowerCase().startsWith(lowered))
       .map((value) => ({ value, label: value, ...(detail ? { detail } : {}) }));
   }
   ```
   `subcommandCompletions("goal", prefix)` **完全没有向 `prefixFilter` 传入第三个参数 `detail`**！因此返回的 `CommandArgumentCompletion` 对象数组中，`detail` 恒为 `undefined`。
4. **UI 渲染器无字可绘**：
   在 [suggestions.ts](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts#L162) 中，虽然布局器支持在右侧渲染暗色 `detail`，但因字段为空，仅绘制了左侧粗体 `label`。用户看到的是 `pause`、`resume`、`complete`、`clear` 四个干瘪单词，没有任何用途说明。

#### 9.1.3 源码链路二：前缀容错极度脆弱（打错/打入未收录首字母即关窗）

当用户键入 `/goal s` 时，`prefixFilter` 遍历 `["pause", "resume", "complete", "clear"]`，没有任何项以 `"s"` 开头，因此 `matches.length === 0`。
`subcommandCompletions` 返回 `null`，导致 [slashSuggestions.ts](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L42) 的 `argumentSuggestions` 返回 `null`。
流转至 [interactiveMode.ts#L529](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L529)：
```typescript
const matches = fileSuggestions(...) ?? slashSuggestions(draft);
if (!matches) {
  this.view.setSuggesting(false);
  return;
}
```
TUI 立即关闭联想浮层（`setSuggesting(false)`）。用户本想输入 `set` 或 `show`，仅仅敲下第一个字母 `s`，浮层便瞬间闪退，没有任何“无匹配项”的友好提示或容错机制，体验非常生硬。

#### 9.1.4 源码链路三：子命令选中导致整行草稿被毁（缺少 `from` 起始偏移）

这是当前产品中隐藏极深的**破坏性 Bug**：
1. 在 [types.ts](../../packages/ts-shell/src/core/commands/types.ts#L163) 中：
   ```typescript
   export interface CommandArgumentCompletion {
     readonly value: string;
     readonly label: string;
     readonly detail?: string;
   }
   ```
   类型定义中根本没有 `from`（替换起始下标）字段。
2. 在 [slashSuggestions.ts#L35-L43](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts#L35-L43) 中：
   `argumentSuggestions` 在获取到 `values` 后直接以 `[...values]` 返回给上层，没有像 [fileSuggestions.ts#L133](../../packages/ts-shell/src/cli/interactive/fileSuggestions.ts#L133) 那样注入 `from` 起始偏移（`ranked.map(s => ({ ...s, from: ... }))`）。
3. 在键盘处理 [keymap.ts#L391-L396](../../packages/ts-shell/src/cli/interactive/keymap.ts#L391-L396) 中：
   ```typescript
   if (chosen.from !== undefined) {
     const draft = view.editor.getText();
     view.editor.setDraftText(`${draft.slice(0, chosen.from)}${chosen.value} `);
   } else {
     view.editor.setText(`${chosen.value} `);
   }
   ```
   因为所有子命令候选对象的 `from` 均为 `undefined`，代码走入 `else` 分支，直接调用 `view.editor.setText(`${chosen.value} `)`！
   **后果**：若用户在 `/goal ` 浮层中通过方向键选中 `pause` 并按 Tab 键补全，原本期望得到 `/goal pause `，实际结果却是输入框内容**被直接整行替换为 `"pause "`**，前面的主命令 `/goal ` 彻底丢失！

#### 9.1.5 源码链路四：命令补全后浮层主动销毁（缺乏平滑过渡）

当用户在输入框键入 `/go` 并按 Tab 接受 `/goal` 时：
[keymap.ts#L395-L397](../../packages/ts-shell/src/cli/interactive/keymap.ts#L395-L397) 将文本设为 `"/goal "`，紧接着强制执行：
```typescript
view.setSuggesting(false);
actions.redraw();
return true;
```
它主动将 `suggestionsOpen` 置为 `false`，且**完全没有触发 `actions.syncSuggestions(true)`**。
这意味着用户刚通过自动补全把命令打完加好空格，联想浮层却立即被代码强行关停，用户必须再手动输入一个字符或按特定快捷键，子命令列表才可能重新显现。
### 9.2 `/goal` 词表差异深入核查：Cheers 运行时接受集合 vs 用户预期集合

#### 9.2.1 词表差异详细对照

用户在反馈中明确列出期望看到的参数：“`set`、`resume`、`drop`、`pause`、`show`、`budget` 这类的”。
深入核查 Cheers 现行运行时代码与参考项目 oh-my-pi，两者实际支持的子命令与参数语法存在显著差异：

| 操作维度 | Cheers 现行实现 ([goalCommandRuntime.ts](../../packages/ts-shell/src/core/commands/goalCommandRuntime.ts)) | 用户预期 / oh-my-pi 实现 ([builtin-modes.ts](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-modes.ts#L379-L386)) | 语义差异与代差分析 |
|---|---|---|---|
| **设置目标 (Set)** | 裸文本：`/goal <words>`<br>(如 `/goal 修复构建失败`，无 `set` 前缀) | 显式子命令：`/goal set <objective>`<br>(同时支持静态 `inlineHint: "[objective]"`) | Cheers 将无法识别为状态词的参数全部直接作为目标文本存储；oh-my-pi 提供显式的 `set` 动词，语义更结构化。 |
| **展示目标 (Show)** | 无参数裸调用：`/goal`<br>(无参数时打印当前状态与目标文本) | 显式子命令：`/goal show`<br>(裸 `/goal` 兼具开闭切换等交互) | Cheers 采用经典的 CLI 模式（无参即 show）；oh-my-pi 将 `show` 单列为可选子命令。 |
| **暂停目标 (Pause)** | 子命令：`/goal pause`<br>(状态机流转为 `paused`) | 子命令：`/goal pause`<br>(暂停当前自主目标循环) | 动词同名；Cheers 当前只改变目标状态，不能视作已暂停或恢复自主执行循环。 |
| **恢复目标 (Resume)** | 子命令：`/goal resume`<br>(状态机流转为 `active`) | 子命令：`/goal resume`<br>(恢复被暂停的自主目标循环) | 动词同名；Cheers 当前只改变目标状态，不能视作已暂停或恢复自主执行循环。 |
| **终止目标 (Drop/Done)** | 子命令：`/goal complete` (别名 `done`)<br>子命令：`/goal clear` (彻底清空) | 子命令：`/goal drop`<br>(主动丢弃/放弃当前目标) | Cheers 面向任务生命周期完成（`complete`）与记录抹除（`clear`）；oh-my-pi 面向自主循环代理，任务完成由代理自决，用户主动中断称为 `drop`。 |
| **预算配额 (Budget)** | **不支持**（无对应子命令与逻辑） | 子命令：`/goal budget <N\|off>`<br>(设定目标自主运行消耗的最大 Token 预算) | Cheers 底层暂无单任务 Token 预算守卫；oh-my-pi 提供可选累计预算阈值与事后检查；不等于共享硬准入，见复核记录 §4。 |

在补全字典方面，Cheers 的 [argumentCompletions.ts#L35](../../packages/ts-shell/src/core/commands/argumentCompletions.ts#L35) 忠实映射了其自身命令处理器的集合：
```typescript
SUBCOMMAND_VALUES = {
  goal: ["pause", "resume", "complete", "clear"],
};
```
因此，当用户按照 oh-my-pi 的习惯敲入 `/goal s`（试图输入 `set` 或 `show`）或者 `/goal b`（试图输入 `budget`）时，Cheers 的补全字典中完全没有这些词汇，直接导致前缀匹配落空并关闭浮层。

#### 9.2.2 根因定位与产品决策定性

**明确结论（源码与架构）**：
1. **绝非补全模块的代码遗漏或拼写 Bug**：
   `argumentCompletions.ts` 顶部注释清晰写明：“`Completing a value the handler would reject is worse than completing nothing, so these lists come from the handler's own accepted set.`”（“补全一个处理器会拒绝的值比什么都不补全更糟糕，因此这些列表直接源自处理器自身接受的集合”）。补全覆盖 4 个规范动作，但 Handler 还接受 `done`，以及裸目标文本；不是全部合法输入的 1:1 枚举。
2. **深层根因是底层业务模型的代差**：
   - **Cheers 的轻量会话目标模型**：依赖 [projectState.ts](../../packages/ts-shell/src/core/state/projectState.ts)，将目标持久化在本地项目的 `projectState.json` 中，三态为 `active` / `paused` / `completed`，每轮对话将当前目标注入出站环境信息（Environment Context），属于静态提示词增强机制；
   - **oh-my-pi 的自主代理运行模式（Goal Mode）**：具备连续多轮自主推进和可选累计 token 阈值，未填写时无 cap；其 usage flush 后检查不证明已经具备主子共享的请求前硬准入，详见 [复核记录 §4](verification-15-21.md)。
3. **用户已裁决：Phase 19 实现完整自主目标模式**：
   - 正式支持 `set/show/pause/resume/drop/budget`，具备持续执行、暂停恢复及真实预算约束。用户未填写预算时不设总 token 上限，也不先要求预算或默认 100k；`budget N` 才建立主代理、子代理、顾问和重试共享的显式上限，`budget off` 取消该上限。单次请求、上下文和取消等实际边界继续有效。`budget` 本阶段必须落地，不能仅增加菜单或延期。
   - 保留裸 `/goal` 查询与旧裸 objective 输入；新增保留字发生歧义时，提供显式 `set <objective>` 或 `-- <objective>`。不能把以 `set` 开头的旧目标静默改写成另一语义。
   - `complete/done` 保留为用户明确确认完成的动作，记录 `user-confirmed` 来源，不能伪装成模型已验证完成；`drop/clear` 表示放弃/清理，与完成分离。
   - 补全、help、parser/validator 共同消费 Goal owner 的语法；预算预留、实际结算、并发子代理和恢复后剩余预算由运行时负责。状态、UI 与预算耗尽的停止原因必须一致。
   - 自主完成需要实现证据与验证状态；停止、预算耗尽、暂停或失败不得升级为完成。具体运行时批次见 [Phase 19 决策](phase-19-decisions.md)。

### 9.3 顶尖参考项目策略对比：oh-my-pi、pi 与 Codex

在命令参数与子命令呈现机制上，不同顶尖项目采取了分水岭式的架构路线：

#### 9.3.1 oh-my-pi：声明式元数据驱动与双模（下拉+幽灵）呈现

oh-my-pi 在交互深度与工程复用性上采用声明式投影：
1. **声明式结构体契约**：
   在 [types.ts](../../../oh-my-pi/packages/coding-agent/src/slash-commands/types.ts#L8-L30) 中，将子命令直接提升为一等公民：
   ```typescript
   export interface SubcommandDef {
     name: string;
     description: string;
     /** Usage hint shown as dim ghost text, e.g. "<name> [--scope project|user]". */
     usage?: string;
   }

   export interface BuiltinSlashCommand {
     name: string;
     subcommands?: SubcommandDef[];
     inlineHint?: string;
     allowArgs?: boolean;
     // ...
   }
   ```
2. **自动派生参数补全（自动附带尾部空格）**：
   在 [builtin-completions.ts#L23-L37](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-completions.ts#L23-L37) 中，`buildArgumentCompletions` 由声明式数组自动生成补全函数：
   ```typescript
   export function buildArgumentCompletions(subcommands: SubcommandDef[]) {
     return (argumentPrefix: string) => {
       if (argumentPrefix.includes(" ")) return null;
       const lower = argumentPrefix.toLowerCase();
       const matches = subcommands
         .filter(s => s.name.startsWith(lower))
         .map(s => ({
           value: `${s.name} `,       // 核心：自动附带空格，接受后立即就绪后续参数
           label: s.name,
           description: s.description, // 核心：下拉列表中同时呈现清晰的用途说明
           hint: s.usage,              // 核心：携带语法参数提示
         }));
       return matches.length > 0 ? matches : null;
     };
   }
   ```
3. **光标右侧的暗色幽灵提示（Inline Ghost Text）**：
   在 [builtin-completions.ts#L204-L234](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-completions.ts#L204-L234) 中：
   - 当用户在子命令前缀中敲击时（如键入 `p`），幽灵文本在光标后以暗色字体渲染剩余字符及语法（如 `ause`）；
   - 当子命令已敲完并敲入空格时，幽灵文本在光标后呈现该子命令的 `usage` 语法（如 `<objective>`）。
4. **注册表从声明式元数据生成**：
   在 [builtin-registry.ts#L84-L97](../../../oh-my-pi/packages/coding-agent/src/slash-commands/builtin-registry.ts#L84-L97) 中，`materializeTuiBuiltinSlashCommand` 统一将静态元数据转换为运行时所需的 `getArgumentCompletions` 与 `getInlineHint`，各个具体命令无需手工编写重复的闭包与正则。

#### 9.3.2 pi：基于回调的动态提供者模型

在只读参考项目 pi 中：
1. [autocomplete.ts](../../../pi/packages/tui/src/autocomplete.ts#L262-L264) 定义了 `getArgumentCompletions?(argumentPrefix: string): Awaitable<AutocompleteItem[] | null>`。
2. 当输入行出现首个空格时（`indexOf(" ") !== -1`），TUI 提取命令名与参数前缀，直接调用该回调（[autocomplete.ts#L385-L394](../../../pi/packages/tui/src/autocomplete.ts#L385-L394)）。
3. 局限：缺乏声明式的子命令数据模型与自动幽灵提示，每个命令的参数补全需要由业务层或插件自行组装对象数组。

#### 9.3.3 Codex：所查弹窗以命令名过滤

在只读参考项目 Codex（Rust 编写）中：
1. [command_popup.rs#L97-L120](../../../codex/codex-rs/tui/src/bottom_pane/command_popup.rs#L97-L120)：`on_composer_text_change` 从首行提取第一个空格前的词汇（`cmd_token = token.split_whitespace().next()`），整个弹窗仅仅以 `cmd_token` 过滤命令本身；即使用户输入了 `/clear something`，弹窗依然维持 `/clear` 命令项。
2. [slash_commands.rs#L34-L39](../../../codex/codex-rs/tui/src/bottom_pane/slash_commands.rs#L34-L39)：仅定义了布尔型 `supports_inline_args(&self) -> bool`，在所查弹窗接口中未提供通用子命令下拉枚举；该结论不推及整个产品的所有选择器。

#### 9.3.4 四方机制横向对比矩阵

| 对比维度 | Cheers 现状 | oh-my-pi | pi | Codex |
|---|---|---|---|---|
| **数据建模方式** | `SUBCOMMAND_VALUES` 扁平字符串数组映射 | 声明式 `SubcommandDef` (含 `description`, `usage`) | 命令级动态异步回调 | 仅布尔标记 `supports_inline_args` |
| **下拉浮层内容** | 静态动作多数仅裸标签；专用 provider 可带 detail | 标签 + 详细说明（`description`） + 语法摘要 | 标签 + 可选描述（由回调自主填充） | 无参数下拉列表（仅命令行） |
| **补全值设计** | 裸词（`value: name`），且无 `from` 导致整行覆盖 | 带尾部空格（`value: name + ' '`），且精准切片替换 | 裸词或带空格，按 `prefix` 长度替换 | 无参数补全 |
| **行内幽灵提示** | 当前输入路径未提供 Ghost Text | 所查路径支持补全名与 usage | 所查参数接口未提供 usage 派生 | 所查命令弹窗未提供 |
| **前缀容错性** | 未匹配返回 `null`，关闭浮层 | 同样可无匹配关闭；描述和行内提示改善上下文，不等于容错算法更强 | 弱（返回 `null` 关闭浮层） | 不适用 |
| **维护成本** | 字典表、注册表、运行时多处可能漂移 | 候选和描述可从单点派生；运行时仍需核对 | 中（需为各命令手工实现补全闭包） | 低（无此功能） |
### 9.4 架构与交互设计（待施工）

本节不再维护第二套 `SubcommandDefinition`、偏移和 Enter 伪实现。跨命令契约统一见 [23 §4](23-command-argument-options.md#4-统一语法与补全契约待施工)，其约束在 `/goal` 同样适用：

1. Goal owner 的同一语法产生 parser/validator、help、候选描述与动态 usage；不能仅在补全字典追加后端不支持的动词。
2. `set` 的 objective 属于自由文本，`budget` 属于经校验的数值/关闭设置，`pause/resume/drop/show` 属于动作。不能把所有 token 都建模成相同子命令字符串。
3. 对原始 UTF-16 草稿保留 `[from,to)`、cursor、draftRevision 与 catalogRevision；替换时保留 suffix，多空格、制表符、引号、emoji 和光标居中编辑都不得损坏。
4. 命令补全后根据新解析位置刷新参数候选；加载、无匹配、不可用和无权限分开呈现。异步查询可以取消，过期结果丢弃。
5. helper/ghost text 跟随实际高亮项与语法位置，不能 `usage.split(" ")` 猜剩余参数。无后续参数的 `pause` 不显示虚构占位；自由目标显示语法说明但不伪造选项。
6. `MAX_VISIBLE = 8` 是视口限制，不是 `/goal` 只有 4 个动作的目标约束；新增动作和兼容别名按规范主项优先、别名可检索的规则呈现。

### 9.5 集成接缝与验收（待施工）

| Owner / 现有路径 | 施工责任 |
|---|---|
| [core/commands/types.ts](../../packages/ts-shell/src/core/commands/types.ts)、各命令领域 | 定义共用语法、语义动作和合法候选；避免在入口或单个巨型 registry 中堆积行为 |
| [goalCommandRuntime.ts](../../packages/ts-shell/src/core/commands/goalCommandRuntime.ts) 与目标执行 owner | 真实自主循环、共享预算、暂停恢复及兼容动作；不是仅补充状态字段 |
| [slashSuggestions.ts](../../packages/ts-shell/src/cli/interactive/slashSuggestions.ts) | 保留 raw invocation、投影编辑范围、动态候选取消与失效 |
| [keymap.ts](../../packages/ts-shell/src/cli/interactive/keymap.ts) | 接受候选仅编辑草稿；提交前使用完整解析结果 |
| [suggestions.ts](../../packages/ts-shell/src/presentation/tui/chrome/suggestions.ts) | 高亮项说明、合法 usage、八行视口与明确结果状态 |

先补行为回归测试和范围替换修复，再逐 owner 迁移语法并删除旧裸字符串字典；新增 Goal 行为与已有命令兼容性分开验证，不能以“所有旧断言不变”替代新契约。

专项验收覆盖 `/go → Tab → /goal → 参数候选`、`set` 自由文本、`budget` 非法值、暂停中的在途动作、预算耗尽拒绝新主/子请求、恢复后预算不重置、`complete/done` 用户确认来源以及 `drop/clear` 非完成状态。对这些运行时能力尚无本次执行证据。
