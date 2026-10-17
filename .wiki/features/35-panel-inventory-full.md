---
title: "面板全量清单与有效实施范围"
category: article
sources: [repo-audit-2026-10-16, packages/ts-shell/src/cli/interactive/picker/registry.ts, packages/ts-shell/src/cli/interactive/picker/, packages/ts-shell/src/cli/interactive/overlay.ts, oh-my-pi/packages/tui/src/overlays/, oh-my-pi/packages/coding-agent/src/modes/types.ts, oh-my-pi/packages/coding-agent/src/modes/controllers/selector-controller.ts, oh-my-pi/packages/coding-agent/src/slash-commands/builtin-*.ts, 33-omp-panel-mapping.md, 34-panel-conversion-plan.md]
created: 2026-10-16
updated: 2026-10-17
tags: [features, panels, slash-commands, oh-my-pi, mapping, gap-analysis]
summary: "复核旧快照：omp 65 个直属 overlay 文件、85 个 builtin 主命令；Cheers 有 19 个 picker 入口。原17项逐项处置：report改为通用展示能力、theme归settings且候选已接线、omfg不做；保留13个现有入口，另补jobs；用户已定增强/plugin，/extensions作同一入口别名。P-06扩panel.ts，补齐领域端口、生命周期、副作用及unknown验收。"
confidence: high
---

# 面板全量清单

只读研究。未修改产品源码。本文补 [33](33-omp-panel-mapping.md) §8 自承的缺口（「omp 的 `debug-selector`、`GitUi`、`extensions-dashboard` 未逐一读取源码」），并把映射从「17 组」扩展到全量。

