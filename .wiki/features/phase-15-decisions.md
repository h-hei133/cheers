# Phase 15 裁决：六个缺口的处置（2026-09-28）

> 预研究见 `phase-15-pre-research.md`。本文按其证据给裁决与执行序。

## 1. 裁决总表

| # | 缺口 | 裁决 | 理由 |
|---|---|---|---|
| G1 | MCP 模型侧调用是假串（两层断裂） | **做**（15-A，立即） | 纯接线修复：底层 client/gateway 已是真实现，只差「registry 转发」和「生产注入」两根线。假成功比报错更糟——模型被骗后不会重试也不会求助 |
| G2 | `/plugin` 无执行引擎 | **缩减**（15-B） | 全量动态扩展运行时是大工程且与 G3/G4 抢同一批接缝。本阶段先把 `/plugin` 收缩为**诚实的本地声明管理**（改文案、去伪装），真加载器推迟到独立的扩展运行时阶段 |
| G3 | sidebar 整层未接 TUI | **接通**（15-C） | 27 文件的投影/渲染/布局层已写完且全测试，缺的只是 view/engine 的消费——「删掉」浪费已验证实现，「保留不接」是永久 demo。接成 alt-screen 侧栏是最小真实用途 |
| G4 | 图片显示 + LaTeX | **图片做，LaTeX 缓** | 图片对 agent 有实证用途（截图回显、浏览器产物核对）；LaTeX 是终端显示增强，模型输出数学的频率不足以先做 |
| G5 | fork/import/share/name/settings | **fork + settings 做，import/share/name 记 backlog** | fork 语义（新文件独立生长）与现有 revertTo（同文件换叶）互补，pi 有直接参照；settings 面板用户价值最高。import/share/name 低频，不阻塞 |
| G6 | title/通知/bell | **做**（15-E，小） | 三件都是几行 OSC 序列，长任务后台感知是真实痛点 |

## 2. 执行序

1. **15-A：MCP 真接线**（G1）——先写撤销验证测试（内存 gateway double
   断言调用真的到达），再修两层：registry `execute` → `invokeTool`；
   `cliRuntimeInvocation.ts:454` → `listTools()` + gateway 注入。
   完成后 MCP 才算「模型可用」，其余 MCP 增强（SSE/HTTP 传输）独立排。
2. **15-C：sidebar 接通**（G3）——`surface/view.ts` 增加侧栏区（alt-screen
   右栏），`/sidebar` 从纯文本改为开关侧栏；投影层按现状消费。
   pi 参照：`tui/components/box.ts` 的边框画法 + `h-stack.ts` 的列布局。
3. **15-D：终端图片显示**（G4a）——Kitty `\x1b_G` + iTerm2 OSC 1337
   双协议，`terminalCapabilities` 复用现有探测；transcript 对 image block
   渲染为占位行+协议序列。pi 参照 `tui/terminal-image.ts`（含 cell 尺寸
   查询与 multiplexer 穿透，一并抄齐）。
4. **15-E：终端集成三小件**（G6）——run 完成时 bell + OSC 0 title
   更新（project/session 名）+ OSC 777 空闲通知（可配置开关，默认关）。
5. **15-F：fork + settings**（G5 部分）——`SessionManager.forkFrom`
   参照 pi `session-manager.ts:1810-1845`；`/fork [entryId]` 从任意历史
   点克隆。settings 面板用现成 `chrome/options` picker 框架做只读+开关
   类设置（复杂嵌套配置仍走文件）。
6. **15-B：plugin 收缩**（G2）——文案三处改为明确的「声明仅记录，
   本构建不加载」已在做对，再删掉伪装表格中暗示可执行的措辞；真加载
   期待的接缝清单写进 backlog 文档。

每项独立提交、撤销验证、跑七门禁。完成后 `check:declarations` 与
docs-drift 必须全绿；`log.md` 与 `_index.md` 同步。

## 3. 明确不做（本轮）

- **LaTeX**：记录，等模型侧数学输出频率给出证据再启动。
- **`/import` `/share` `/name`**：backlog。`/share` 涉及网络上传与
  凭据，独立裁决。
- **MCP SSE/HTTP 传输**：与 15-A 分离，避免一个提交背两个协议。
- **状态栏后台 git watcher / 扩展注入口**：现有 on-demand 读取够用，
  等真实卡顿证据。
- **全量扩展运行时**（jiti 加载第三方 TS）：是独立 Phase 的体量，
  不塞进本轮。

## 4. 风险

- 15-A 测试必须用**内存 gateway double 断言调用到达**——Phase 14 的
  教训：stub 测试在「假串修复删掉后」照样过（terminal singleton 案例）。
- 15-C 的 alt-screen 布局改动会触碰 `surface/benchmark.test.ts`
  （已知的负载敏感测试）——基线时间改动前先隔离复跑取基线。
- 15-D 的协议序列在 tmux/screen 下的穿透（passthrough）必须带探测
  回退，pi 的 `terminal-image.ts` 已处理，照抄不要自创。
