---
title: "oh-my-pi 面板逐项研究：命令映射与四个面板族"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/cli/interactive/picker/registry.ts, packages/ts-shell/src/core/commands/registry.ts, oh-my-pi/packages/coding-agent/src/slash-commands/builtin-*.ts, oh-my-pi/packages/coding-agent/src/modes/controllers/selector-controller.ts, oh-my-pi/packages/tui/src/overlays/, oh-my-pi/packages/tui/src/overlays/hub-frame.ts, oh-my-pi/packages/tui/src/chrome/overlay-box.ts, 30-panels-and-model-picker.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, slash-commands, panels, oh-my-pi, mapping, gap-analysis]
summary: "源码复核：Cheers 102 个主命令入口、omp 85 个 builtin 主命令；58 个同名交集。旧参考直属 overlay 为 65 个文件，HubFrame 仅 model/agents 两个生产消费者；22 个文件含 25 个 OverlayPanel 子类。保留四个面板族规格，统一旧决策编号、生命周期与实现证据边界。"
confidence: high
---

# Slash 命令面板逐项对照：命令映射

只读研究。未修改产品源码。源码基线 Cheers `0d30d589`；参考 oh-my-pi `c2cb79e4`。

**2026-10-17 复核口径**：Cheers 基线完整 SHA 为 `0d30d589ec9023ed24e0794c1215f70398bc418d`；下文参考规格固定为 [oh-my-pi c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4](https://github.com/can1357/oh-my-pi/tree/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4)，不是当前参考 HEAD `eb74cf84`。本次用 TypeScript AST 读取该旧快照七个 `BUILTIN_*_SLASH_COMMANDS` 根数组，确认 **85 个唯一主命令**；未把子命令的 `name`、alias、方法数或文件大小当成功能数。本次没有运行新的 TUI/PTY 验收。

本文是**映射与结构对照**，并在文末合并了四个面板族的逐字段细节（共用框架与尺寸策略、模型与设置面板、会话与树面板、任务/用量/复制/工具面板）。

## 1. 命令全集与交集（实测）

| 侧 | 顶层命令数 | 提取方式 |
|---|---|---|
| Cheers | **102个静态声明主入口** | 71直接定义 + 30工厂定义 + picker-only/back；实际可见集合受scope/availability影响，见37 |
| oh-my-pi | **85** | 固定快照七个 `BUILTIN_*_SLASH_COMMANDS` 根数组的唯一主名，按 AST 提取 |

交集 **58 个同名命令**：

```text
advisor agents browser btw changelog cleanse clear collab compact context copy
debug delete dump exit export extended-context fast force fork fresh git goal
guided-goal hub jobs live login logout loop marketplace mcp memory model
modelpreset open pin plan plan-review queue record rename restart resume retry
security settings shake share skillful slow ssh todo tools trace tree usage wt
```

按主命令名比较，Cheers 独有44、omp独有27（§6）。语义对应还须核对alias/named invocation与owner；不能把主名不同当成能力不存在，亦不能把同名当成同一行为。

## 2. 面板映射索引（同名与语义对应）

「omp 面板」列记录 handler 或控制器打开的组件。此表包含语义对应项，并非 58 个同名命令的逐项清单；同名也不保证语义相同。文件字节数是原研究快照的定位信息，不是当前工作树重新测量的结果，不用于衡量能力完整度、生产质量或 Cheers 的交付工作量。

| # | 命令 | Cheers 面板 | omp 面板 | 对照价值 |
|---|---|---|---|---|
| 01 | `model` | `picker/model.ts` (3.6 KB, panel) | **`model-hub.ts` (158 KB)** | **最高** |
| 02 | `resume` | `picker/session.ts` (6.2 KB, modal) | **`session-selector.ts` (74 KB)** | **最高** |
| 03 | `tree` | `picker/tree.ts` (1.4 KB, modal) | **`tree-selector.ts` (63 KB)** | **最高** |
| 04 | `settings` | `picker/settings.ts` (9.5 KB) | **`settings-selector.ts` (70 KB)** | **最高** |
| 05 | `hub` | 无 | **`agent-hub.ts` (96 KB)** | 高 |
| 06 | `agents` | 无 | **`agents-hub.ts` (67 KB)** | 高 |
| 07 | `usage` | 无 | **`usage-dashboard.ts` (71 KB)** + `reset-usage-selector.ts` | 高 |
| 08 | `copy` | `picker/copy.ts` (2.1 KB, panel) | **`copy-selector.ts` (43 KB)** | 高 |
| 09 | `marketplace` | `picker/sources.ts` (2.5 KB) | `plugin-selector.ts` (4.6 KB) | 中 |
| 10 | `mcp` | `picker/servers.ts` (2.2 KB) | `mcp-add-wizard.ts` (61 KB) | 中 |
| 11 | `login` / `logout` | 无（`connect` 有 picker） | `oauth-selector.ts` (23 KB) | 中 |
| 12 | `debug` | 无 | `debug-selector` | 中 |
| 13 | `git` | `picker/git.ts` (6.1 KB) | `GitUi` | 中 |
| 14 | `fork` | `picker/tree.ts`（复用） | `tree-selector` 路径 | 中 |
| 15 | `modelpreset` | 已有 session 命名预设及角色命令，无独立 picker（[preset.ts:37](../../packages/ts-shell/src/core/commands/model/preset.ts#L37)） | `model-hub.ts` 的 role/preset 视图（附二 A.7） | 低 |
| 16 | `extensions`（omp）/ `plugin`（Cheers） | `picker/plugins.ts` (2.5 KB) | `extensions-dashboard` | 低 |
| 17 | `session`（omp）/ `resume`（Cheers） | 同上 | `session-pin-selector.ts` | 中 |
| — | `tools` | `picker/tools.ts` (1.6 KB) | 无面板 | Cheers 独有 |
| — | `permissions` | `picker/permissions.ts` (1.8 KB) | 无面板 | Cheers 独有 |
| — | `skill` / `skills` | `picker/skills.ts` (1.8 KB) | 无面板（文本） | 平手 |
| — | `help` | `picker/help.ts` (2.0 KB) | `hotkeys`（文本） | Cheers 独有 |
| — | `statusline` | `picker/statusItems.ts` (2.0 KB) | `settings` 内 | 平手 |
| — | `undo` / `back` | `picker/undo.ts` / `rewind.ts` | `rewind-selector.ts` (41 KB) | 中 |
| — | `advisor` | 无 | `advisor-config.ts` (64 KB) | 高 |
| — | `todo` | 无 | 文本 + HUD | 低 |
| — | `jobs` | 无 | `jobs-panel.ts` (14 KB) | 中 |
| — | `browser` | 无 | 无（状态文本） | — |
| — | `plan-review` | 无 | `plan-review-overlay.ts` (71 KB) | 高 |
| — | `security` | 无 | 文本 | — |

**结论**：上述索引提供参考入口；有效实施范围以 [35 的当前清单](35-panel-inventory-full.md#4-对照结论哪些命令-cheers-缺面板) 为准。`/report` 是不同语义，主题并入 settings，`/omfg` 已取消，不能从“17 组”直接推导 17 个新组件。

## 3. model / agents 两个 hub 共用 HubFrame

omp 的 `model-hub` 与 `agents-hub` 两个消费者共享几何组件 `HubFrame`（[hub-frame.ts:138-190](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L138)）；`agent-hub` 不使用它。本文后续几何细节仅适用于这两个消费者。

```ts
readonly #frame: HubFrame = new HubFrame(
    "Models",
    { min: 18, max: 26 },              // sidebar 宽度上下界
    (width, rows) => this.#renderSidebar(width, rows),
    this.#renderBodyPane,
    { bodyMinWidth: MODEL_HUB_BODY_MIN_WIDTH, preserveSidebar: true },  // = 28
);
```

```ts
readonly #frame: HubFrame = new HubFrame(
    "Agents",
    { min: 16, max: 24 },              // 每个 hub 自己的边界
    (width, rows) => this.#frame.renderSidebar(...),
    this.#renderBodyPane,
```

`HubFrame` 固定为**五行 Stack**（[hub-frame.ts:180-190](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L180)）：

| 区域 | 高度 |
|---|---|
| top（带标题的圆角上边框） | 1 |
| split（sidebar 固定宽 + body 弹性） | grow: 1 |
| divider（`┴` 分隔线） | 1 |
| footer（chip strip 或提示） | 1 |
| bottom（圆角下边框） | 1 |

两侧几何由 `overlay-box.ts` 精确给出（[overlay-box.ts:64-101](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L64)）：

```ts
export function splitBodyWidth(width: number, sidebarWidth: number): number {
	return Math.max(0, width - sidebarWidth - 7);
}
```

即 `│ sidebar │ body │`，分隔符列位于 `sidebarWidth + 3`，body 内容宽 = `width - sidebarWidth - 7`。

**Sidebar 宽度自适应**（[hub-frame.ts:198-206](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L198)）：取所有条目 `label + annotation + 5` 的最大值，再钳到该 hub 声明的 `{min, max}`。窄屏时若 `preserveSidebar`，会降低 body 下限以保住 sidebar 可用（[hub-frame.ts:344-350](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L344)）。

**Footer chips**（[hub-frame.ts:280-310](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L280)）：可点击的横向 chip 条，选中项渲染为 `[ … ]` 并记录鼠标命中范围；`moveStripSelection` 支持 ←/→/↑/↓/Tab/Shift+Tab 循环（同文件 51-59 行）。

### 3.1 Cheers 侧的对照事实

| 维度 | Cheers | oh-my-pi |
|---|---|---|
| 面板框架 | 19 个命令映射，共用 `OverlayHost`、`OptionModel` 与 panel/modal 渲染器 | model/agents 共用 `HubFrame`；其他面板采用多种布局 |
| 两栏布局 | **无** | sidebar + body，几何固定 |
| Footer chips | 单一提示行 | 可点击 chip 条 + 鼠标命中 |
| 行数上限 | panel 的单行候选至多 8 项；modal 另按高度与每项行数预算 | 两个 HubFrame 消费者按分配高度布局 |
| 标题栏 | panel 为无边框标题行；modal 已有边框 | 两个 hub 为圆角边框 + `┬` 分栏标题 |

panel 的 8 项上限与 `capacity` 同时生效；候选充足且预算至少 11 行时可形成“标题1 + 候选8 + overflow1 + footer1”的 11 行样本。小预算、空列表和无 overflow 时不是 11 行，真实 `capacity` 由 surface 扣除其他界面后分配，不能写成所有终端或所有 picker 恒定 11 行（见 [30 §1](30-panels-and-model-picker.md#1-面板尺寸预算)）。

## 4. 参数形态对照（回应「子参数太多」）

omp 的参数模型是**声明式且克制**的（[slash-commands/types.ts:25-34](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/types.ts#L25)）：

```ts
/** Declarative subcommand definition for commands like /mcp. */
export interface SubcommandDef { name: string; description: string; usage?: string; }
/** Static inline hint when command takes a simple argument (no subcommands). */
inlineHint?: string;
```

声明与展示层对照（历史计数的边界见 [24](24-slash-completion-defects.md)）：

| 项 | Cheers | oh-my-pi |
|---|---|---|
| 动作与参数声明 | 已有 `CommandSyntax`，由各 handler/解析端消费；旧 44/62 扫描不再作为当前覆盖率 | 部分主命令声明 `subcommands`，不是每个命令都需要动作列表 |
| 单行短提示 | 已有 `argumentHint`；24 的历史 85 项样本中 82 项由语法派生，问题是展示冗长与剩余声明一致性 | 简单参数用 `inlineHint`；与动作帮助分开表达 |
| 参数准入 | 保留当前解析、错误反馈及 alias 参数语义，不能由 hint 是否存在推断可执行性 | `allowArgs` 是声明元数据，仍须核对具体 handler |

**`/resume` 是决定性样本**：

| 侧 | 声明 |
|---|---|
| oh-my-pi | `inlineHint: "[session id\|@claude\|@codex]"`，**零子命令**（[builtin-lifecycle.ts:372-378](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts#L372)） |
| Cheers | `resumeSyntax` 暴露 **15 个动作**：`(default) panel list current switch fork rename delete pin history import open shake new help` |

即 omp 把会话管理拆到独立的 `/session`（3 个子命令）与 `/fork`（3 个子命令），而 `/resume` 只留「给一个 id」。Cheers 把全部 15 个动作塞进一棵树。

## 5. 会话选择器：omp 的搜索设计（可迁移）

`session-selector.ts` 的搜索有两个**带成本论证**的决定（[session-selector.ts:280-296](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L280)）：

1. **每会话 haystack 缓存一次**，挂在 entry 对象上随列表一起消亡。注释明写：每次按键重建（约 4 KB 字符串拼接 + `toLowerCase`）是「让 resume 搜索明显卡顿」的开销之一。
2. **不预建 fuzzy 索引**：约 60 KB/4 KB 会话，数千会话会占数百 MB；改为每次扫描访问时临时构建。
3. **字面命中走快路径**：`isLiteralMatch` 命中则完全跳过 fuzzy 打分，按最近使用排序。
4. **预览防抖**：`PREVIEW_SETTLE_MS = 60`，避免按住 ↓ 时刷屏（[session-selector.ts:126](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L126)）。
5. **行高可变且记忆化**：有标题 4 行、无标题 3 行（[session-selector.ts:1254-1262](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1254)）。
6. **时间分组**：Pinned / Today / Yesterday / This week / Earlier（[session-selector.ts:132-141](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L132)）。
7. **范围切换**：Tab 在「当前目录 / 全部项目」间切换（[session-selector.ts:1680-1686](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1680)）。

Cheers 的 `picker/session.ts` 是 modal 单列表，`detailRows: 2` 交给 modal 按每项 4 行的预算计算容量；已有通用子串过滤、重命名/删除、增量加载及未完成状态，session 元数据也已有 pinned 标记。缺少的是参考式搜索排序、时间分组、选中详情预览、面板内置顶操作与显式范围切换，不能概括为没有搜索、分页或 pin 能力。

## 6. 独有命令清单（不做面板对照）

**Cheers 独有 44**：`back brainstorm cancel cd commit connect continue cost crash deep-research diagnose director entries handover help history hotkey import improve init log metrics permissions plugin pwd reload report restore review rules shell sidebar skill statusline theme thinking timings trust undo view warmup web-research workflow workspace`

**omp 独有 27**：`add-dir branch computer dirs effort extensions handoff hotkeys join leave move new omfg pause plugins prewalk quit ratchet reload-plugins remove-dir session setup skills stats switch tan vibe`

注意：`extensions`/`plugins`/`session`/`switch`/`skills`/`stats`/`hotkeys` 在 omp 独有，但 Cheers 有语义对应（`plugin`/`marketplace`/`resume`/`model`/`skill`/`usage`/`hotkey`），已在 §2 表内标注。

## 7. 原决策编号（当前状态见文末归并）

| # | 决策 | 选项 |
|---|---|---|
| M-01 | 共享面板框架 | 已定 P-06 扩展现有 panel.ts，保留 modal；不复制 HubFrame 或新建平行容器 |
| M-02 | 两栏布局 | 已纳入 model/resume/settings/tree/agents，按实际内容及最小正文预算退化 |
| M-03 | sidebar 宽度策略 | 按内容测量并钳到 consumer 声明的边界；参考 +5 不作为跨终端固定常数 |
| M-04 | footer chip 条与鼠标命中 | 已纳入 P-04/UI-03，二维命中随当前帧重建，保留键盘与纯文本降级 |
| M-05 | 实施顺序 | 由公共预算/命中/领域端口依赖安排，不能从 §2 文件大小决定顺序 |
| M-06 | 参数展示模型 | 复用现 CommandSyntax 生成短 usage、help 和补全；见 [24](24-slash-completion-defects.md) S-03/P-04 |
| M-07 | `/resume` 语法边界 | 保留原语法和直接入口，简化 UI；本期不因参考分界新增 `/session` 命令族 |

## 8. 未验证项

- omp 各面板的**逐字段**细节（尺寸常量、按键、空态）见本文各「附：」小节。
- 本轮已核对 Cheers `picker/settings.ts:133` 与 `picker/git.ts:10` 的 panel，以及 `picker/undo.ts:10` 的 modal；未取得这些面板本轮真实终端交互证据。
- omp 的 `debug-selector`、`GitUi`、`extensions-dashboard` 未逐一读取源码。
- 未在真实终端目视对比两侧面板。

---

## 附：oh-my-pi 面板逐项研究（一）：共用框架与尺寸策略

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`；Cheers 基线 `0d30d589`。

本文比较共享几何与数据视图的职责。Cheers 当前有 19 个命令到 picker 的映射，共用 `OverlayHost` 与 panel/modal；参考也不是全部使用同一容器。逐命令的对应关系见本文 §2，几何对照见本附录 §7。

### 0. 2026-10-17 重要更正：HubFrame 只有两个生产消费者

**旧文把文本命中数当成消费者数，是统计错误**。对固定快照 AST 与 `new HubFrame` 位置复核：

| 使用 HubFrame 的 overlay | 数量 |
|---|---|
| `model-hub.ts`、`agents-hub.ts` | **2 个生产消费者** |
| `hub-frame.ts` | 定义，不计消费者 |

旧快照 `packages/tui/src/overlays/` 直属 `.ts` 文件为 **65** 个。以下是不同口径，不能相加作为互斥分布：

| 基类 | 数量 |
|---|---|
| 包含 `extends OverlayPanel` 的文件 | **22 个文件，25 个类** |
| 使用 `new HubFrame` 的文件 | **2**（内部布局依赖，与继承类别不互斥） |
| 其他文件 | 含组件、投影、类型、数据和辅助件，不能统称可打开面板 |

例如 `agent-hub.ts:327` 是 `extends Container implements SelectListMouseTarget`，`btw-history-panel.ts:120` 是 `implements Component, Focusable`，`advisor-config` / `usage-dashboard` / `plan-review-overlay` 都**不**用 HubFrame。

**结论修正**：HubFrame 是 **model / agents 的布局骨架**；`OverlayPanel` 覆盖 22 个文件中的 25 个类。两者解决不同职责，不应把继承一个基类作为 Cheers 的设计要求。下文几何限定于两个 hub；Cheers 按已定 P-06 扩展自身 `panel.ts`，保留其 `capacity` 预算和现有 picker 契约。

---

### 1. HubFrame：model-hub 与 agents-hub 的骨架

`HubFrame`（[hub-frame.ts:138-190](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L138)）是持久化的三段式框架，构造签名：

```ts
constructor(
    title: string,
    sidebarBounds: { min: number; max: number },
    renderSidebar: (width: number, rows: number) => string[],
    renderBody: (width: number, height: number | undefined) => readonly string[],
    options: { bodyMinWidth?: number; preserveSidebar?: boolean } = {},
)
```

内部是固定五行的 `Stack`（[hub-frame.ts:180-190](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L180)）：

| 槽位 | 高度 | 内容 |
|---|---|---|
| `#top` | 1 | 圆角上边框 + 标题 + `┬` 分栏 |
| `#split` | `grow: 1` | 左 sidebar（固定列宽）/ 右 body（弹性） |
| `#divider` | 1 | `┴` 分栏分隔线 |
| `#footer` | 1 | chip 条或提示 |
| `#bottom` | 1 | 圆角下边框 |

**要点**：面板高度不自行决定，而是**撑满交给它的全部行**——`#split` 是唯一的弹性槽。这与 Cheers 的 `MAX_OPTIONS = 8`（自行封顶）是根本不同的设计取向。

### 2. 两栏几何（精确）

`overlay-box.ts` 给出算术（[overlay-box.ts:64-101](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L64)）：

```ts
/** Body content width for a two-column overlay of total `width`. */
export function splitBodyWidth(width: number, sidebarWidth: number): number {
	return Math.max(0, width - sidebarWidth - 7);
}
```

```ts
function splitDividerCol(sidebarWidth: number): number {
	return sidebarWidth + 3;
}
```

每行渲染为（同文件 100-105 行）：

```ts
export function splitRow(sidebar: string, body: string, width: number, sidebarWidth: number): string {
	const box = theme.boxRound;
	const bodyWidth = splitBodyWidth(width, sidebarWidth);
	const bar = paint(box.vertical);
	return `${bar} ${sidebarWidth > 0 ? padToWidth(sidebar, sidebarWidth) : ""} ${bar} ${bodyWidth > 0 ? padToWidth(body, bodyWidth) : ""} ${bar}`;
}
```

屏幕形状：

```text
╭─ Models ────────────┬──────────────────────╮
│ ❯ chat   provider   │ body content         │
│   judge  provider   │                      │
├─────────────────────┴──────────────────────┤
│ [chip] [chip] [chip]                       │
╰────────────────────────────────────────────╯
```

固定开销为 **7 列**：2 个边框列 + 2 个内侧空格 + 3 个分隔区列。sidebar 内容区恰为 `sidebarWidth` 列。

### 3. Sidebar 宽度：内容自适应 + 每 hub 上下界

宽度不是常量，而是按内容测量后钳位（[hub-frame.ts:198-206](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L198)）：

```ts
/** Measure labels and annotations within this hub's sidebar width bounds. */
sidebarWidth(entries: readonly SidebarEntry<string>[]): number {
	let longest = 0;
	for (const entry of entries) {
		longest = Math.max(longest, visibleWidth(entry.label) + visibleWidth(entry.annotation ?? "") + 5);
	}
	return Math.max(this.#sidebarBounds.min, Math.min(this.#sidebarBounds.max, longest));
}
```

实测各 hub 声明的边界：

| Hub | `sidebarBounds` | `bodyMinWidth` | 出处 |
|---|---|---|---|
| Model hub | `{ min: 18, max: 26 }` | `28`（`MODEL_HUB_BODY_MIN_WIDTH`） | [model-hub.ts:483-486](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L483) |
| Agents hub | `{ min: 16, max: 24 }` | 未声明 | [agents-hub.ts:264-266](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/agents-hub.ts#L264) |
| Advisor config | `min 22ch / max 42ch / basis 0.34` | — | [advisor-config.ts:916](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/advisor-config.ts#L916) |

`+5` 的构成：光标列 1 + 空格 1 + icon 1 + 空格 1 + 右侧余量 1（对照 [hub-frame.ts:253](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L253) 的 `left = cursor + icon + label`）。

### 4. 窄屏降级：保住 sidebar

`preserveSidebar: true` 时，右侧最小宽会被压低以换取 sidebar 可用（[hub-frame.ts:344-350](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L344)）：

```ts
min: this.#preserveSidebar ? this.#sidebarBounds.min : undefined,
...
const rightMinWidth = Math.max(0, Math.min(this.#bodyMinWidth, splitWidth - this.#sidebarBounds.min));
```

`SplitPane` 的判定条件是「总宽 ≥ `splitAt` **且** 剩余空间 ≥ `leftMinimum + rightMinWidth`」（[split-pane.ts:255](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/layout/split-pane.ts#L255)）——空间不足时**整体退化为单栏**，而不是把两栏挤坏。

### 5. Footer chip 条与鼠标

`renderChips`（[hub-frame.ts:288-315](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L288)）渲染可点击的横向 chip，并记录命中范围：

```ts
const selected = i === strip.index;
const body = ` ${chip.styled} `;
const rendered = selected
	? theme.bg("selectedBg", `${theme.fg("accent", "[")}${body}${theme.fg("accent", "]")}`)
	: body;
```

- 选中项加 `[ ]` 括注与背景色。
- 溢出时前缀 `… `。
- `selectChipAt`（同文件 213-222 行）按列命中设置 `strip.index`。
- `moveStripSelection`（同文件 51-59 行）支持 ←/↑/Shift+Tab 与 →/↓/Tab 双向循环。

### 6. Sidebar 行渲染

`renderSidebar`（[hub-frame.ts:244-277](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/hub-frame.ts#L244)）每行：

```ts
const cursor = active && selection.focused ? theme.fg("accent", theme.nav.cursor) : " ";
const left = `${cursor} ${decoration.icon} ${label}`;
// 右对齐 annotation：left + 空格填充 + annotation
if (leftWidth + annWidth + 1 <= width) {
	line = `${left}${" ".repeat(width - leftWidth - annWidth)}${decoration.annotation}`;
} else {
	line = truncateToWidth(left, width);
	...
}
```

- `kind: "separator"` 的条目渲染为整宽 `─` 分隔线（同文件 247-250 行）。
- 三种样式状态：`muted`（dim）、`active + focused`（bold + accent + 光标）、`hovered`（背景色）。
- 注释右对齐；放不下时**先截断标签**再考虑 pad。

### 7. Cheers 侧对照

| 维度 | Cheers | oh-my-pi |
|---|---|---|
| 框架 | 19 个命令映射共用 OverlayHost 与 panel/modal 渲染器 | 此列仅 model/agents：共用 `HubFrame` |
| 高度 | panel 的候选数受 8 项和 `capacity` 双限（[panel.ts:45](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L45)）；modal 独立计算 | 两个 hub 撑满分配行数 |
| 两栏 | 无 | `width - sidebar - 7` |
| sidebar 宽度 | 无此概念 | 内容测量 + 每 hub min/max |
| footer | 单行提示（[panel.ts:118-128](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L118)） | 可点击 chip 条 + 鼠标命中 |
| 边框 | panel 形式无边框；modal 形式有 | 统一圆角边框 + `┬`/`┴` 分栏 |
| 窄屏降级 | `capacity === 1` 只渲染 footer | preserveSidebar 时压缩 body 下限；不等于整体单栏 |
| 全屏判定 | `form === "modal"`（[overlay.ts:126-128](../../packages/ts-shell/src/cli/interactive/overlay.ts#L126)） | 每个面板自行声明 |

#### 7.1 Cheers panel 的显式容量样本

| 显式传入的 `capacity` | 条件 | 源码可推导的 panel 行数 |
|---|---|---|
| 18 | 至少 9 个单行候选，需显示 overflow | **11** |
| 34 | 同上 | **11** |
| 54 | 同上 | **11** |

当前公式为 `listRows = Math.min(MAX_OPTIONS, Math.max(0, capacity - (overflow ? 3 : 2)))`（[panel.ts:45](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L45)）。这些是显式容量样本，不对应固定终端高度；`height - 6` 不是 surface 的通用合同。`capacity` 为 0/1 时分别为空/footer；不足 11 时继续受预算钳制，候选少或无 overflow 也会更短。本次仅按源码核对，没有重跑历史渲染实验。

#### 7.2 Cheers modal 形式不受此限

`renderModal`（[modal.ts:36](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts#L36)）按 `height` 计算：

```ts
const perOption = 2 + Math.max(0, chrome.detailRows);
const listRows = Math.max(perOption, height - FRAME_ROWS - statusRows.length);
const capacity = Math.max(1, Math.floor(listRows / perOption));
```

原研究的 200 项、`detailRows: 2` 样本在无额外 status 行时为 24 行→4 项、40 行→8 项、60 行→13 项，与当前容量公式一致；有 status 时仍须扣除其行数。modal 随高度增长，不能从 panel 的 8 项上限推导其容量；本轮未重跑该样本。

### 8. 可迁移结论

| # | 结论 | 证据 |
|---|---|---|
| C-01 | 面板高度应由外层分配驱动，不由面板自封顶 | §1 vs §7.1 |
| C-02 | 两栏（sidebar + body）是 omp 多个 hub 的共同形态，几何为 `width - sidebar - 7` | §2 |
| C-03 | sidebar 宽度应内容自适应并钳到每面板上下界（参考 `+5`） | §3 |
| C-04 | Cheers 的窄屏目标是退化单栏并保留焦点/内容；参考 HubFrame 的 preserveSidebar 实际会压缩 body 下限，不是这一目标的实现证明 | §4；设计选择 |
| C-05 | footer 可做成可点击 chip 条并记录鼠标命中 | §5 |
| C-06 | 行渲染应支持 图标 + 标签 + 右对齐注释 + 分隔线 + 三态样式 | §6 |

### 9. 原决策编号（当前状态见文末归并）

| # | 决策 | 选项 |
|---|---|---|
| F-01 | 共享容器 | 已定扩展 panel.ts，P-06/UI-02；不新建等价巨类 |
| F-02 | 两栏 consumer | model/resume/settings/tree/agents 已纳入；其他面板按事实需求选主从或单栏 |
| F-03 | sidebar min/max | 实施者按每域内容和窄屏预算确定，需有 0 尺寸/最小正文反例，不再列产品方向阻塞 |
| F-04 | chip 与鼠标命中 | 已纳入；列矩形、stable ID、focus 与 viewport 同代重建 |
| F-05 | 边框与符号 | 沿当前主题/终端能力降级；不强制全局圆角，不另造主题体系 |

### 10. 未验证项

- 未实测 `SplitPane` 在极窄宽度下的退化行为（仅读判定条件）。
- `Stack`/`PanelRows` 的 memo 失效策略未逐行核对。
- 未在真实终端渲染 omp 面板做像素级比对。
- 除 model / agents / advisor 外的 hub 是否也声明 `sidebarBounds`，未全部提取。


---

## 附：oh-my-pi 面板逐项研究（二）：模型与设置面板

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`；Cheers 基线 `0d30d589`。逐字段报告格式：打开命令 / 布局 / 尺寸 / 导航 / 搜索 / 分组 / 行渲染 / 动作 / 空态。

---

### A. `/model` — ModelHub

#### A.1 打开路径

| 步骤 | 位置 |
|---|---|
| 命令声明 | [builtin-modes.ts:454](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-modes.ts#L454) `name: "model"` |
| 控制器 | `showModelSelector` → `#showModelHub({})`（[selector-controller.ts:722-728](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L722)） |
| 组件 | `ModelHubComponent`（`model-hub.ts`，**157,873 字节**） |
| 另一入口 | `alt+p` / `/switch` → `#showModelPicker()`（`model-picker.ts`，18,316 字节，浮动底部对齐） |

即 omp 把「换模型」分成两个面板：**完整 hub（/model）** 与 **轻量 picker（alt+p）**。

#### A.2 布局

两栏 `HubFrame`（见 本文「共用框架与尺寸策略」）：

- **sidebar**：provider 列表（`entry.kind === "provider"`），含 locked provider 分支；另有 `kind === "roles"` 条目进入 roles 视图。
- **body**（[model-hub.ts:471-483](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L471)）：

```ts
#renderBodyPane = (width: number, height: number | undefined): readonly string[] => {
	const rows = Math.max(1, Math.floor(height ?? 10));
	const lines: string[] = [this.#statusRow(width)];
	const entry = this.#activeEntry();
	if (entry.kind === "roles" && this.#assigning === null) {
		lines.push(...this.#renderRolesView(width, rows - 1));
	} else if (entry.kind === "provider" && entry.locked && this.#assigning === null) {
		lines.push(...this.#renderLockedView(entry, width, rows - 1));
	} else {
		lines.push(this.#renderModelKindTabs(width));
		this.#browser.setMaxVisible(rows - 2 - 5);
		...
	}
```

即 body 依次为：状态行 → kind tabs → 浏览器列表。**关键**：`setMaxVisible(rows - 2 - 5)` —— 可见行数由**实际分配高度**算出，不是常量。

- **footer**：chip 条（`StripState`）。

#### A.3 尺寸

| 项 | 值 | 出处 |
|---|---|---|
| sidebar 宽 | `{ min: 18, max: 26 }`，按内容测量 | [model-hub.ts:483](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L483) |
| body 最小宽 | `MODEL_HUB_BODY_MIN_WIDTH = 28` | [model-hub.ts:78](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L78) |
| 列表可见行 | `rows - 2 - 5` | [model-hub.ts:481](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L481) |
| `preserveSidebar` | `true` | 同 486 行 |
| provider 刷新防抖 | `PROVIDER_REFRESH_DEBOUNCE_MS = 120` | [model-hub.ts:318](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L318) |
| 最近使用上限 | `RECENT_LIMIT = 15` | 同 319 行 |

#### A.4 分组：两层 tab

**Kind tabs**（[model-hub.ts:355](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L355)）：

```ts
const MODEL_KIND_TABS: ReadonlyArray<"all" | ModelKind> = ["all", ...MODEL_KINDS];
```

`MODEL_KINDS`（[catalog/src/types.ts:29-40](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/catalog/src/types.ts#L29)）：

```text
chat tiny image tts stt search judge embedding rerank video
```

标签渲染（[model-hub.ts:2474-2482](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L2474)）：`Kind: [All][Chat][Tiny]…  alt+←/→`，用 `renderSegmentTrack` 画分段轨道。

**Role tabs**（[model-hub.ts:356](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L356)）：

```ts
const ROLE_TABS = ["all", "chat", "kind"] as const;
```

Roles 视图把模型分配到角色（advisor / judge 等），含 `+ New role…` 行。

#### A.5 导航与快捷键

| 键 | 行为 | 出处 |
|---|---|---|
| `Alt+←/→` | 循环当前可见的 tab 条（roles 视图循环 role tabs，其他视图循环 kind tabs） | [model-hub.ts:1999-2007](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L1999) |
| `Ctrl+←/→` | 循环 preset（`#moveModelKind` 的另一路） | [model-hub.ts:1897-1901](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L1897) |
| `p` / `Shift+P` | 输入 preset 查询（有查询时不切 preset） | [model-hub.ts:2492-2496](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L2492) |
| 任意键入 | 聚焦到浏览器搜索 | [model-hub.ts:431](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L431) |
| 鼠标 | sidebar 悬停高亮、chip 命中 | `#sidebarHover`、`selectChipAt` |

注释明确说明为何用 `Alt+←/→` 而非 `Ctrl+←/→`：后者在某些终端不可用（[model-hub.ts:1999-2000](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L1999)）。

#### A.6 搜索

- 浏览器持有一个 fuzzy 语料 `#catalogCorpus: { items, corpus: FuzzyCorpus<Model> }`（[model-hub.ts:410-411](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L410)）。
- 搜索时按 provider 统计命中数：`#searchCounts: Map<string, number> | null`（[model-hub.ts:454](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L454)）——**sidebar 上直接显示每个 provider 的命中数**。
- 历史记录：`#availableItems` / `#recentItems` / `#candidateItems` 三组（[model-hub.ts:401-405](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L401)）。

#### A.7 Preset 机制

`#presetsMemo: { revision, names, active }`（[model-hub.ts:449](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L449)）缓存 preset 名；`#presetCursor` 记录上次尝试（同 446-447 行）。footer 显示 `Preset: <name>` 或 `custom`。

#### A.8 Cheers 对照（`/model`）

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/model.ts`，**3,626 字节** | `model-hub.ts`，**157,873 字节**（43×） |
| 形式 | `form: "panel"`（[picker/model.ts:26](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L26)） | 全屏 hub（`nativeSheet` + 备用屏） |
| 布局 | 单栏平铺 | sidebar + body + footer chips |
| 行数 | 至多 8 个单行候选，实际由 surface 分配的 capacity、候选数及 chrome 决定 | 该 hub 浏览器使用 `rows - 2 - 5` |
| 分组 | provider 排序（connected 优先） | kind tabs + role tabs + sidebar 分组 |
| 搜索 | 仅子串过滤（`OptionModel`） | fuzzy 语料 + 每 provider 命中数 |
| 行内容 | `label` + `detail` + `note` | icon + label + annotation + 右对齐状态 |
| 可用性与禁用 | 普通 model 行没有 `disabled`；`ready` 影响 connected/not connected 标签；仅无 model 的 provider 占位行使用 `disabled: !ready` | 未连接 provider 单独分组，不整体置灰 |

**源码确认的缺口**（见 [30 §2](30-panels-and-model-picker.md#2-模型选择器)、[25](25-model-configuration-and-relays.md)）：`connected` 集合只读 normalizeConnections 的 provider 集合（[model.ts:31](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L31)），对 legacy/env-only 凭据可能给出 `not connected`；普通模型行仍可选择（[model.ts:49](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L49)）。同 provider 的多个 relay 也不能仅靠 provider/model 标签精确区分。实施归 PRV-01/PAN-01 的共享脱敏可用性投影及 connection 绑定，不以打开 picker 触发认证探针。

---

### B. `/settings` — SettingsSelector

#### B.1 打开路径与规模

| 项 | 值 | 出处 |
|---|---|---|
| 命令 | `name: "settings"` | [builtin-modes.ts:299](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-modes.ts#L299) |
| 控制器 | `showSettingsSelector` | [selector-controller.ts:329](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L329) |
| 组件 | `SettingsSelectorComponent`，**70,434 字节** | `settings-selector.ts` |
| 设置定义 | `settings-defs.ts`，11,717 字节 | — |
| 旧注册声明样本 | 原研究记 546 个 id、547 处注册调用；不是本轮核验的可见 UI 行数或生产 consumer 数 | 不与 Cheers 32 个编辑定义直接比较，见 §B.6 |

控制器注释明确其形态（[selector-controller.ts:335-337](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L335)）：

> Fullscreen settings editor on the alternate screen: the overlay enables mouse tracking (click/hover/wheel) for its lifetime and the transcript stays untouched underneath.

#### B.2 布局：10 个 tab

`SETTING_TABS`（[settings-defs.ts:20-31](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-defs.ts#L20)）：

```text
appearance model interaction context memory files shell tools tasks providers
```

每个 tab 带 label + icon（[settings-defs.ts:34-45](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-defs.ts#L34)）：

```ts
export const TAB_METADATA: Record<SettingTab, TabMetadata> = {
	appearance: { label: "Appearance", icon: "tab.appearance" },
	model: { label: "Model", icon: "tab.model" },
	...
};
```

另有 `TAB_LEADS`（每 tab 的引导文案，同文件 48 行）与 `TAB_GROUPS`（每 tab 内的分组，同文件 66 行）。

#### B.3 搜索：每 tab 独立 fuzzy 语料

```ts
#tabBar: TabBar;
#tabs: Tab[];
#searchList: SettingsList | null = null;
#searchQuery = "";
#searchInput: Input;
#searchMatchCount = 0;
/** First matching item id per tab id, for Tab-key jumps while searching. */
#searchFirstMatch = new Map<string, string>();
/**
 * Per-tab search candidates prepared once per search session. Dropped on
 * search start/end and whenever a value or condition may have changed
 */
#searchCorpora: { tab: SettingTab; corpus: FuzzyCorpus<SettingItem> }[] | null = null;
```

（[settings-selector.ts:616-638](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L616)）

三个可迁移的设计点：

1. **每 tab 一个语料**，搜索时同时查所有 tab。
2. **Tab 键在搜索中跳转到下一个命中的 tab**（`#searchFirstMatch`）。
3. **语料在搜索开始/结束或值可能变化时丢弃**，不做长期缓存。

tab 条上，无命中的 tab 保持原位但**变灰**（[settings-selector.ts:94-99](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L94)）。

#### B.4 编辑：popup 菜单 vs picker 子菜单

`PREFS_M...` 常量决定分界（[settings-selector.ts:74-78](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L74)）：

> Most choices a native popup menu lists; larger submenus open as a picker …
> Submenus whose choices preview live while highlighted

即：**选项少 → 就地 popup 菜单；选项多 → 打开 picker 子菜单**。实测子菜单类型：

| 类型 | 类 | 用途 |
|---|---|---|
| 多选 | `MultiSelectSubmenu`（同文件 227 行） | array-of-enum：每项一个 toggle 行 |
| provider 限额 | `ProviderLimitsSubmenu`（同文件 407 行） | 每 provider 的额度 |
| 通用 | `openSubmenu`（同文件 850 行） | 普通选项 |

判定逻辑（同文件 913-916 行）：

```ts
/** Whether row `id`'s choices fit its popup menu (else the submenu opens as ... */
return def?.type !== "submenu" || this.#submenuOptions(def).length <= PREFS_M...;
```

#### B.5 实时预览

`showSettingsSelector` 的回调里有两类预览（[selector-controller.ts:349-390](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L349)）：

- `onThemePreview`：切换主题即时生效并重绘。
- `onStatusLinePreview`：更新状态栏设置并重绘；`getStatusLinePreview()` 返回「按当前 composer 形态渲染的状态栏」实际行（同 383-387 行）。

即**预览是真实渲染，不是示意图**。

#### B.6 设置规模对照

| 侧 | 条目数 | 组织 |
|---|---|---|
| oh-my-pi | 原研究记546个注册项；不是已复核的可见UI行数，不能与32个UI定义直接比较 | settings按tab/group组织 |
| Cheers | **32**（`CONFIG_SETTINGS`） | 7 组：Context / Display / Network / Request / Retries / Session / Tools |

（Cheers 侧实测：`CONFIG_SETTINGS.length === 32`。）

#### B.7 Cheers 对照（`/settings`）

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/settings.ts`，**9,463 字节** | `settings-selector.ts`，**70,434 字节**（7.4×） |
| 形式 | `form: "panel"`（多级：列表 → 编辑 → 作用域 → 预览） | 全屏 + tab bar |
| 条目 | 32 个 CONFIG_SETTINGS 可编辑定义（勿与全部配置项混计） | 546 为原研究不同层级的汇总，不能直接当 UI 条目数 |
| 组织 | 7 组，平铺 | 10 tab + 每组内分组 |
| 搜索 | 仅子串过滤 | 每 tab fuzzy 语料 + 跨 tab 跳转 |
| 编辑 | 子 picker（`Edit <label> — <scope>`，[picker/settings.ts:31](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L31)） | popup 菜单或 picker 子菜单（按选项数分界） |
| 预览 | 有（`title` 带 `preview` 标记，[picker/settings.ts:79](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L79)） | 有（真实渲染） |
| 保存作用域 | 有显式 scope 选择（[picker/settings.ts:44](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L44)） | 未在本轮确认 |

**Cheers侧已具备**：多级编辑、作用域选择、预览、`previewError`和`Apply not confirmed`；新增工作是已定tab/search与其他能力扩面，不由代码体积或异口径条目数推导实现缺失。

2026-10-17 更正：不能从条目数推导“必须”采用某种交互；tab/search 是用户已确认的产品目标。`picker/settings.ts:73` 已向 theme 注入 `host.themes.names()` 候选，`interactiveMode.ts:1070` 已接 `themePreferences`，所以主题运行时候选和预览均为现有能力，不能按静态 schema 无 enum 推断 UI 只能输入 JSON。

### 4. 可迁移结论

| # | 结论 | 证据 |
|---|---|---|
| M-01 | 列表可见行数应由分配高度算出（`rows - 2 - 5`），不用常量 | §A.3 |
| M-02 | provider 分组 + 每 provider 命中数是搜索的可扩展呈现 | §A.6 |
| M-03 | settings 已裁决引入 tab 与跨 tab 搜索；参考的规模不证明“50 项”是普适阈值 | §B.2/§B.3；SE-01/02 |
| M-04 | 子菜单按选项数分界（少则 popup，多则 picker） | §B.4 |
| M-05 | 预览应渲染真实组件而非示意图 | §B.5 |
| M-06 | 未连接 provider 应单独分组而非整体置灰 | §A.8 |

### 5. 原决策编号（当前状态见文末归并）

| # | 决策 | 选项 |
|---|---|---|
| D-01 | `/model` 两栏 | 已纳入 PAN-01，先统一连接事实与身份，再接两栏/搜索 |
| D-02 | 模型用途 tab | 仅展示当前真实能力与角色 consumer，不照搬参考全部 kind |
| D-03 | role/preset | 用户已将完整角色/命名预设、profile 库纳入；保留既有 session 预设，见 [25](25-model-configuration-and-relays.md) |
| D-04 | `/settings` tab | 已定现 7 group 起步；不再以条目数量或未来增长作是否实施的条件 |
| D-05 | fuzzy 语料 | 共享确定性排序与跨 tab 聚合；分片/缓存由实施者按版本失效和真实语料决定 |
| D-06 | 可用性投影 | PRV-01 共用脱敏状态与精确 connection 身份，不把 configured 当远端已验证 |

### 6. 未验证项

- `model-browser.ts`（87,884 字节）的行渲染与排序细节未逐行核对。
- `model-picker.ts` 与 hub 的完整差异未逐项比对。
- omp settings 的保存作用域（global/project）UI 未确认。
- `PREFS_M…` 常量的具体数值未提取（被截断）。
- `TabBar` / `SettingsList` / `FuzzyCorpus` 的底层实现未读。


---

## 附：oh-my-pi 面板逐项研究（三）：会话、树与撤销面板

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`；Cheers 基线 `0d30d589`。

---

### A. `/resume` — SessionSelector

#### A.1 打开路径

| 步骤 | 位置 |
|---|---|
| 命令声明 | [builtin-lifecycle.ts:372-378](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts#L372)：`inlineHint: "[session id\|@claude\|@codex]"`，**零子命令** |
| 控制器 | `showSessionSelector(source?)`（[selector-controller.ts:1725](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L1725)） |
| 组件 | `SessionSelectorComponent`（`session-selector.ts`，**73,597 字节**） |
| 外部导入 | `/resume @claude` / `/resume @codex` → `showSessionSelector(foreignSource)` |

#### A.2 布局

两栏 + 预览。渲染入口（[session-selector.ts:1653-1674](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1653)）：

```ts
override render(width: number): readonly string[] {
	const innerWidth = Math.max(1, width - 4);
	const lines: string[] = [topBorder(width, this.title)];
	for (const child of this.children) {
		const childLines = child.render(innerWidth);
		if (child === this.#contentSlot) this.#listLineOffset = lines.length;
		for (const line of childLines) lines.push(row(line, width));
	}
	const footer = this.#footerLines(width);
	if (this.#fillHeight) {
		const target = Math.max(0, this.#getTerminalRows() - footer.length);
		if (lines.length > target) lines.length = target;
		else for (let i = lines.length; i < target; i++) lines.push(row("", width));
	}
	this.#footerStart = lines.length;
	for (const line of footer) lines.push(line);
	return lines;
}
```

要点：

- `innerWidth = width - 4`（左右边框各 1 + 内侧各 1）。
- `#fillHeight` 时**列表撑满到 `terminalRows - footer.length`**，footer 固定贴底——这就是「footer 常驻」的实现。
- 子节点：scope tabs → 搜索输入 → 会话列表（或删除确认对话框）。

**两种呈现**（[session-selector.ts:1690-1693](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1690)）：

```ts
/** Over the transcript the picker is its own sheet (`layer`); the standalone app fills the screen surface. */
nativeSheet(cx: DescribeContext): boolean {
	return cx.supports("picker") && !this.#standalone;
}
```

即**同一组件既是浮动 sheet 又是全屏应用**。

#### A.3 尺寸

| 项 | 值 | 出处 |
|---|---|---|
| 内宽 | `width - 4` | [session-selector.ts:1654](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1654) |
| 每会话行高 | 有标题 **4** 行，无标题 **3** 行 | [session-selector.ts:1254-1262](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1254) |
| 预览摘录上限 | `PREVIEW_EXCERPT_CHARS = 1200` | [session-selector.ts:124](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L124) |
| 预览防抖 | `PREVIEW_SETTLE_MS = 60` | [session-selector.ts:126](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L126) |
| 一天毫秒 | `DAY_MS = 86_400_000` | [session-selector.ts:127](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L127) |

行高**按可见集合记忆化**（`#visibleRowHeights`），避免每帧重算。

#### A.4 分组：Pinned + 时间

`sessionDayGroup`（[session-selector.ts:130-141](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L130)）：

```ts
const at = modified.getTime();
if (at >= startOfToday) return { id: "today", label: "Today" };
if (at >= startOfToday - DAY_MS) return { id: "yesterday", label: "Yesterday" };
if (at >= startOfToday - 6 * DAY_MS) return { id: "week", label: "This week" };
return { id: "earlier", label: "Earlier" };
```

另有 `PINNED_GROUP = { id: "pinned", label: "Pinned" }`（[session-selector.ts:128](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L128)）。`/pin` 把会话置顶。

#### A.5 搜索：带成本论证的三段设计

这是全篇最值得迁移的部分（[session-selector.ts:280-296](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L280)）：

> Lowercased per-session search haystack, built once and cached on the `SessionSelectorEntry` itself (so it dies with the listing that produced it). Rebuilding it per keystroke — a ~4KB string join plus `toLowerCase` per session — was one of the costs that made resume search visibly lag.
>
> Only the string is cached. A prebuilt fuzzy index (~60KB per 4KB session) would cost hundreds of MB on multi-thousand-session listings, so fuzzy indexes are built transiently per scan visit instead.

机制：

```ts
const kSearchTextLower = Symbol("session.searchTextLower");

function sessionTextLower(session: SessionSelectorEntry): string {
	const tagged = session as SearchableSessionInfo;
	let textLower = tagged[kSearchTextLower];
	if (textLower === undefined) {
		textLower = sessionSearchText(session).toLowerCase();
		tagged[kSearchTextLower] = textLower;
	}
	return textLower;
}
```

三段策略：

| 阶段 | 条件 | 行为 |
|---|---|---|
| 字面命中 | `isLiteralMatch` 所有 token 都在 haystack 内 | **跳过 fuzzy 打分**，按最近使用排序 |
| fuzzy 打分 | 非字面 | 每次扫描访问临时构建 `FuzzyText`，多 token 共享一个索引 |
| 噪声过滤 | 最弱 token 分数 < `MIN_PURE_FUZZY_TOKEN_SCORE = -20` | 丢弃 |

（[session-selector.ts:298-360](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L298)）

注释给出等价性论证：小写文本的连续子串必然落在某个归一化词内，所以字面命中一定也能 fuzzy 命中——快路径不是语义变化。

#### A.6 预览面板

`sessionPreview`（[session-selector.ts:150-165](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L150)）：

> The native preview of a session: its title, a fact grid, and the conversation's first prompt (user tint) plus the tail of the rest as an excerpt of the latest answer, both clipped to 1200 chars.

预览状态机（[session-selector.ts:1418-1422](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1418)）：

```ts
#preview: { session: T | undefined; nodes: readonly NativeChild[] } | undefined;
#previewPending: T | undefined;
#previewSettled: T | undefined;
#previewTimer: NodeJS.Timeout | undefined;
```

即「选中 → 60ms 防抖 → 落定」三态，按住 ↓ 不会刷屏。

#### A.7 导航与动作

| 键 | 行为 | 出处 |
|---|---|---|
| `Tab` | 切换范围：当前目录 ↔ 全部项目 | [session-selector.ts:1680-1686](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1680) |
| `Delete`/`Backspace` | 删除（带确认对话框） | [session-selector.ts:1684](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1684) |
| `Enter` | 选择并切换会话 | 同上 |
| `Esc`（`app.interrupt`） | 取消 | 同上 |

footer 文案（同 1682-1686 行）：

```text
[delete/backspace] delete · [enter] select · [tab] current folder|all projects · [esc] cancel
```

删除确认**替换列表而非叠加**（[session-selector.ts:1636-1643](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/session-selector.ts#L1636)）：

> … never the SessionList AND the picker chrome, so the picker frame stays inside the terminal viewport and the TUI never commits the header into scrollback (issue #3283).

即确认对话框与列表**互斥占位**，避免框体溢出终端视口把 header 提交进 scrollback。

#### A.8 Cheers 对照（`/resume`）

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/session.ts`，**6,177 字节** | `session-selector.ts`，**73,597 字节**（12×） |
| 形式 | `form: "modal"`（[picker/session.ts:50](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L50)） | 同一组件浮动 sheet 或全屏 |
| 列表行高 | `detailRows: 2`，modal 以每项 4 行预算容量；详情文本可折行 | 3–4 行/项（记忆化） |
| 搜索 | 已有 OptionModel 子串过滤；缺参考式排序和完整范围查询契约 | 字面快路径 + 临时 fuzzy + 噪声阈值 |
| 分组 | **无** | Pinned / Today / Yesterday / This week / Earlier |
| 预览 | **无** | 标题 + 事实网格 + 首条提问 + 末条回答摘录 |
| 范围切换 | **无** | Tab：当前目录 / 全部项目 |
| 置顶 | 已有 `/pin` 与 session.pinned 显示；缺面板内操作及 pinned 时间组 | `/pin` |
| 重命名/删除 | 有（`picker/session/management.ts`） | 删除有；重命名经 `/rename` |
| 其他代理格式导入 | 未见 `/resume @claude` / `@codex`；已有本仓历史格式的 `/import`，不能写成没有导入能力 | `/resume @claude` / `@codex` |

**Cheers 已有**：重命名、删除、确认、前缀/id/title 匹配、歧义拒绝（见 [22 §2](22-shared-command-parity.md)），以及 session picker 的增量目录、部分结果状态与通用过滤（[session.ts:35](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L35)）。后续扩展搜索排序、分组、预览和分页可达性，保留 partial/complete 与 trust 边界；不能把尚未加载的匹配项当作不存在。

---

### B. `/tree` — TreeSelector

#### B.1 打开路径与规模

| 项 | 值 |
|---|---|
| 命令 | `name: "tree"`（[builtin-session.ts](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-session.ts)），另有 `/branch` |
| 组件 | `TreeList` + `SearchLine` + `LabelInput`（`tree-selector.ts`，**62,698 字节**） |
| Cheers 对应 | `picker/tree.ts`，**1,361 字节**（46×） |

#### B.2 树形 gutter 几何（精确）

`#renderGutter`（[tree-selector.ts:960-1000](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/tree-selector.ts#L960)）：

```ts
const MIN_CONTENT_COLS = 24;
const OVERHEAD_COLS = 4; // cursor (2) + a touch of breathing room
const contentReserve = Math.max(MIN_CONTENT_COLS, Math.floor(width / 2));
const maxIndentLevels = Math.max(1, Math.floor((width - contentReserve - OVERHEAD_COLS) / 3));
```

| 常量 | 值 | 含义 |
|---|---|---|
| 每层缩进 | **3 cells** | `(width - reserve - 4) / 3` |
| 内容最小列 | `MIN_CONTENT_COLS = 24` | 至少留 24 列给条目文本 |
| 内容预留 | `max(24, width/2)` | 或视口一半，取大者 |
| 固定开销 | `OVERHEAD_COLS = 4` | 光标 2 + 余量 2 |

**窗口级统一偏移**（同 984-990 行）：

> One horizontal scroll position for the whole window: a per-row offset would put a different tree depth in the same column on each line, so connectors and gutters would stop describing one shape.

即 `windowOffset = max(0, deepest - maxIndentLevels)` —— 所有行共用一个水平滚动量，超深层级压缩到前导 `…` 之后。

#### B.3 连接符语义

同 992-1004 行：

```ts
const displayIndent = row.depth;
const hasConnector = row.parentKey !== undefined && row.siblingCount > 1;
const connectorSymbol = hasConnector ? (row.isLast ? theme.tree.last : theme.tree.branch) : "";
```

- **连接符只在真实分叉点绘制**（`siblingCount > 1`）。
- 线性链（单子节点）**保持分支头的深度**，不逐层加深。
- 虚拟多根的 session root **无连接符**。
- gutter 语义（同 1023-1026 行）：`│` 只在下方仍有兄弟时画，否则留空格。

#### B.4 披露（折叠）与行类型

分支点集合（[tree-selector.ts:708-711](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/tree-selector.ts#L708)）：

```ts
// Real branch points get a disclosure; linear chains stay flat at their head's depth.
const branchPoints = new Set<string>();
for (const row of allRows) {
	if (row.parentKey !== undefined && row.siblingCount > 1) branchPoints.add(row.parentKey);
}
```

行类型判定（[tree-selector.ts:738-756](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/tree-selector.ts#L738)）：

| 来源 | `kind` | `role` |
|---|---|---|
| 用户请求 | `user` | — |
| assistant 消息 | `assistant` | — |
| `toolResult` | `tool` | `omp.tool.<name>` |
| `bashExecution` | `tool` | `omp.tool.bash` |
| `pythonExecution` | `tool` | `omp.tool.eval` |
| 其他 | `marker` | — |

行属性还带 `depth`、`open`（可披露）、`badges`、`dot: "accent"`（当前路径）。

#### B.5 性能设计

> `items` is every structural entry, **rebuilt only when the tree or a label changes**; filter modes and typing change only `order` (the visible entries) and the selection.

（[tree-selector.ts:700-706](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/tree-selector.ts#L700)）

即**结构与顺序分离**：`items` 缓存，`order` 随过滤/输入变化。这与 Cheers 的宽度缓存是同类思路。

#### B.6 Cheers 对照（`/tree`）

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/tree.ts`，**1,361 字节** | `tree-selector.ts`，**62,698 字节** |
| 形式 | `form: "modal"`（[picker/tree.ts:10](../../packages/ts-shell/src/cli/interactive/picker/tree.ts#L10)） | 全屏树 |
| 树形 gutter | 已按 depth 做两空格缩进；缺连接符、展开态与深层水平策略 | 3 cells/层 + 连接符 + 统一水平偏移 |
| 连接符 | 无 | `├─`/`└─`，仅分叉点 |
| 折叠 | 无 | 披露（分支点） |
| 行类型着色 | 已有 role 文本、current/unavailable note；缺对应的类型样式与 badge 投影 | 5 类 + role + badge + 当前路径点 |
| 搜索 | 已有共享 OptionModel 子串过滤；无独立树过滤/展开模型 | `SearchLine` |
| 内容预算 | 已有 modal 的宽高预算；缺树 gutter 与最小正文空间的联合分配 | 该参考组件保留至少 24 列，或视口一半 |

---

### C. `/rewind` 与 `/back` — RewindSelector

| 项 | 值 |
|---|---|
| 组件 | `rewind-selector.ts`，**41,191 字节** |
| Cheers 对应 | `picker/rewind.ts`，**4,890 字节** |
| 关系 | Cheers 的 `/back` 与 `/undo` 是两个不同对象；omp 的 rewind 选择器同时覆盖文件与对话回退 |

（本轮未逐字段读取 `rewind-selector.ts`；见 §E 未验证项。）

---

### D. 可迁移结论

| # | 结论 | 证据 |
|---|---|---|
| S-01 | 列表撑满分配高度、footer 固定贴底 | §A.2 `#fillHeight` |
| S-02 | 搜索用「字面快路径 + 临时 fuzzy + 噪声阈值」三段式，且 haystack 挂在对象上缓存 | §A.5 |
| S-03 | 每会话行高可变（3/4 行）并按可见集合记忆化 | §A.3 |
| S-04 | 预览需防抖（参考 60ms）并区分 pending/settled | §A.6 |
| S-05 | 时间分组是会话列表的默认组织方式 | §A.4 |
| S-06 | 确认对话框应与列表**互斥占位**，避免框体溢出视口 | §A.7 |
| S-07 | 树 gutter 固定 3 cells/层 + 统一水平偏移 + 内容最小预算 24 列 | §B.2 |
| S-08 | 连接符只在真实分叉点绘制，线性链保持分支头深度 | §B.3 |
| S-09 | 结构与顺序分离：结构缓存，过滤只改顺序 | §B.5 |
| S-10 | 同一组件应能同时作为浮动 sheet 与全屏应用 | §A.2 `nativeSheet` |

### E. 原决策编号（当前状态见文末归并）

| # | 决策 | 选项 |
|---|---|---|
| R-01 | `/resume` 搜索 | 已纳入字面优先/fuzzy 回退；分页查询区分 partial/complete，搜索不扩大授权范围 |
| R-02 | 时间分组与置顶 | 已纳入 PAN-02；复用现 pinned 元数据与 owner 操作 |
| R-03 | 选中预览 | 已纳入有界预览；取消、版本变化和旧响应不能覆盖当前选择 |
| R-04 | 范围切换 | 默认当前 workspace，显式切换仅覆盖当前 profile 已授权范围；trust 不被搜索解除 |
| R-05 | `/tree` 树形渲染 | 已纳入层级/展开/过滤/稳定选择，复用完整会话树，不改变持久分支语义 |
| R-06 | `/resume` 动作展示 | 仅简化 UI，保留语法、解析与直接入口；见 [24](24-slash-completion-defects.md) S-03 |

### F. 未验证项

- `rewind-selector.ts`（41,191 字节）未逐字段读取。
- `history-search.ts`（16,374 字节）与 `session-info-overlay.ts`（14,714 字节）未读取。
- `TreeList` 的 `#filterMode` 取值集合未提取。
- `SearchLine` 的按键（`/`、`?`、`n`、`N`）未逐一确认。
- omp 会话列表在数千会话下的实测性能未验证（仅有注释中的成本论证）。


---

## 附：oh-my-pi 面板逐项研究（四）：任务、用量、复制与工具面板

只读研究。未修改产品源码。参考快照 oh-my-pi `c2cb79e4`；Cheers 基线 `0d30d589`。

---

### A. `/jobs` — JobsSheet

#### A.1 打开路径与形态

| 项 | 值 | 出处 |
|---|---|---|
| 命令 | `name: "jobs"`，子命令 `full` / `kill` | [builtin-session.ts:321-328](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-session.ts#L321) |
| 组件 | `JobsSheet`（`jobs-panel.ts`，**14,343 字节**） | — |
| 另一入口 | 状态栏的 jobs pill | [jobs-panel.ts:2-3](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/jobs-panel.ts#L2) |

形态说明（[jobs-panel.ts:2-4](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/jobs-panel.ts#L2)）：

> A master–detail split lists every job (running first) beside the selected one's status, command, facts (cwd, live pids, exit code, artifact) and live output.

#### A.2 布局：主从分栏

- 左：全部作业列表，**running 优先**。
- 右：选中作业的详情——状态、命令、事实（cwd / 实时 pids / 退出码 / artifact）、**实时输出**。

#### A.3 数据契约（可迁移）

```ts
export interface JobsPanelJob {
	readonly id: string;
	readonly type: string;
	readonly status: "running" | "completed" | "failed" | "cancelled";
	readonly label: string;
	readonly startTime: number;
	readonly endTime?: number;
	readonly agentId?: string;      // 子代理作业的注册 id
}

export interface JobsPanelDetail {
	readonly command?: string;      // 完整命令行（行内是截断标签）
	readonly cwd?: string;
	readonly pids: readonly number[];   // 命令派生的实时 pid
	readonly exitCode?: number;
	readonly output?: string;       // 运行时是尾部，结算后是终态文本
	readonly artifactId?: string;   // output 被截断时的完整输出载体
}
```

（[jobs-panel.ts:21-46](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/jobs-panel.ts#L21)）

**关键设计**：`command` 与 `label` 分离（行内截断、详情完整）；`output` 与 `artifactId` 分离（尾部 + 完整载体）。这与 Cheers 的 `renderTask` 文本投影是同构的，但 omp 用**两个视图**呈现。

#### A.4 状态胶囊

（[jobs-panel.ts:64-80](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/jobs-panel.ts#L64)）

```ts
running: "Running",
...
running: { t: "●", fx: "pulse" },     // 运行中脉冲动画
```

四种状态：`running` / `completed` / `failed` / `cancelled`。

#### A.5 关闭语义

（[jobs-panel.ts:100](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/jobs-panel.ts#L100)）

> …selected running job, Esc or Close dismisses; **nothing enters the transcript**.

即关闭面板不向对话写入任何内容。

#### A.6 Cheers 对照

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 面板 | **无**（`/jobs` 输出文本） | `JobsSheet` 主从分栏 |
| 入口 | `/jobs` 文本 | `/jobs` + 状态栏 pill |
| 实时输出 | `taskOutput` 文本 | 详情区实时流 |
| pids | 未暴露 | 详情列出 |
| artifact | 结果里给 URI | 详情字段 |
| 取消 | `taskStop`（模型侧） | 面板内 kill |

---

### B. `/usage` — UsageDashboard

#### B.1 打开路径与形态

| 项 | 值 | 出处 |
|---|---|---|
| 命令 | `name: "usage"`，子命令 `show` / `reset` | [builtin-session.ts:391](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-session.ts#L391) |
| 组件 | `UsageDashboardComponent`（**70,964 字节**）+ `ResetUsageSelector`（15,897 字节） | — |

#### B.2 布局：四区域

（[usage-dashboard.ts:692-714](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/usage-dashboard.ts#L692)）

```ts
readonly #panel: OverlayPanel;
readonly #header: PanelRows;   // setHeight(1)
readonly #body: PanelRows;
readonly #footer: PanelRows;   // setHeight(1)
```

即 header 固定 1 行、footer 固定 1 行、body 弹性——与 `HubFrame` 同一思路（见 本文「共用框架与尺寸策略」），但组件是独立的 `OverlayPanel`。

#### B.3 配额条：meter / progress 双形态

（[usage-dashboard.ts:408-417](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/usage-dashboard.ts#L408)）

```ts
/** Used-fraction bar of a quota window, toned by status: a `meter` where the terminal draws one, else a `progress` bar. */
function usageMeter(fraction: number, status: UsageLimit["status"], meter: boolean): NativeNode {
	const value = Math.min(Math.max(fraction, 0), 1);
	const tone = statusTone(status);
	return meter ? node("meter", { value, style: "bar", size: "md", tone }) : node("progress", { value, tone, grow: 1 });
}
```

**可迁移点**：终端支持原生 meter 时用 `meter`，否则退化为 `progress` 条。状态映射为 tone（含 `ok` / `warning` / `unknown` 三档，同文件 400-406 行）。

#### B.4 图表与表格

- `#panel` 的 body 可含图表：`options: { chart?: NativeNode; title?: string }`（[usage-dashboard.ts:486-489](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/usage-dashboard.ts#L486)）。
- 表格列类型来自 `TspTableColumn`（同文件 43 行 import）。
- 日期/时间格式化：`shortDate` → `Mon 28 Sep`、`clockTime` → `18:00`（同 419-427 行）。

#### B.5 Cheers 对照

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 面板 | **无**（`/usage` 文本） | `UsageDashboard` 四区域 + 图表 |
| 配额条 | 无 | meter/progress 双形态 |
| 历史行 | 无 | 按日期/模型的行 |
| 重置 | `/usage reset status`（只读查询） | `ResetUsageSelector`（可消费） |

**注**：Cheers 的 `/usage reset status` 是 Phase 19 的只读收据查询（见 [phase-19-decisions.md §10.14](phase-19-decisions.md)），与 omp 的「消费重置额度」是不同对象。

---

### C. `/copy` — CopySelector

#### C.1 打开路径与规模

| 项 | 值 |
|---|---|
| 命令 | `name: "copy"`（[builtin-collaboration.ts](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)） |
| 组件 | `CopySelectorComponent`（**43,340 字节**）+ `copy-targets.ts`（7,381 字节） |
| Cheers 对应 | `picker/copy.ts`，**2,140 字节**（20×） |

#### C.2 结构：完整 transcript 回放

（[copy-selector.ts:336-370](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/copy-selector.ts#L336)）

```ts
export class CopySelectorComponent implements Component {
	#builder: ChatTranscriptBuilder;
	#browser: TranscriptBrowser;
	#targets: OutlineTarget[] = [];
	#expanded = false;
	/** Inner blocks of the selected turn while descended, else undefined. */
	#blocks: CopyBlock[] | undefined;
	#blockCache = new Map<string, CopyBlock[]>();
	/** Click targets of the last render, keyed by composed-column line index. */
	#controls = new Map<number, ControlRegion[]>();
	#entries: TranscriptEntry[];
	/** True while older history is still unreplayed. */
	#truncated = false;
```

要点：

1. **两级导航**：先选 turn（`#targets`），再「下钻」到该 turn 的块（`#blocks`）。
2. **点击区域**：`#controls` 按行记录可点击区，支持鼠标。
3. **历史分页回放**：`#truncated` 表示更早的历史尚未回放，`recentTranscriptEntries(entries)` 只取尾部（同 372-376 行）。
4. **展开/折叠**：`#expanded` 影响回放时构建的块集合。
5. **缓存**：`#blockCache`（按 key）、`#blockPreviews`（按块集 + 内宽）、`#nativeItems`（按 targets）——三层缓存，避免每帧重建。

#### C.3 复制目标的语义

`copy-targets.ts` 把消息解析为可复制块（[copy-targets.ts:20-24](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/copy-targets.ts#L20)）：

```ts
export type MessageBlock = ({ kind: "code" } & CodeBlock) | ({ kind: "quote" } & QuoteBlock);
...
kind: "bash" | "eval";
```

即：代码块、引用块、bash 命令、eval 代码——**按语义切分而非按行**。这与 Cheers `copyPicker` 的「整个 block 的原始文本」是同一目标（避免拖选带入缩进），但 omp 粒度更细。

#### C.4 Cheers 对照

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/copy.ts`，**2,140 字节** | `copy-selector.ts`，**43,340 字节** |
| 候选 | 最近 30 个 block（`MAX_BLOCKS = 30`） | 全部（分页回放） |
| 粒度 | 整块 | turn → 块 两级 |
| 预览 | 首行摘要（70 字符） | 语法高亮 + 宽度裁剪的多行预览 |
| 展开/折叠 | 无 | 有 |
| 鼠标 | 已有共享 overlay 的候选行命中；缺 turn/block 下钻与展开控件 | 点击区域 |
| 缓存 | 构造时捕获最近 block，再投影候选；无参考的语义块/预览/项三层缓存 | 三层缓存 |

**注**：Cheers 的 `MAX_BLOCKS = 30` 与 `SUMMARY_LENGTH = 70` 是硬编码常量（[picker/copy.ts:16-17](../../packages/ts-shell/src/cli/interactive/picker/copy.ts#L16)）。

---

### D. `/mcp` — MCPAddWizard

| 项 | 值 |
|---|---|
| 组件 | `MCPAddWizard`（`mcp-add-wizard.ts`，**61,165 字节**） |
| Cheers 对应 | `picker/servers.ts`（2,245 字节，只读列表 + refresh） |
| 规模比 | 27× |

下文核对该参考的多步表单向导；阶段、字段与认证分支用于对照 Cheers 的实际 MCP 添加流程，不由文件规模判断完整度或迁移优先级。

#### D.1 六个阶段

（[mcp-add-wizard.ts:192-198](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/mcp-add-wizard.ts#L192)）

```ts
const PHASES = ["Name", "Transport", "Connection", "Auth", "Scope", "Review"] as const;
const PHASE_NAME = 0;
const PHASE_TRANSPORT = 1;
const PHASE_CONNECTION = 2;
const PHASE_AUTH = 3;
const PHASE_SCOPE = 4;
const PHASE_REVIEW = 5;
```

#### D.2 十八个步骤，映射到阶段

（[mcp-add-wizard.ts:96-113](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/mcp-add-wizard.ts#L96) 与 202-215 行）

```ts
type MCPWizardStep =
	| "name" | "transport" | "command" | "args" | "url"
	| "auth-method" | "oauth-error" | "oauth-auth-url" | "oauth-token-url"
	| "oauth-client-id" | "oauth-client-secret" | "oauth-scopes"
	| "apikey" | "auth-location" | "env-var-name" | "header-name"
	| "scope" | "confirm";
```

`STEP_PHASE` 把每步归到阶段——**阶段是进度条的单位，步骤是实际提问的单位**，一个阶段可含多个步骤（Auth 含 8 个）。

#### D.3 进度条：带跳过标记的分段

（[mcp-add-wizard.ts:653-668](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/mcp-add-wizard.ts#L653)）

```ts
/** The phase strip: phases behind filled, the current one lit, Auth dashed when the server needed none. */
#describeProgress(phase: number): NativeNode {
	const authSkipped = phase > PHASE_AUTH && this.#state.authMethod === "none";
	const segments = PHASES.map((label, index) => {
		const skipped = index === PHASE_AUTH && authSkipped;
		const tone = index === phase ? "accent" : index > phase ? "muted" : skipped ? "neutral" : "success";
		return node("col", { role: "omp.mcpAdd.phase", tone, ...(skipped ? { title: "Auth · not needed" } : {}) }, [text(label)], label);
	});
```

四态：**已过（success）/ 当前（accent）/ 未来（muted）/ 跳过（neutral + tooltip）**。这是「条件分支阶段」的表达方式——Auth 阶段在无需认证时显示为已跳过而非隐藏。

标题行同时显示 `n/6`（同 237 行）。

#### D.4 五种步骤形态

`WizardStepKind`（[wizard-step.ts:9](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/wizard-step.ts#L9)）：

```ts
export type WizardStepKind = "input" | "choice" | "confirm" | "async" | "custom";
```

| 形态 | 用途（实测调用点） |
|---|---|
| `input` | 文本输入（name / command / url / client-id 等） |
| `choice` | 选项（transport / auth-method / scope / auth-location） |
| `confirm` | 最终确认（同 954 行） |
| `async` | 异步等待（OAuth 回调，同 580 行） |
| `custom` | 自定义内容 |

步骤高度策略（[wizard-step.ts:11-20](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/components/wizard-step.ts#L11)）：

```ts
/** A component slot rendered by {@link WizardStep}. */
export interface WizardStepSlot {
	readonly component: Component;
	/** Omit this slot when retaining it would squeeze content below `minContentLines`. */
	readonly optional?: boolean;
}
```

即槽位可标记 `optional`，空间不足时**优先丢弃可选槽**而不是压扁内容。

#### D.5 复用的表单原语

| 原语 | 出处 | 作用 |
|---|---|---|
| `OverlayPanel` | `chrome/overlay-box` | 面板外框 |
| `WizardStep` | `components/wizard-step` | 单步容器（含 heading、content、actions） |
| `TextFormField` | `components/form` | 文本字段 |
| `SelectList` | `components/select-list` | 选项列表 |
| `actionBar` / `actionButton` | `native/overlay` | 底部动作条 |

动作条语义（[mcp-add-wizard.ts:669-672](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/mcp-add-wizard.ts#L669)）：

> Cancel on the left; Back and the step's one primary action on the right. Keys live in the tooltips.

即**左取消、右返回 + 单一主操作**，键位放在 tooltip 而非挤在行内。

#### D.6 Cheers 对照

| 字段 | Cheers | oh-my-pi |
|---|---|---|
| 组件 | `picker/servers.ts` 2,245 字节（只读） | `mcp-add-wizard.ts` 61,165 字节 |
| 步骤 | 无 | 6 阶段 / 18 步骤 |
| 表单原语 | `picker/input.ts`（2,428 字节，单字段） | `WizardStep` + `TextFormField` + `SelectList` |
| 进度 | 无 | 分段条 + 跳过标记 + `n/6` |
| 分支 | 无 | 按 transport/auth 条件跳过阶段 |
| 动作条 | 无 | 左取消 / 右返回 + 主操作 |

**可迁移点**：`WizardStep` 的 `kind` 分类和 `optional` 槽位给出表单降级方式。Cheers 已有单字段 `picker/input.ts`、settings 多级暂存和各域配置/认证流程；缺的是可复用的多字段焦点、校验与阶段投影，不是整个产品只有单字段能力。

---

### E. `/plugins` 与 `/marketplace` — PluginSelector

| 项 | 值 |
|---|---|
| omp 命令 | `plugins`（[builtin-marketplace.ts:426](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/slash-commands/builtin-marketplace.ts#L426)）、`marketplace`（同 46 行）、`reload-plugins`（同 490 行） |
| omp 组件 | `plugin-selector.ts`（**4,629 字节**）、`plugin-settings.ts`（35,468 字节） |
| Cheers 对应 | `picker/plugins.ts`（2,548 字节）、`picker/sources.ts`（2,502 字节） |

这些字节数只提供原快照的定位信息。Cheers 的 `/plugin` 与 `/marketplace` 先委托真实 extension runtime，签名目录、安装/更新/回滚/删除、grants 与受控执行均已有 owner（见 [37](37-command-implementation-audit.md)）；不能把 picker 大小当成“只有列表”或安装/执行已全部验收的证据。当前任务是增强同一管理面板、补结构化状态并将 `/extensions` 注册为别名，沿用现有信任/审批/执行边界。

---

### F. 其他面板

#### F.1 `/agents` — AgentsHub

（[agents-hub.ts:1-11](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/agents-hub.ts#L1)）

> Fullscreen `/agents` hub, shown on the alternate screen **like /models**.
>
> Layout **mirrors the model hub**: a sidebar of scopes (All agents, per-source groups, "+ New agent"), a body listing agents with type-to-filter search, and a footer that turns into a chip strip while configuring. Enter on an agent opens its property strip (enabled / model / prewalk / advisor); a property opens a value strip whose "pick model…" chip **dives into the real ModelBrowser** and whose "pattern…" chip opens an inline pattern input, so every per-agent knob is **picked instead of memorized**.

这段注释是「共用框架」最直接的证据：`/agents` 主动对齐 `/models` 的布局。三点可迁移：

1. sidebar = 作用域（All / 按来源分组 / + New）。
2. body 带 type-to-filter 搜索。
3. **嵌套下钻**：agent → 属性条 → 值条 → 「pick model…」直接进入 `ModelBrowser`。

规模 67,290 字节；`sidebarBounds { min: 16, max: 24 }`。

#### F.2 `/hub` — AgentHub

（[agent-hub.ts:1-14](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/agent-hub.ts#L1)）

> One overlay, **two views**:
> - **Table view**: every registered agent except Main (Main IS the ambient chat), live from the global AgentHubRegistry — status, unread irc count, current/last task, last activity. Navigate with keys, wheel, hover, and click; `r` revives a parked agent, `x` aborts + releases one.
> - **Chat view**: per-agent transcript (incremental session-file tail …) plus an input line. Submitting revives a parked agent, then prompts/steers it; the message lands in the agent's persisted history via the normal prompt path.

可迁移点：

1. **同一 overlay 两个视图**（表格 ↔ 聊天），不是两个面板。
2. 表格列：status / unread irc count / current-or-last task / last activity。
3. 行内动作：`r` 复活、`x` 中止并释放。
4. 聊天视图用**增量 session-file tail** 而非全量重读。

原研究记录该文件 95,981 字节；此数字不用于面板优先级或完整度排名。

#### F.3 `/debug` 与 `/cleanse`

| 面板 | 规模 | 形态 | Cheers 对应 |
|---|---|---|---|
| `/debug` → `DebugSelectorComponent`（`packages/coding-agent/src/debug`，**惰性 import**） | — | 选择器 | 无面板 |
| `/cleanse` → `cleanse-panel.ts` | 9,312 | **anchored**（编辑器上方） | 无面板 |

**`/debug` 的惰性加载**（[selector-controller.ts:2381-2387](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L2381)）：

```ts
async showDebugSelector(): Promise<void> {
	const { DebugSelectorComponent } = await import("../../debug");
	this.showSelector(done => {
		const selector = new DebugSelectorComponent(this.ctx, done);
		return { component: selector, focus: selector };
	});
}
```

即**按需 `await import`**，调试面板的代码不进启动路径。这与 Cheers 的启动优化方向一致（见 [29](29-startup-time.md)）。

**`/cleanse` 的 anchored 形态**（[cleanse-panel.ts:1](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/cleanse-panel.ts#L1)）：

> Anchored `/cleanse` overlay rendering the host's live board above the editor.

这是第三种 overlay 形态（除全屏与浮动之外）：**锚定在编辑器上方**，不接管整屏。它的内容模型（[cleanse-panel.ts:169-181](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/cleanse-panel.ts#L169)）：

```ts
#presentation(): StreamingPanelPresentation {
	const frames = theme.getSpinnerFrames("activity");
	const liveLines = this.#liveClosed ? [] : this.#model.renderLive(frames[this.#frame % frames.length]);
	return {
		sections: [
			this.#logLines.length > 0 ? this.#logLines.map(line => new Text(replaceTabs(line), 0, 0)) : undefined,
			liveLines.length > 0 ? liveLines.map(line => new Text(replaceTabs(line), 0, 0)) : undefined,
			this.#errorMessage ? new Text(theme.fg("error", replaceTabs(this.#errorMessage)), 0, 0) : undefined,
		],
		footer: this.#footerLine(),
	};
}
```

`StreamingPanelContent`（[streaming-panel.ts:9-14](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/streaming-panel.ts#L9)）是可复用的流式面板原语：

```ts
export interface StreamingPanelPresentation {
	/** Non-empty sections separated by one blank row. */
	readonly sections: readonly (Component | readonly Component[] | undefined)[];
	/** Use a provider when action availability may change without a controller transition. */
	readonly footer: string | (() => string);
}
```

可迁移点：**sections 数组 + 单一 footer provider**，空 section 自动省略，`footer` 可为函数以便每帧重算可用动作。

#### F.4 其余面板规模索引

| 面板 | 规模 | Cheers 对应 |
|---|---|---|
| `agent-transcript-viewer.ts` | 31,125 | 无 |
| `hook-selector.ts` | 35,970 | 无 |
| `hook-editor.ts` | 18,640 | 无 |
| `advisor-config.ts` | 62,698 | 无 |
| `plan-review-overlay.ts` | 71,429 | 无 |
| `session-info-overlay.ts` | 14,714 | 无 |
| `history-search.ts` | 16,374 | `transcript/search.ts`（6.6 KB） |
| `rewind-selector.ts` | 41,191 | `picker/rewind.ts`（4,890） |
| `tree-selector.ts` | 62,698 | `picker/tree.ts`（1,361） |

（这些面板的逐字段细节未读取，见 §I。）

---

### G. 可迁移结论

| # | 结论 | 证据 |
|---|---|---|
| J-01 | 作业面板用主从分栏：左列表右详情（命令/事实/实时输出） | §A.2 |
| J-02 | 作业数据模型应分离 `label`/`command`、`output`/`artifactId`、并暴露 pids | §A.3 |
| J-03 | 面板关闭不应向对话写入内容 | §A.5 |
| J-04 | 配额条按终端能力在 meter 与 progress 间降级 | §B.3 |
| J-05 | 用量面板应为 header(1)/body/  footer(1) 三段 | §B.2 |
| J-06 | 复制候选应按语义块切分并支持下钻 | §C.3 |
| J-07 | 大列表需分页回放 + 多层缓存（块/预览/项） | §C.2 |
| J-08 | 鼠标点击区域按渲染行记录，随帧重建 | §C.2 `#controls` |
| J-09 | 多步表单应为「阶段（进度条单位）+ 步骤（提问单位）」两层，阶段可标记跳过 | §D.1/§D.3 |
| J-10 | 表单步骤应有 `kind` 分类（input/choice/confirm/async/custom）与 `optional` 槽位降级 | §D.4 |
| J-11 | 动作条布局：左取消、右返回 + 单一主操作，键位放 tooltip | §D.5 |
| J-12 | 同一 overlay 可承载多个视图（表格 ↔ 聊天），不必拆成两个面板 | §F.2 |
| J-13 | 面板之间应可**嵌套下钻**（agent → 属性 → 值 → ModelBrowser） | §F.1 |
| J-14 | 面板代码应按需 `await import`，不进启动路径 | §F.3 |
| J-15 | overlay 有三种形态：全屏 / 浮动 / **锚定在编辑器上方**，按用途选择 | §F.3 |
| J-16 | 流式面板用「sections 数组 + footer provider」表达，空 section 自动省略 | §F.3 |

### H. 原决策编号（当前状态见文末归并）

| # | 决策 | 选项 |
|---|---|---|
| W-01 | `/jobs` 面板 | 已在 34/Q-06 与 PAN-03 纳入；复用 jobs owner，关闭不取消或写对话 |
| W-02 | `/usage` 面板 | 已在 34/Q-06 与 PAN-04 纳入；本地费用、quota 与 unknown 分开 |
| W-03 | `/copy` 下钻与展开 | 已纳入 PAN-06；更早 block 可经有界分页到达，不只抬高最近 30 项常量 |
| W-04 | `/mcp` 添加向导 | 已纳入 PAN-08，逐字段校验、scope/认证/确认分步，写入由原 owner 承担 |
| W-05 | jobs 状态入口 | 归 PAN-03 与现状态栏 owner 的投影，值来自同一 jobs 快照；不建第二观察/轮询系统 |

### I. 未验证项

- `mcp-add-wizard.ts`（61,165 字节）未逐字段读取。
- `agent-hub.ts` / `agents-hub.ts` 的布局差异未逐项比对。
- `hook-selector.ts` / `hook-editor.ts` 的「列表 + 编辑器」组合方式未读取。
- `usage-dashboard.ts` 的表格与图表渲染细节未逐行核对。
- 未在真实终端目视确认任何面板。

---

## 2026-10-17 决策归并与生产约束

合并前的短编号存在重复。后续引用需包含“文档 + 小节 + ID”；例如 §7 M-01（共享框架）与附（二）M-01（高度预算）不是同一任务。以下保留所有原编号的含义，提供归并去向，避免重新把已定项列为待裁决。

| 原决策/结论组 | 归并去向与当前处理 |
|---|---|
| §7 M-01/02；附（一）F-01/02；附（二）D-01/04 | P-02/P-03/P-06：两栏与 tab 已定；P-06 扩展现有 panel.ts。新增面板按内容选择布局，不强制 HubFrame |
| §7 M-03；附（一）F-03；C-02/03/04 | P-02 几何：按 owner 需求测量 sidebar，宽高预算可归零，窄窗保持可访问；具体 min/max 为实现参数 |
| §7 M-04；附（一）F-04/05；C-05/06 | P-04/P-05：chip、行样式与二维命中；边框/符号须有纯文本与终端能力降级，不另建主题体系 |
| §7 M-05；C-01；附（二）M-01；附（三）S-01/03；附（四）J-04/05/08/14/15/16 | P-01/05/06 与生命周期契约；顺序是工程依赖，可由实施者决定 |
| §7 M-06/07；附（三）R-06 | 参数线 S-03；保留直接参数和兼容入口。是否新增 /session 属命令信息架构方向，不能因参考这样拆就自动决定 |
| 附（二）D-02/03；M-02/06；D-06 | 模型用途 tab 只展示当前能力；连接投影归 25/PRV-01；profile 预设库和完整角色应用已由用户纳入，归 PRV-02，保留现 session 命名预设并逐角色落实 consumer；不照搬参考十种 kind |
| 附（二）D-05；M-03/04/05 | SE-01…06：先用现有字段与候选，搜索缓存按目录版本失效；popup 阈值与语料分片是实现选择 |
| 附（三）R-01/02/03；S-02/04/05/06 | 会话搜索、时间组、预览与确认共用已有会话身份/版本 owner；预览有取消与过期响应隔离 |
| 附（三）R-04 | PAN-02 默认当前 workspace，显式切换只读取当前 profile 已授权范围；分页/搜索不能扩大 trust，旧 scope 回调不能覆盖新查询 |
| 附（三）R-05；S-07/08/09/10 | 树形展示与布局适配，复用 session tree；终端单元格按现有测量 owner 计算，不把参考常数当跨终端真理 |
| 附（四）W-01/02；J-01/02/03 | /jobs、/usage 已在 34 Q-06 范围；数据来自实际作业/请求 owner，PID 只作事实，绝不作为恢复后的控制权 |
| 附（四）W-03；J-06/07/12/13 | /copy 下钻、分页与复合视图；复用现有 clipboard/output owner，输出量与缓存有上限 |
| 附（四）W-04；J-09/10/11 | /mcp 向导复用当前 MCP owner；发现/预览/认证/添加分开，不由组件自行写配置或连服务 |
| 附（四）W-05 | jobs pill 为发现入口建议，可与既有状态栏项整合；不得为它建立第二个作业观察系统 |

这些是 UI 规格与规划约束，不是“底层全已实现、只补 UI”的证明。每个新面板先列 owner 的查询快照、订阅、准备/批准/执行端口及结果契约；缺少的结构化读取或事件端口属于正式实施工作。组件不得解析命令输出字符串重建领域状态，也不得直接读凭据或绕开执行/审批 owner。

固定参考比较：[omp OverlayPanel](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/chrome/overlay-box.ts#L246) 支持 child invalidate/dispose；其 render 每帧仍调用 child.render，memo 仅省略相同 childLines 的边框包装（309–341），因此“宽度不变不重算整个面板”是错误推论。[omp 扩展 dashboard](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/coding-agent/src/modes/controllers/selector-controller.ts#L612) 关闭时 dispose、hide、恢复编辑器焦点。补充较新版本 [pi 8efd314 的 selector token](https://github.com/earendil-works/pi/blob/8efd314fa3d3232ce197d8d7a6a5660530b9d83e/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L4898) 在旧 selector 回调到达时校验身份，防止关闭新 selector；该证据不归入 omp 旧快照。

Cheers 应保留并扩展 `OverlayHost` 已有 generation、load AbortController、unsubscribe 和 previewEnd；关闭/替换/会话切换均释放视图资源，迟到加载/预览不得重新激活旧视图。关闭已派发操作的面板只释放视图订阅，取消操作须调用原 owner；writer-started/dispatch-unknown/cleanup-unknown 保持可见，不能因 Esc、重试、清屏或错误 toast 变成成功。完整验收矩阵见 [35 的生命周期与端口契约](35-panel-inventory-full.md#生产面板的端口生命周期与副作用契约)。