**2026-10-17 源码复核**：Cheers `0d30d589ec9023ed24e0794c1215f70398bc418d`；参考固定 [oh-my-pi c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4](https://github.com/can1357/oh-my-pi/tree/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4)，与现参考 HEAD `eb74cf84` 区分。以下有效清单替代历史“17 个新面板全补”的字面计数；本轮读码与 AST 计数没有构成新的 TUI/PTY 动态验收。

## 1. 规模对照（实测）

| 项 | Cheers | oh-my-pi |
|---|---|---|
| 面板/overlay **文件** | picker 目录同时含注册与共用件，文件数不等于可打开面板数 | 固定旧快照直属 **65** 个 `.ts`；子目录另计，含类型/投影/辅助件 |
| 承载的**命令** | **19**（`picker/registry.ts` 的 `PICKERS` 映射，实测键数） | **36** 个 `show*` 方法（`modes/types.ts`），其中约 28 个对应命令 |
| 主命令入口总数 | 102（101 个 dispatch 定义 + picker-only `/back`） | **85**（七个 builtin 根数组的唯一 name；不含子命令与 alias） |

文件/方法/主命令采用不同分母；以下保留已读参考规格并明确未读/未动态验收部分，不宣称仅凭清单完成全功能复验。

## 2. Cheers 侧：全部 19 个面板命令（实测）

来自 [picker/registry.ts:70-100](../../packages/ts-shell/src/cli/interactive/picker/registry.ts#L70) 的 `PICKERS` 常量（这是唯一的映射源）：

| # | 命令 | picker 文件 | 大小 |
|---|---|---|---|
| 01 | `/help` | `help.ts` | 1.9 K |
| 02 | `/tools` | `tools.ts` | 1.6 K |
| 03 | `/model` | `model.ts` | 3.5 K |
| 04 | `/copy` | `copy.ts` | 2.1 K |
| 05 | `/resume` | `session.ts` | 6.0 K |
| 06 | `/mcp` | `servers.ts` | 2.2 K |
| 07 | `/connect` | `connections.ts` | 4.3 K |
| 08 | `/permissions` | `permissions.ts` | 1.8 K |
| 09 | `/plugin` | `plugins.ts` | 2.5 K |
| 10 | `/marketplace` | `sources.ts` | 2.4 K |
| 11 | `/restore` | `restore.ts` | 3.8 K |
| 12 | `/undo` | `undo.ts` | 3.9 K |
| 13 | `/skill` | `skills.ts` | 1.8 K |
| 14 | `/back` | `rewind.ts` | 4.8 K |
| 15 | `/tree` | `tree.ts` | 1.3 K |
| 16 | `/fork` | `tree.ts`（复用，第 3 参 `true`） | — |
| 17 | `/statusline` | `statusItems.ts` | 2.0 K |
| 18 | `/settings` | `settings.ts` | 9.2 K |
| 19 | `/git` | `git.ts` | 5.9 K |

另有 **3 个 picker 文件未被 `PICKERS` 直接映射**：`approval.ts`（3.9 K）、`input.ts`（2.4 K）、`preview.ts`（1.3 K）——它们是**共用组件**（审批对话框、输入框、预览），由其他 picker 内嵌调用。

**`/theme` 没有独立 picker，但主题选择已存在于 settings**：`picker/settings.ts:73` 注入 `host.themes.names()`，`interactiveMode.ts:1070` 绑定 `themePreferences`；当前实现不能用“schema 无 enum”推断只能自由输入 JSON。按 H-03 继续在 settings 完成主题体验，现有 `/theme` 直接命令的兼容处理不得因 UI 合并而静默删除。

**结论**：102 个主入口中 19 个由 `PICKERS` 映射。其余 83 个没有该映射，包含 prompt、shell action、媒体/会话控制等行为，**不能统称纯文本或认定需要面板**。参数形式也可直接进入 handler 而不打开 picker（`opensPicker`）。

## 3. oh-my-pi 侧：overlay → 命令映射（补齐）

### 3.1 有 `show*` 方法的（`modes/types.ts` 的 TUI 契约）

| # | overlay 文件 | 命令 | `show*` 方法 | 声明处 |
|---|---|---|---|---|
| 01 | `settings-selector.ts` | `/settings` | `showSettingsSelector` | types.ts:498 |
| 02 | `usage-dashboard.ts` | `/usage` | `showUsageDashboard` | types.ts:500 |
| 03 | `advisor-config.ts` | `/advisor` | `showAdvisorConfigure` | types.ts:501 |
| 04 | `history-search.ts` | 输入历史搜索键位，非 `/history` | `showHistorySearch` | types.ts:502 |
| 05 | `extensions/…` | `/extensions` | `showExtensionsDashboard` | types.ts:503 |
| 06 | `agents-hub.ts` | `/agents` | `showAgentsDashboard` | types.ts:504 |
| 07 | `GitUi` | `/git` | `showGitUi` | types.ts:506 |
| 08 | `model-selector.ts` | `/model` | `showModelSelector` | types.ts:507 |
| 09 | `plugin-selector.ts` | `/plugins` | `showPluginSelector` | types.ts:510 |
| 10 | `copy-selector.ts` | `/copy` | `showCopySelector` | types.ts:512 |
| 11 | `tree-selector.ts` | `/tree` | `showTreeSelector` | types.ts:513 |
| 12 | `thinking-selector.ts` | **`/effort`** | `showThinkingSelector` | types.ts:515 |
| 13 | `session-selector.ts` | `/resume` | `showSessionSelector` | types.ts:516 |
| 14 | `oauth-selector.ts` | `/login` `/logout` | `showOAuthSelector` | types.ts:521 |
| 15 | `session-pin-selector` | `/pin` | `showSessionPinSelector` | types.ts:522 |
| 16 | `reset-usage-selector.ts` | `/usage reset` | `showResetUsageSelector` | types.ts:523 |
| 17 | `provider-setup` | provider 设置能力；不能从方法名推断 `/connect` 命令 | `showProviderSetup` | types.ts:524 |
| 18 | `debug-selector` | `/debug` | `showDebugSelector` | types.ts:528 |
| 19 | `agent-hub.ts` | `/hub` | `showAgentHub` | types.ts:529 |
| 20 | `hook-input` / `hook-selector` | `/pause` | `showHookConfirm` | types.ts:526 |
| 21 | `model-browser.ts` | `/model`（浏览分支） | `ModelBrowserComponent` | builtin-completions.ts |
| 22 | `pause-screen.ts` | （非命令） | 暂停屏 | builtin-control.ts |
| 23 | `cleanse-panel.ts` | `/cleanse` | `CleansePanelComponent` | `cleanse-command-controller.ts` |
| 24 | `btw-history-panel.ts` | `/btw` | `BtwHistoryPanel` | `btw-controller.ts` |
| 25 | `plan-review-overlay.ts` | `/plan-review` | `PlanReviewOverlay` | `interactive-mode.ts` |
| 26 | `omfg-panel.ts` | **`/omfg`** | `OmfgPanelComponent` | `omfg-controller.ts` |
| 27 | `report-panel.ts` | 其他命令的只读结果，无 `/report` 命令 | `showCommandReport` | `command-controller.ts` |
| 28 | `annotation-overlay.ts` | （扩展 UI） | `AnnotationOverlay` | `extensibility/custom-commands/bundled/annotate/` |

### 3.2 未被命令直接打开的 overlay（结构件/内嵌件）

实测无 `show*` 也无命令引用的：

```text
hub-frame.ts            共用骨架（见 33 号）
overlay-box.ts          共用几何
agent-hub-renderer.ts   agent-hub 的渲染层
agent-hub-projection.ts agent-hub 的投影层
agent-hub-types.ts      类型
copy-targets.ts         copy-selector 的数据
usage-row.ts / usage-display.ts   usage-dashboard 的行渲染
job-tree.ts             jobs-panel 的树
session-observer-registry.ts     注册表
composer-shape-preview.ts / snapcompact-shape-preview.ts  预览
theme-selector.ts       （无消费者，见下）
queue-mode-selector.ts  （无消费者）
show-images-selector.ts （无消费者）
logout-account-selector.ts / session-account-selector.ts  账号选择
bordered-loader.ts      加载态
error-banner.ts         错误横幅
stats-notice.ts         提示
move-overlay.ts         移动
running-subagent-badge.ts  徽章
codex-reset-fireworks.ts   装饰
plan-save-overlay.ts / plan-toc.ts  plan 相关
login-dialog.ts / approval-dialog.ts / ask-dialog.ts  对话框
hook-editor.ts           hook 编辑
model-picker.ts          （与 model-selector 并存）
plugin-settings.ts       插件设置
report-panel.ts          报告
```

**三个selector的产品可达性**：后续消费者复核仅发现测试引用，见附§4.8；不作为omp既有产品行为。测试通过或组件存在不等于运行时已接线。

## 4. 对照结论：哪些命令 Cheers 缺面板

原表的 17 项不是同一类任务。保留行号用于溯源，但以下“当前处置”才是实施范围；组件可以复用，不能按行数估成同数的新组件。另 `/jobs` 已在 34 Q-06 与 33 W-01 明确进入范围，原 17 项漏列。

| # | 命令 | omp overlay | Cheers 现状 | omp 命令存在 | 当前处置 |
|---|---|---|---|---|---|
| 01 | `/hub` | `agent-hub.ts` 93.7 K + 3 个配套 | 存在，无 picker | ✅ `name: "hub"` | 补领域面板与结构化端口，按文末契约验收 |
| 02 | `/agents` | `agents-hub.ts` 65.7 K | 存在，无 picker | ✅ `name: "agents"` | 补领域面板与结构化端口，按文末契约验收 |
| 03 | `/usage` | `usage-dashboard.ts` 69.3 K + `usage-row.ts` + `usage-display.ts` | 存在，无 picker（文本 20 行） | ✅ `name: "usage"` | 补领域面板与结构化端口，按文末契约验收 |
| 04 | `/advisor` | `advisor-config.ts` 62.7 K | 存在，无 picker | ✅ `name: "advisor"` | 补领域面板与结构化端口，按文末契约验收 |
| 05 | `/plan-review` | `plan-review-overlay.ts` 69.8 K + `plan-toc.ts` | 存在，无 picker | ✅ `name: "plan-review"` | 补领域面板与结构化端口，按文末契约验收 |
| 06 | `/thinking`（omp 名 `/effort`） | `thinking-selector.ts` | 存在，无 picker | ✅ omp 是 `effort` | 中 |
| 07 | `/history` | `history-search.ts` 16.0 K | 存在，无 picker | ⚠️ **omp 无 `/history` 命令**——由 `app.history.search` 键位打开（[input-controller.ts:385-389](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/input-controller.ts#L385)） | 中 |
| 08 | `/report` | `report-panel.ts` | Cheers 同名命令生成脱敏 zip，语义不同 | omp 无此命令，内部 `showCommandReport` | 改为通用结果展示能力；不新建/改义 `/report` 命令，不把关闭报告视为写 zip |
| 09 | `/cleanse` | `cleanse-panel.ts` 9.1 K | 存在，无 picker | ✅ `name: "cleanse"` | 补领域面板与结构化端口，按文末契约验收 |
| 10 | `/btw` | `btw-history-panel.ts` 34.3 K + `btw-panel.ts` | 存在，无 picker | ✅ `name: "btw"` | 补领域面板与结构化端口，按文末契约验收 |
| 11 | `/login` | `oauth-selector.ts` 22.4 K | 存在，无 picker | ✅ `name: "login"` | 补领域面板与结构化端口，按文末契约验收 |
| 12 | `/logout` | `oauth-selector.ts`（同组件） | 存在，无 picker | ✅ `name: "logout"` | 补领域面板与结构化端口，按文末契约验收 |
| 13 | `/pin` | `session-pin-selector` | 存在，无 picker | ✅ `name: "pin"` | 补领域面板与结构化端口，按文末契约验收 |
| 14 | `/debug` | `debug-selector` | 存在，无 picker | ✅ `name: "debug"` | 补领域面板与结构化端口，按文末契约验收 |
| 15 | `/theme` | settings appearance；独立 selector 无生产消费者 | settings 已有候选与预览 | omp 无 `/theme` 主命令 | H-03：归 settings；T-01/02 首例复用现有实现，不新增主题 picker |
| 16 | 扩展管理 | `overlays/extensions/` dashboard | `/plugin` 已有 picker 和真实 extension runtime | omp `/extensions` 存在 | H-05 用户已定：增强 `/plugin` 面板，`/extensions` 作同一命令/面板别名；复用运行时与状态 |
| 17 | `/omfg` | `omfg-panel.ts` | `/rules propose` 覆盖反馈提案入口 | omp 有此命令 | H-06：用户已裁决不做，不计待实现 |
| 补 | `/jobs` | `jobs-panel.ts` | 实际 jobs owner 存在，无 picker | omp 有此命令 | 34 Q-06 已纳入，补实际状态/输出/控制面板 |

**命名复核**：`/pin`是Cheers现有主命令；`/effort`是`/thinking`已注册alias（registry.ts:876），不能写不存在。`/extensions`尚未注册，按本轮用户裁决作为`/plugin`同一入口别名实施；`/omfg`排除。omp没有`/history`、`/report`、`/theme`同名builtin，语义和有效处置见当前清单。

**有效范围**：原表 13 个现有命令入口补面板，加上已定 `/jobs`，共 **14 个现有入口**；另有现有 `/plugin` 面板增强（`/extensions` 别名）、settings 主题体验与通用结果展示。`/report`、`/theme`、`/omfg` 不再计为三个独立新面板。输入历史搜索和 Cheers `/history` 的会话树也不是同一数据集，必须接 Cheers 自己的 history owner，不能直接复制参考输入历史行为。

## 5. 反向：Cheers 有面板而 omp 没有的

| 命令 | Cheers | omp |
|---|---|---|
| `/tools` | `tools.ts` 面板 | 无面板（`/tools` 是文本） |
| `/permissions` | `permissions.ts` 面板 | 无独立命令 |
| `/statusline` | `statusItems.ts` 面板 | 在 `/settings` 内 |
| `/undo` | `undo.ts` 面板 | 无（omp 用 `/rewind`） |
| `/skill` | `skills.ts` 面板 | 无面板 |
| `/restore` | `restore.ts` 面板 | 无对应命令 |

**Cheers 有 6 个面板 omp 没有**——这些是 Cheers 的结构优势。

## 6. 两侧都无面板的命令

Cheers 的 83 个无面板命令中，多数本就不需要面板（`/clear` `/exit` `/pwd` 等）。真正值得注意的：

- **主题选择**：已在 settings 候选/预览里；按 H-03 改善该现有入口。
- **`/thinking`**：有 4 个档位，omp 用 `/effort` + `thinking-selector` 做面板。
- **`/log`**：有 `tail|path|export|clear`，适合面板。
- **`/metrics`** `/timings`：数值展示，表格即可。

## 7. 待定决策点

### 已定决策（2026-10-16）

| # | 决策 | 结果 |
|---|---|---|
| **N-01** | 面板能力补齐 | 保留用户“全补”目标，并应用后续 H-02/03/06/08：有效清单见 §4，不再解释为 17 个独立新命令/组件 |

**N-01 的后果**：§4 的当前处置进入规划；共享 P-01…P-06，按领域端口与生命周期依赖拆任务，不依赖未落盘的子代理报告。

### 当前处置

| # | 决策 | 选项 |
|---|---|---|
| N-02 | 主题入口 | H-03 已定归 settings；候选与预览已具备 |
| N-03 | `/thinking` 是否改为 picker（对齐 omp `/effort`） | 随 N-01 一起做 |
| N-04 | 独立 `/pin` | 已存在；任务是补面板，不再裁决是否新增命令 |
| N-05 | Cheers独有的6个面板是否保持 | 保留各领域语义与入口，复用公共原语；不为参考对齐删除或强行合并，逐项见Phase20 §5.2 |
| N-06 | 有效范围的实施批次 | 按共享容器、领域读取/订阅、审批动作依赖安排 |

## 8. 未验证项

- `theme-selector.ts` / `queue-mode-selector.ts` / `show-images-selector.ts` 只有测试引用；`model-picker.ts` 有生产消费者，见附 §4.8。测试组件仅作组件技术参考，不能当既有产品行为。
- `McpAddWizard` / `AgentTranscriptViewer` / `MoveOverlayComponent` / `JobsPanel` / `UsageDashboard` 的**精确打开路径**未逐一追踪到命令（部分经控制器间接调用）。
- 未逐一读取 §3.2 中每个「结构件」的源码（只做了消费者搜索）。
- omp 的 85 个 builtin 主命令与 `show*` 方法数不是同一口径：键位、内部组件、多入口/复用均影响计数。
- 未在真实终端目视对比两侧面板。

## 9. 子代理失败说明

本轮为该问题派出的 `PanelsUncovered` 子代理仍在运行；`StartupPi` 与 `ArgAuditFull` 均以 **HTTP 402「当前账户暂无生效套餐」** 失败。本文由主代理直接完成。

---

## 附：面板参考规格与当前处置

只读研究。未修改产品源码。承接 N-01 及后续 H-01/02/03/06/08；原 17 项的处置见 §4，以下保留具体参考规格。

下文区分源码已读取、仅定位和未动态验证；既往子代理报告不作为独立完成证据。

### 1. 先更正 33 号：通用基类是 `OverlayPanel`，不是 `HubFrame`

固定快照 65 个直属文件中，继承与内部布局依赖应分开计数：

| 基类 | 数量 | 例 |
|---|---|---|
| `extends OverlayPanel` | **22 个文件、25 个类** | `thinking-selector`、`history-search`、`report-panel`、`cleanse-panel`、`oauth-selector`、`login-dialog`、`logout-account-selector`、`omfg-panel`、`theme-selector` |
| `implements Component`（自有布局） | 若干 | `agents-hub`、`usage-dashboard`、`advisor-config`、`plan-review-overlay`、`btw-history-panel` |
| `extends Container` | 若干 | `agent-hub` |
| 使用 `new HubFrame` | **2 个消费者** | `model-hub`、`agents-hub`；定义自身不计消费者 |

**`HubFrame` 是 model-hub 与 agents-hub 的专用两栏骨架，不是 omp 面板的通用框架。** 已在 [33 §0](33-omp-panel-mapping.md#0-2026-10-17-重要更正hubframe-只有两个生产消费者) 更正。

#### 1.1 `OverlayPanel` 的真实几何（[overlay-box.ts:218-345](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L218)）

```ts
render(width: number): readonly string[] {
  width = Number.isFinite(width) ? Math.max(0, Math.trunc(width)) : 0;
  const innerWidth = Math.max(1, width - 4);       // 左右边框 + 各 1 格内边距
  const result: string[] = [topBorder(width, this.#title)];
  for (let i = 0; i < this.children.length; i++) {
    if (this.children[i] instanceof PanelDivider) { result.push(divider(width)); continue; }
    for (const line of childLines[i] ?? NO_LINES) result.push(row(line, width));
  }
  result.push(bottomBorder(width));
  if (width < 4) { /* 整体截断 */ }
}
```

要点：

| 项 | 值 | 位置 |
|---|---|---|
| 内宽 | `width - 4` | 第 305 行 |
| 上/下边框 | 各 1 行（带标题的 `topBorder`） | 第 333/341 行 |
| 分隔线 | `PanelDivider` 子组件渲染为整行 `divider(width)` | 第 336 行 |
| 子组件接口 | `Component`（`render(width): string[]`） | — |
| 记忆化 | `#memo` 按 `width + title + children + childLines` 失效 | 第 313-321 行 |
| 原生模式 | `describe()` 返回 `NativeNode`（`overlayCard(role, title, children)`） | 第 292-307 行 |

**这就是 Cheers 需要的「通用面板基类」**：`width-4` 内宽 + 上下边框 + 可插分隔线 + 子组件列表。对照 Cheers 的 `chrome/panel.ts`（`MAX_OPTIONS = 8` 硬顶）与 `chrome/modal.ts`（`FRAME_ROWS = 8`）——两者都缺「子组件列表 + 分隔线 + 记忆化」。

#### 1.2 最小完整样例：`/thinking`（可作第一个移植目标）

`ThinkingSelectorComponent`（[thinking-selector.ts:17-70](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/thinking-selector.ts#L17)）**全文只有约 70 行**，是最简单的 `OverlayPanel`：

```ts
export class ThinkingSelectorComponent extends OverlayPanel {
  constructor(currentLevel, availableLevels, onSelect, onCancel) {
    super("Thinking Level", "omp.overlay.thinking");
    const thinkingLevels: SelectItem[] = availableLevels.map(getConfiguredThinkingLevelMetadata);
    this.#selectList = new SelectList(thinkingLevels, thinkingLevels.length, getSelectListTheme());
    const currentIndex = thinkingLevels.findIndex(item => item.value === currentLevel);
    if (currentIndex !== -1) this.#selectList.setSelectedIndex(currentIndex);
    this.#selectList.onSelect = item => onSelect(item.value);
    this.#selectList.onCancel = () => onCancel();
    this.addChild(this.#selectList);
    this.#sheet = new SelectListSheet(this.#selectList, {
      title: "Thinking level", icon: "brain", noun: "levels",
      current: currentLevel ? [currentLevel] : [],
      columns: [{ id: "depth", format: "bar" }],     // 每档的深度渲染为进度条
      decorate: item => item.value === AUTO_THINKING ? undefined
        : { facts: { depth: (THINKING_EFFORTS.indexOf(item.value) + 1) / THINKING_EFFORTS.length } },
    });
  }
  routeMouse(event, line, col) { routeSelectListMouseWithTopBorder(this.#selectList, event, line, col); }
}
```

**可移植要点**：`SelectList(items, visibleCount, theme)` + `onSelect`/`onCancel` + `addChild` + 鼠标路由。`AUTO_THINKING` 档**不渲染 depth 条**（`decorate` 返回 `undefined`）——即「auto 没有深度」，这是一个明确的语义决定。

### 2. 参考组件的真实基类与分组

主代理实测（`grep -m1 'export class'`）：

| # | 命令 | omp 组件 | 真实基类 | 组 |
|---|---|---|---|---|
| 01 | `/hub` | `AgentHubOverlayComponent` | `extends Container` | D |
| 02 | `/agents` | `AgentsHubComponent` | `implements Component` | A |
| 03 | `/usage` | `UsageDashboardComponent` | `implements Component` | B |
| 04 | `/advisor` | `AdvisorConfigOverlayComponent` | `implements Component` | B |
| 05 | `/plan-review` | `PlanReviewOverlay` | `implements Component` | B |
| 06 | `/thinking` | `ThinkingSelectorComponent` | **`extends OverlayPanel`** | B |
| 07 | `/history` | `HistorySearchComponent` | **`extends OverlayPanel`** | B |
| 08 | `/report` | `ReportPanel` | **`extends OverlayPanel`** | B |
| 09 | `/cleanse` | `CleansePanelComponent` | **`extends OverlayPanel`** | B |
| 10 | `/btw` | `BtwHistoryPanel` | `implements Component, Focusable` | D |
| 11 | `/login` | `LoginDialogComponent` | **`extends OverlayPanel`** | C |
| 12 | `/logout` | `LogoutAccountSelectorComponent` | **`extends OverlayPanel`** | C |
| 13 | `/login`（provider 选择） | `OAuthSelectorComponent` | **`extends OverlayPanel`** | C |
| 14 | `/pin` | （`showSessionPinSelector`） | `[未复验]` | C |
| 15 | `/debug` | `DebugSelectorComponent`（`../../debug` 动态 import） | `[未复验]` | B |
| 16 | `/theme` | `ThemeSelectorComponent` | `extends OverlayPanel`（**无生产消费者**） | F |
| 17 | `/extensions` | `ExtensionDashboard`（alt-screen） | `[未复验]` | E |
| 18 | `/omfg` | `OmfgPanelComponent` | **`extends OverlayPanel`** | E |
| 19 | `/model` 浏览 | `model-browser.ts` | `[未复验]` | D |

**组定义**：

| 组 | 含义 | 面板 | 需要的原语 |
|---|---|---|---|
| **A** | 唯一确认用 HubFrame 的新增面板 | `/agents` | P-01 + **P-02** + P-03 + P-05 |
| **B** | 列表/仪表盘 | `/usage` `/advisor` `/plan-review` `/thinking` `/history` `/cleanse` `/debug`；report 是展示原语 | P-01 + P-05 + P-06（扩 panel.ts） |
| **C** | 模态选择器 | `/login` `/logout` `/pin` | P-05 + P-06 + 确认语义 |
| **D** | 自有布局 | `/hub` `/btw` `/model` 浏览 | 各自设计 |
| **E** | 扩展管理能力 | 增强 `/plugin`，`/extensions` 作同一入口别名；`/omfg` 排除 | 真实 extensions owner + P-06，不重建 loader |
| **F** | settings 主题体验 | 候选与预览已接线 | SE-04/T-01/02 复用既有 host.themes |

### 3. 新增原语：P-06 `OverlayPanel` 等价物

#### 3.0 P-06 是什么（回答「P-06 是什么」）

**P-06 是现有 `panel.ts` 的容器能力扩展**，可参考 omp `OverlayPanel` 的边框/分隔/子内容组合。它提供展示外壳，不强制所有 picker 改成继承体系，也不把领域读取和执行塞进容器。

[34 §2](34-panel-conversion-plan.md) 已列了 5 个原语（P-01…P-05），但它们是为**改造已有的 19 个 picker** 设计的——那些 picker 已有「列表模型」，只需去掉行数上限、加两栏/tab/chip。

**有效范围中部分面板并非单一列表**：`/usage` 是仪表盘（多块卡片 + 热力图）、`/advisor` 是左右分栏预览、`/cleanse` 是流式日志、`/plan-review` 是三区焦点循环。它们**没有「选项列表」这个中心概念**，需要的是「**往一个带边框的容器里塞任意子组件**」。

omp 的答案就是 `OverlayPanel`（[overlay-box.ts:218-345](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L218)）：

```ts
export class OverlayPanel implements Component {
  children: Component[] = [];
  addChild(component: Component): void { … }
  render(width: number): readonly string[] {
    const innerWidth = Math.max(1, width - 4);
    const result: string[] = [topBorder(width, this.#title)];
    for (…children…) {
      if (children[i] instanceof PanelDivider) { result.push(divider(width)); continue; }
      for (const line of childLines[i]) result.push(row(line, width));
    }
    result.push(bottomBorder(width));
  }
}
```

**即：一个带标题的边框盒，里面可以放任意 `Component` 列表（含分隔线），内宽恒为 `width - 4`，宽度不变时不重算边框。**

**现有能力与扩展点**（H-01 已否决“必须新建”）——

| 现有 | 形态 | 缺什么 |
|---|---|---|
| `chrome/panel.ts` | 「选项模型 + `MAX_OPTIONS = 8`」 | 只能渲染**列表**，不能放任意子组件；行数硬顶 |
| `chrome/modal.ts` | 按 height 预算的全屏列表，`FRAME_ROWS = 8` 是框架开销 | 没有任意子内容容器；不是固定8行面板 |

**P-06 的验收**：扩展现有 owner，支持标题、子内容、分隔与 footer；宽高由宿主预算，0–3 列/0–2 行也不得溢出。边框可复用缓存，但内容/主题/几何/子节点版本变化都使相应投影失效；参考不是“宽度相同就跳过全部子内容 render”。

**最小用例**：§1.2 的 `/thinking`——`OverlayPanel` + 一个 `SelectList` 子组件，约 70 行。

#### 3.1 P-06 的能力清单

[34 §2](34-panel-conversion-plan.md) 列的 P-01…P-05 **不足以覆盖有效范围的复合内容**——它们是为「改造已有 picker」设计的。实测需要补一个：

#### P-06 面板容器（子组件 + 边框 + 分隔线 + 记忆化）

**目标**：等价 `OverlayPanel`（[overlay-box.ts:218-345](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L218)）。

| 能力 | omp 实现 | Cheers 现状 |
|---|---|---|
| 子组件列表 | `children: Component[]` + `addChild/removeChild/clear` | **无**（picker 是单一模型） |
| 内宽 | `Math.max(1, width - 4)` | `panel.ts` 无此概念 |
| 上下边框（带标题） | `topBorder(width, title)` / `bottomBorder(width)` | `modal.ts` 有 `FRAME_ROWS`，但不可复用 |
| 分隔线 | `PanelDivider` 子组件 → 整行 | **无** |
| 渲染记忆化 | `#memo` 按 `width+title+children+childLines` 失效 | **无** |
| 原生模式 | `describe() → NativeNode` | 不适用 |

**验收**：见 §3.0 和文末生命周期矩阵；`width - 4` 是参考的装饰策略，不应破坏 Cheers 已有 capacity、纯文本降级、Unicode单元格测量与鼠标坐标。

### 4. 逐面板：已复验的要点

#### 4.1 `/thinking`（最简，建议第一个做）

- **数据**：`availableLevels` 来自会话模型的能力（`getAvailableEffortSelectors()`，[selector-controller.ts:2394](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L2394)）；元数据来自 `getConfiguredThinkingLevelMetadata`。
- **档位**：`THINKING_EFFORTS`（`@oh-my-pi/pi-catalog/effort`）**外加** `AUTO_THINKING`。
- **depth 条**：`(THINKING_EFFORTS.indexOf(level) + 1) / THINKING_EFFORTS.length`；**`AUTO_THINKING` 不渲染**。
- **选择副作用**：`setThinkingLevel(level)` + `requestRender()`（[selector-controller.ts:2397-2399](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L2397)）。
- **Cheers 缺口**：`/thinking` 现有 24 行 handler（[thinkingCommandRuntime.ts](../../packages/ts-shell/src/core/commands/thinkingCommandRuntime.ts)），输出 `Thinking effort: … / Model: … / 说明 / syntaxHelp`。**档位已可枚举**（`[low|medium|high|off]`），适合做成 picker。

#### 4.3 `/cleanse`

- **常量**：`SPINNER_INTERVAL_MS = 80`、`MAX_LOG_LINES = 14`（[cleanse-panel.ts:23-24](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/cleanse-panel.ts#L23)）。
- **溢出**：`if (this.#logLines.length > MAX_LOG_LINES) this.#logLines.splice(0, this.#logLines.length - MAX_LOG_LINES)`（第 94 行）——**丢最旧的行**。
- **形态**：`extends OverlayPanel`，**流式**（日志逐行追加）。

#### 4.4 `/login` `/logout`（三个组件）

| 组件 | 用途 | 基类 |
|---|---|---|
| `OAuthSelectorComponent` | provider 选择 | `extends OverlayPanel` |
| `LoginDialogComponent` | 登录对话框 | `extends OverlayPanel` |
| `LogoutAccountSelectorComponent` | 账号选择 | `extends OverlayPanel` |

- **入口**：[builtin-session.ts:683,707,726](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-session.ts#L683) 三处 `showOAuthSelector("login"|"logout", provider?)`。
- **Cheers 缺口**：`/login` `/logout` 是 `authShortcuts.ts` 的快捷命令，无 picker。

#### 4.5 `/report`：omp **没有** `/report` 命令（已复验）

用户的疑问「在 omp 中我怎么没有看到 report 命令」**是对的**。实测：

```text
omp 的 builtin 命令里没有 name: "report"
grep 'name: "report"' slash-commands/builtin-*.ts  →  无命中
```

omp 里存在的是**内部渲染器** `showCommandReport(options: {title, head?, body})`（[command-controller.ts:252](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/command-controller.ts#L252)），由**其他命令**调用，把只读列表显示在转录之外：

| 调用方 | 用途 |
|---|---|
| `ssh-command-controller.ts:386` | SSH 列表 |
| `mcp-command-controller.ts:2748` | MCP 列表 |
| `command-controller.ts:707` | Advisor 状态 |
| `command-controller.ts:770` | 其他只读报告 |

形态：`ReportPanel`（`extends OverlayPanel`，`TEXT_CHROME_ROWS = 5`），文本模式装在编辑器上方，超过 `commandReportRows()` 时切全屏。

**因此不新增或改义 Cheers `/report` 命令**。补的是通用只读结果展示，复用现有 `CommandReport`（`core/commands/report/contract.ts`）、结构化 spans/columns/facts 与 pager/transcript owner。Cheers `PickerOutcome.report` 已有转录、分页、持久化路径（`interactiveMode.ts:981-984`），不能从零再建“报告系统”。如采用参考的短内容 anchored/长内容 fullscreen，是否留转录或落盘必须显式区分；关闭展示不生成 zip、不批准写盘，也不把已有 `/tools` picker 替换为纯报告。

#### 4.6 `/omfg`：把抱怨转成 TTSR 规则（不是「紧急重置」）

`/omfg` 的声明（[builtin-lifecycle.ts:463-474](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts#L463)，**逐字复验**）：

```ts
{
  name: "omfg",
  icon: "rule",
  description: "Forge a TTSR rule from a complaint to stop a recurring behavior",
  inlineHint: "<complaint>",
  allowArgs: true,
  handleTui: async (command, runtime) => {
    const complaint = command.text.slice(`/${command.name}`.length).trim();
    clearSubmittedText(runtime);
    await runtime.ctx.handleOmfgCommand(complaint);
  },
},
```

即：**用户用自然语言抱怨一个反复出现的行为，omp 把它编译成一条 TTSR 规则**（TTSR = 上下文标签/规则系统，见 omp 的 `Rules (TTSR)` 设置组）。

配套 `OmfgPanelComponent`（`extends OverlayPanel`）的状态机（[omfg-panel.ts:14-22](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/omfg-panel.ts#L14)）：

```ts
export type OmfgPanelState =
  | "generating" | "validating" | "confirming" | "saving"
  | "saved" | "rejected" | "aborted" | "error";
```

**与Cheers的关系**：已有`/rules propose <feedback>`提供反馈到提案入口，细节不等于omp整套TTSR。H-06用户已裁决不引入`/omfg`，保留参考状态机作副作用展示对照，不再列为建议或待问项。

#### 4.7 `/theme`：**应挪进 `/settings`**（用户裁决，且与 omp 一致）

用户的判断**正确**。omp 的做法（实测）：

```ts
// packages/coding-agent/src/modes/settings.ts:59-84
export const cfgThemeDark = register({
  id: "theme.dark", type: "string", default: "titanium",
  ui: { tab: "appearance", group: "Theme", label: "Dark Theme",
        description: "Theme used when the terminal has a dark background",
        options: "runtime" },          // ← 候选列表在运行时由宿主注入
});
export const cfgThemeLight = register({
  id: "theme.light", type: "string", default: "light",
  ui: { tab: "appearance", group: "Theme", label: "Light Theme", options: "runtime" },
});
```

**要点**：

1. omp **没有 `/theme` 命令**（已复验，`builtin-*.ts` 无命中），主题**只在 `/settings` 的 `appearance` tab 里选**。
2. `options: "runtime"` 是一个**哨兵值**：声明「候选列表由宿主在运行时提供」（[settings-defs.ts:129,225](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-defs.ts#L129)）。主题候选由 `getAvailableThemes()` 在打开设置时注入（[selector-controller.ts:332-347](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L332)）。
3. 主题**按终端背景分两个槽位**（`theme.dark` / `theme.light`），不是单一字符串——这是 Cheers 的 `theme`（单一 `nameSchema`）没有的维度。

**Cheers 当前现状（2026-10-17 更正）**：`theme` 在 settings Display 组，静态 schema 虽无 enum，但 `picker/settings.ts:73` 会用 `host.themes.names()` 注入候选；`interactiveMode.ts:1070` 已绑定 `themePreferences`，`preview.ts:12-32` 提供可撤销预览租约。只看 CONFIG_SETTINGS 的静态 choices 得出“自由JSON”是漏读宿主注入。

**因此要做的是两件事，不是「新建 `/theme` 面板」**：

| # | 改动 | 说明 |
|---|---|---|
| T-01 | 复用并回归验证主题运行时候选 | 当前已注入 `host.themes.names()`；SE-04 后续工作是其他字段扩面与版本失效，不另建主题枚举 |
| T-02 | 保留主题选择、预览、stage/apply与失败恢复 | 当前 detailOptions 已生成 choice 行；容器改造不得退回 JSON-only 或把预览当保存 |

**原“新建主题 picker”和“候选尚未接线”结论均作废**；按 H-03 完善 settings 内现有体验。

#### 4.8 `/theme` 的参考实现状态（保留原调查）

实测三个 `OverlayPanel` 组件**只有测试引用，无生产消费者**：

```text
ThemeSelectorComponent        → 仅 overlays/theme-selector.ts + packages/tui/test/
QueueModeSelectorComponent    → 仅 overlays/queue-mode-selector.ts + packages/tui/test/
ShowImagesSelectorComponent   → 仅 overlays/show-images-selector.ts + packages/tui/test/
ModelPickerComponent          → selector-controller.ts:791（**有生产消费者**）
```

**且 omp 没有 `/theme` 斜杠命令**（`grep 'name: "theme"' slash-commands/builtin-*.ts` 无命中）。omp 的主题通过 `setTheme()`（[extension-ui-controller.ts:186-188](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/extension-ui-controller.ts#L186)）与 `/settings` 的 `appearance` tab 改动。

**结论**：独立 `theme-selector.ts` 是测试组件参考；产品行为参考应是 settings appearance tab。H-03 已定，勿再把独立主题面板列成待设计项。

#### 4.9 `/extensions`（alt-screen，可移植）

`ExtensionDashboard.create({runtime, terminalHeight, toolSource})`（[selector-controller.ts:612-640](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L612)），注释原文：

> Fullscreen dashboard on the alternate screen (the `/settings` idiom): the overlay borrows the terminal's alt buffer and enables mouse tracking for its lifetime, leaving the transcript untouched underneath.

**Cheers 已有 alt-screen 与宿主生命周期**，但 ANSI常量存在不证明 dashboard 可直接接入。须由现有 surface/overlay owner 管理终端缓冲区、焦点、鼠标、resize及关闭清理；扩展数据复用 `extensions/service.ts` 与真实 commands，不由视图建立新 loader。

#### 4.10 `/btw`（已复验的 Cheers 缺口样例）

Cheers 的错误分支输出（[btwCommandRuntime.ts:43-46](../../packages/ts-shell/src/core/commands/btwCommandRuntime.ts#L43)，**逐字复验**）：

```ts
return {
  kind: "local",
  output: `${parsed.reason}\n${syntaxHelp(btwSyntax)}\nExample: /btw what is the difference between Array.slice and splice in JS?\n\nSide questions provide answers outside your active conversation history.`,
};
```

这证明错误文案较长，不能证明缺少历史、状态或功能；参考 `btw-history-panel.ts` 提供可导航历史视图。Cheers 新面板应接自己的 side-question owner，保留独立历史边界、请求计量、取消与安全失败分类。

该样本不能外推为所有面板的共同缺口；逐领域明确结构化读取与操作端口，再选择状态/帮助的呈现位置。

#### 4.11 `/hub`

`AgentHubOverlayComponent extends Container implements SelectListMouseTarget`（[agent-hub.ts:327](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/agent-hub.ts#L327)）——**不用 HubFrame**（与 33 号原说法相反）。配套三个模块：`agent-hub-renderer`（渲染层，导入 `renderTableRow`/`renderProgressBar`/`formatMetricRow`）、`agent-hub-projection`、`agent-hub-types`。

**Cheers 缺口**：`/hub` 在 Cheers 无 picker，且其 handler 走 `jobsCommand('hub', …)`（`core/commands/jobs/registration.ts`）。

### 4.12 `/settings` 对照：确实粗糙（用户判断正确）

用户说「settings 命令是否对照完成？我看我们现在的 setting 很是粗糙」——**两问都成立**。

#### 4.12.1 覆盖状态与原计数误用

Cheers有36个顶层配置字段，32个设置路径包含29个顶层和3个TUI叶子，粒度不同，旧32/36（89%）覆盖率撤销。参考注册总量也不等于可见UI行数，不能与408/546比较高低。当前能力与实际编辑器见[25](25-model-configuration-and-relays.md)、[30](30-panels-and-model-picker.md)，比较重点是来源、保存、候选与交互行为。

#### 4.12.2 体验对照（实测）

| 能力 | Cheers | oh-my-pi |
|---|---|---|
| 面板代码量 | `picker/settings.ts` **146 行** + `settings.ts` **114 行** | `settings-selector.ts` **2,002 行** + `settings-defs.ts` |
| 字段数 | 32个CONFIG_SETTINGS定义 | 原研究记546注册项，不等于可见UI条数；不据此计算体验差 |
| **tab 分页** | **无**（单列表） | **10 个 tab**（appearance/model/interaction/context/memory/files/shell/tools/tasks/providers） |
| **组内分区** | 仅 `group` 字段拼在 label 前缀（`${group} · ${label}`） | **`TAB_GROUPS`**：每个 tab 声明有序分区（如 tools 有 11 个分区） |
| **模糊搜索** | 只有 1 处 `search`（子串过滤） | `FuzzyCorpus` 每 tab 一个语料 + 跨 tab 聚合结果（`#searchCorpora`） |
| **已改动计数** | **无** | `#changedCount(tab)` 在 tab 上显示改动数（7 处引用） |
| **实时预览** | theme/composer已有；statusItemPicker另有专用preview，但settings调用目前传空回调，尚未等同接线 | preview metadata及对应组件；声明命中数不等于有效预览数 |
| **风险提示** | **无** | `UiBase.warning`：可导致限流/封号的设置行加警示图标（3 处引用） |
| **条件显示** | **无** | `UiBase.condition`：不满足条件时隐藏该行（10 处引用） |
| **候选值说明** | 裸 enum（`Choose <JSON>`） | `options: [{value,label,description}]`，description 可带代价（如「50 KB → ~12.5K tokens」） |
| **运行时候选** | theme 已由宿主注入；其他字段覆盖需逐项确认 | `options: "runtime"` 哨兵（主题候选由宿主注入） |

#### 4.12.3 具体粗糙点（Cheers 侧，逐条）

| # | 现象 | 证据 |
|---|---|---|
| G-1 | **单列表平铺 32 项**，靠 `group · label` 前缀区分 | [picker/settings.ts:137](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L137) |
| G-2 | **有通用子串过滤，缺跨tab fuzzy** | 搜索体验不足不能写成无搜索；SE-02 扩展并复用 OptionModel |
| G-3 | **无 tab**，7 个 group 挤在一起 | `CONFIG_SETTINGS` 的 group 分布：Context 4 / Display 5 / Network 3 / Request 4 / Retries 5 / Session 6 / Tools 5 |
| G-4 | **19/32路径走通用JSON编辑，适配不足** | theme动态候选和statusItems专用picker不能计入；数值/自由列表/对象须各有编辑器，不强行全改enum，见30 |
| G-5 | **候选值缺label/detail元数据** | 静态enum/boolean与theme动态候选都渲染为裸`Choose <value>`；SE-03补说明，不重复枚举 |
| G-6 | ~~无实时预览~~ | **已推翻**（见 [30 §4.0](30-panels-and-model-picker.md)）：Cheers 已有 `settingPreview`，`overlay.ts` 已接线 8 处 |
| G-7 | **无风险提示与条件显示** | 无 `warning` / `condition` 等价物 |

**Cheers必须保留的现有契约**（[25](25-model-configuration-and-relays.md)）：

- **信任门**：`projectTrust` 三级，项目值在信任未建立时被拒并显示 `Project value inactive`；
- **溯源三态**：`Effective / Accepted / Stored`并列（[picker/settings.ts:57-59](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L57)），另保留pending/restart/unknown。参考选择器的单值行不能证明其整个配置系统无来源或信任功能。

旧研究过度强调计数。本次已将编辑器、候选、预览、来源/信任及保存确认补入30/33和本节；这是研究修订，尚未实现新的settings体验。

#### 4.12.4 新增任务

| # | 任务 | 依据 |
|---|---|---|
| SE-01 | 引入 tab 分页（7 个 group → tab） | §4.12.2 |
| SE-02 | 引入模糊搜索（跨 tab） | §4.12.2 |
| SE-03 | 引入候选值说明（`options` 带 label/description） | [25 §5.2](25-model-configuration-and-relays.md) |
| SE-04 | 运行时候选扩面与版本失效；theme已具备，作为复用/回归首例 | §4.7 T-01/T-02 |
| SE-05 | 引入风险提示与条件显示 | §4.12.2 |
| SE-06 | 实时预览**扩展覆盖面**（机制已存在，只认 2 个键） | [30 §4.0](30-panels-and-model-picker.md) |

T-01是SE-04中已有theme候选的复用/回归子项；SE-04还覆盖其他字段及版本失效，不重复建theme机制。

### 5. 待定决策点

#### 已定（2026-10-16 用户答复）

| # | 问题 | 结论 |
|---|---|---|
| **H-02** | `/report` 是什么 | **omp 没有 `/report` 命令**。它是内部渲染器 `showCommandReport()`（§4.5）。真正该做的是引入该能力，让 Cheers 的 `/cost` `/context` `/tools` `/usage` 只读输出走统一面板 |
| **H-03** | `/theme` 怎么办 | **归 `/settings`**（用户裁决）；当前已具备运行时候选和预览，保留并完善（§4.7 T-01/T-02） |
| **H-06** | `/omfg` 是什么 | 参考是反馈到TTSR规则；Cheers已有/rules propose入口但细节并非全等。用户已定不引入 |
| **H-08** | `/settings`是否对照完成 | 本次已补体验与保存契约研究；SE-01…06均纳入Phase20，产品尚未实现/验收 |

#### 后续处置

#### 已定（2026-10-16 用户答复，第二批）

| # | 问题 | 结论 |
|---|---|---|
| **H-01** | P-06 新建还是扩展 | **扩展 `panel.ts`**（不新建） |
| **H-06** | `/omfg` | **不做**；现/rules propose仅是相关入口，不宣称与参考全部语义等价 |
| **H-08** | `/settings` 改造（SE-01…SE-06） | **纳入范围** |
| **H-09** | 本轮顺序 | **先继续一轮深度对照研究**，再动实现 |

#### 后续裁决与技术处置（2026-10-17）

| # | 决策 | 选项 |
|---|---|---|
| H-04 | 3个测试专用selector是否参考 | 可作为组件形状与局部测试证据，不当真实用户消费者或实现范围依据 |
| H-05 | `/extensions` 与 `/plugin` 的关系 | **用户已定（2026-10-17）**：增强现有 `/plugin`，`/extensions` 作同一命令/面板别名；复用运行时，不建平行状态 |
| H-07 | 实施顺序 | 先公共预算/焦点/命中原语及事实端口，再领域面板；同owner成组，具体依赖以Phase20任务表为准，不以参考文件长度排工期 |

#### H-01 的后果：P-06 改为扩展 `panel.ts`

用户裁定**扩展现有 `panel.ts`**。已核对 `renderPanel(model, chrome, width, capacity)`，它是纯渲染 owner，不负责请求、审批、持久化或会话绑定；在该 owner 增加容器能力并拆分局部职责，不往 `OverlayHost` 或 settings 入口堆砌领域行为。完整端口/生命周期是实施前置，不等同于新增一个 class。

### 6. 未验证项

- `/pin`、`/debug`、`/model` 浏览、`/extensions` 的 omp 基类未复验（`debug-selector.ts` 在 `overlays/` 下不存在，实际在 `../../debug` 动态 import 的目标里）。
- 各面板的**完整键位表**未逐一复验（只复验了 §4 列出的常量与组件名）。
- 各面板的**空态文案**未逐字复验。
- 未在真实终端目视对比任何面板。
- `SelectList` / `SelectListSheet` 的完整 API 未读（只读了 `/thinking` 的用法）。
- P-06扩展尚未实施和动态验收；H-01已定扩现有owner，不再开放新建方向。

2026-10-17 处置：H-01 已裁决扩展，且当前签名已复核；尚未实施和动态验收，不再把“必须新建”列为开放方向。

### 7. 子代理产出的处置

历史子代理`PanelSpecsA`/`PanelSpecsB`的未落盘报告不作为当前验收依据。已确认的反例：

| 断言 | 结果 |
|---|---|
| `/hub` 用 HubFrame | **错**（`HubFrame` 在 `agent-hub.ts` 中 0 次命中） |
| `btw-history-panel` 用 HubFrame | **错**（`implements Component, Focusable`） |
| 3 个 selector「fully wired」 | **错**（只有 `test/` 引用） |
| 引用的 omp 路径 | `PanelSpecsA` 8/10 存在；`PanelSpecsB` 6/10 存在 |
| `cleanse-panel` / `report-panel` / `thinking-selector` 的常量与数据源 | ✅ 通过 |

**子代理幻觉的根源是我方文档**：[33](33-omp-panel-mapping.md) 原写「omp 面板共用 HubFrame」，两个子代理据此把 HubFrame 当成所有面板的默认形态。**已在 36 §0 更正**，本文 §1 给出正确的基类分布。

## 生产面板的端口、生命周期与副作用契约

这些是 Phase 20 实施与验收约束，尚非产品实现完成证据。P-06 扩展的是 `presentation/tui/chrome/panel.ts` 的展示能力；领域控制继续由原 owner 实现。现有 `PickerHost` 暴露部分会话/配置端口，`OverlayHost` 已有 generation、load AbortController、unsubscribe、previewEnd；新增任意内容视图仍需明确可替换、可释放的视图契约，不能把仪表盘硬编码成伪 Option 列表。

| 契约 | 必须保留/新增的行为 | 有意义的验收反例 |
|---|---|---|
| 领域端口 | 查询返回带身份/版本的结构化快照；subscribe 返回释放函数；prepare/apply/cancel 分开。使用当前 owner，不解析 `.output` 或展示字符串还原状态 | 文案/颜色变化不影响操作；缺能力返回 unavailable，绝不造默认空列表 |
| 当前绑定 | 捕获 session、workspace、模型/账户/源等实际身份；提交前由 owner 重验，不只在打开时检查 | 面板打开后切会话/目录、撤信任/授权、源或文件换身份：旧操作拒绝或刷新，不落到新对象 |
| 视图生命周期 | 打开、替换、关闭、退出统一释放订阅/计时器/预览；加载支持 AbortSignal，回调带 generation/token；释放幂等，旧回调不关新面板 | 搜索连按、关闭后慢请求返回、旧confirm返回、加载中切tab：不复活旧视图、不覆盖新选择 |
| 加载与数据态 | idle/loading/ready/empty/failed/stale/unavailable 可区分；已加载部分数据不掩盖分页失败；有界分页/缓存，目录版本、主题和授权变化使投影失效 | 网络失败不显示“No items”；重复cursor、十万项、超大预览、快速resize不无界加载或常驻内存 |
| 布局与输入 | 接受 width/height 预算；边框/搜索/footer/确认共同分配，窄窗不溢出。布局、二维命中、焦点和键位共享当前投影 | 0–3列、0–2行、CJK/emoji/ANSI、缩放后旧坐标、隐藏tab项点击：不越界、不误执行 |
| 宿主终端 | anchored/fullscreen 按用途选择，由现有 surface 管理 alt buffer、鼠标跟踪、焦点、光标及异常恢复 | 正常Esc、Ctrl+C、异常退出、嵌套返回均恢复原转录/草稿/焦点，不遗留raw/mouse/alt状态 |
| 副作用 | 选择与预览不构成执行许可；写入/安装/授权/删除/账户reset仍走原prepared-tool、精确审批与执行服务。UI动作有稳定目标和版本 | 单击/过滤/预览不触发网络写或磁盘保存；审批期间状态变化、双击/重复Enter不重复dispatch |
| 结果事实 | preview、pending、denied、cancelled、applied、verified、partial、unknown 分开；视图以owner结果投影，不把resolved Promise/非空文案当成功 | 写后断线、writer-started无回执、清理超时保留unknown；Esc关闭不改成功，重开仍可查receipt |
| 取消边界 | 关闭面板释放视图。取消运行须显式调用原owner并等待其结算；已派发/unknown不能因重试或重开重放 | 请求已派发后Esc、进程终止失败、重入：保留事实，阻止盲重试，不以存储PID杀进程 |
| 预览与持久化 | SE-06复用可撤销lease；取消回到当前已接受值，不覆盖并发新主题；Apply后保留Effective/Accepted/Stored和restartRequired | 预览中外部改配置、Apply失败或unknown、主题文件失效：不把预览留成保存，不还原掉新值 |
| 报告与安全文本 | 复用CommandReport和redaction；长结果分页，非交互保留纯文本/结构化输出；报告显示、转录保留、文件导出分别请求 | 关报告不写zip；provider响应/密钥不进入面板、JSON或日志；纯文本不含控制序列 |

| 面板族 | 拥有数据/操作的现有域 | 需要补齐的端口边界 |
|---|---|---|
| model/thinking/settings | config、provider/model目录、settings draft、theme preferences | 能力过滤/候选版本；requested/accepted/effective分开；禁用项解释原因，不从UI“探测”真实凭据 |
| resume/tree/history/pin | session/navigation/selection 与 SessionManager | current与可选范围、稳定entry/session ID、存储版本、预览分页、pin/rename/delete提交前重验；history不是输入历史 |
| jobs/hub/agents | cli/jobs、workflow/jobs、agent definitions与共享请求账本 | 查询/订阅真实作业树和分页输出；调度/取消仍走原owner；不新建轮询账本或用PID替代执行身份 |
| usage/advisor/plan-review/cleanse/btw | 各自cli/runtime、planning、repair、side-question与request计量 | UI缺口之外，先列结构化读与事件；账户使用/重置、provider请求、修复写入各有独立审批和结算 |
| login/logout/MCP | connection/auth、MCP owner | 认证任务生命周期、取消、失效/离线、回调绑定；面板不接触真实provider配置、不把进入picker当授权 |
| plugin/marketplace | extensions/service、registry、lifecycle、runtime | source/trust/package/grant/activation与durability分别展示；复用当前签名验证/沙箱/审批，安装不是启用，启用不是授权 |
| debug/report展示 | observability、CommandReport、pager/transcript | 有界安全快照、纯文本降级、展示与落盘分离；保留Cheers `/report` zip语义 |

参考决策采用/调整：[omp OverlayPanel](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L263) 的递归invalidate/dispose与[dashboard关闭](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L639)的焦点恢复应保留；参考 memo 只缓存边框包装，不能冻结实时子内容。[pi 8efd314 selector](https://github.com/earendil-works/pi/blob/8efd314fa3d3232ce197d8d7a6a5660530b9d83e/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4898) 的token校验用于阻止旧完成回调关闭新视图，Cheers复用自己的generation机制实现，不搬整套宿主。

实施验证应让这些决定能被反向断言击中：去掉token/取消、去掉提交前版本检查、把unknown映成success、把preview直接持久化、按宽度复用旧命中区域，均须至少有一个有意义的失败场景。本文只修研究，不在此运行产品测试或声称动态通过。

### 原任务编号处置

P-01…P-06 保留且归共享UI地基；N-01/Q-08范围按§4处置；N-02=H-03（settings主题），N-03保留thinking，N-04已有pin，N-05保留现有独有面板，N-06/H-07为工程顺序。SE-01…06保留，SE-04与T-01/02合并但theme首例已具备；H-01/03/06/08/09为已有用户裁决，不能重新询问。

H-04建议仅把测试selector作为技术参考，不当产品事实；可由实施者决定。H-05用户已裁决（2026-10-17）：**增强现有 `/plugin` 工作台，`/extensions` 作同一命令/面板别名**；复用当前扩展runtime、目录、状态与审批，不建平行系统。H-02的通用结果展示为既定技术方向，沿用现有CommandReport，不新增同义命令。其余M/F/D/R/W系列见 [33决策归并](33-omp-panel-mapping.md#2026-10-17-决策归并与生产约束)，引用须携带所在小节避免重复ID歧义。
