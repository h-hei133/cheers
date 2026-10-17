---
title: "面板与模型选择器：尺寸预算、omp settings 外壳与扩展方案"
category: article
sources: [repo-audit-2026-10-15, packages/ts-shell/src/cli/interactive/overlay.ts, packages/ts-shell/src/presentation/tui/chrome/panel.ts, packages/ts-shell/src/presentation/tui/chrome/modal.ts, packages/ts-shell/src/presentation/tui/chrome/options.ts, packages/ts-shell/src/presentation/tui/surface/view.ts, packages/ts-shell/src/cli/interactive/picker/model.ts, packages/ts-shell/src/cli/interactive/picker/settings.ts, packages/ts-shell/src/core/models/catalogSurface.ts, oh-my-pi/packages/tui/src/overlays/model-hub.ts, oh-my-pi/packages/tui/src/overlays/model-browser.ts, oh-my-pi/packages/tui/src/components/select-list.ts, codex/codex-rs/tui/src/bottom_pane/list_selection_view.rs, 15-tui-status-and-panels.md]
created: 2026-10-15
updated: 2026-10-17
tags: [features, tui, panels, pickers, models, gap-analysis]
summary: "源码复核：panel 至多显示8个候选，modal另按高度与每项行数分配；connected元数据与运行时凭据解析不一致，但普通model行并非全禁用。设置已有theme动态choices、theme/composer预览及来源/信任/保存确认；复用目录与既有owner补tab、候选说明和类型化编辑，不复制参考巨类。"
confidence: high
---

# 面板与模型选择器

只读研究。未修改源码。源码基线 `0d30d589`；参考快照 oh-my-pi `c2cb79e4`、codex `4210c08d`。

**2026-10-17 源码复核**：本次只改文档，未新增动态或 PTY 验证，未读取真实 provider 配置。旧目录数量与渲染调用属于历史快照；以下结论已按当前工作树更正。ID 使用 `30/面板/P-xx`、`30/设置/SE-xx`、`30/设置/J-xx`，不得与其他文章同号混用。参考文件大小只作定位信息，不作成熟度或工作量证据。

## 1. 面板尺寸预算

### 1.1 算术链

1. `OverlayHost.render` 的缺省参数为 `availableRows = Math.max(0, height - 6)`（[overlay.ts:176](../../packages/ts-shell/src/cli/interactive/overlay.ts#L176)）；真实 surface 调用在 composer、suggestions、hints、activity 后传入剩余预算（[view.ts:207-240](../../packages/ts-shell/src/presentation/tui/surface/view.ts#L207)），不能把缺省值当成所有终端的实际预算。
2. `renderPanel` 再把容量切成 header / 列表 / footer / overflow（[panel.ts:36-45](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L36)）：

```ts
const overflow = capacity >= 4 && model.total > Math.min(MAX_OPTIONS, capacity - 2);
const listRows = Math.min(MAX_OPTIONS, Math.max(0, capacity - (overflow ? 3 : 2)));
```

3. `MAX_OPTIONS = 8`（[panel.ts:17](../../packages/ts-shell/src/presentation/tui/chrome/panel.ts#L17)）。

### 1.2 实测

直接调用 `renderPanel`（100 列，40 个选项）：

| 终端高度 | `availableRows` | 面板实际行数 |
|---|---|---|
| 24 | 18 | **11** |
| 40 | 34 | **11** |
| 60 | 54 | **11** |

**结论**：上述候选充足、capacity 至少11的调用返回11行（header 1 + 列表8 + overflow 1 + footer 1）。更小capacity或较少结果会更短。问题是 **panel候选至多8项**，大屏的额外容量无法继续增加候选，不能概括成任何高度都11行。

`options.ts` 的 `OptionModel` 本身支持窗口滚动（`window(capacity)`），所以限制纯粹来自 `MAX_OPTIONS`，不是模型层。

### 1.3 全屏 modal 形式**不受**此限

`renderModal`（[modal.ts:34-46](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts#L34)）按 `height` 计算容量：

```ts
const perOption = 2 + Math.max(0, chrome.detailRows);
const listRows = Math.max(perOption, height - FRAME_ROWS - statusRows.length);
const capacity = Math.max(1, Math.floor(listRows / perOption));
```

实测 200 个选项、`detailRows: 2`：

| 终端高度 | 总行数 | 可见选项 |
|---|---|---|
| 24 | 24 | 4 |
| 40 | 40 | 8 |
| 60 | 60 | 13 |

即 modal 随高度增长（该配置每项4行），**panel至多8项**。model 当前为 `form: "panel"`（[picker/model.ts:22](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L22)），因此受panel限制；resume当前是modal，不能归因于同一常量。

推论：若把 model picker 改为 `form: "modal"`，可见项数会随终端增长——但 4 行/项的密度在 24 行终端上只有 4 项，未必更好。真正的问题是 panel 的固定上限。

### 1.4 参考对照

- oh-my-pi 的 select/settings/tree/scroll 组件接受外层预算；具体面板仍有各自密度与chrome成本，不能仅由文件大小判断能力。
- codex `list_selection_view.rs` 用 `desired_height` 与外层钳制。
- Cheers 已有共享 `OptionModel.window(capacity)` 和显式容量，但panel另加8项封顶；应移除这层封顶，保留外层预算与modal独立布局。

## 2. 模型选择器

### 2.1 行数与可用性（实测）

`loadCatalog()` 返回 **24 provider / 49 model**；选择器为「有 model 的 provider 逐 model 一行、无 model 的 provider 一行」：

```text
picker rows: 51
providers: 24  models: 49
```

该51行是历史目录规模，不是禁用比例。当前 [model.ts:40-58](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L40) 仅对无model的provider占位行设置 `disabled: !ready`；普通model行只显示 `not connected` note，仍可选择。原稿“51/51全禁用”已撤回。

### 2.2 根因：`connected` 只读一张表

`modelPicker.load`（[picker/model.ts:33-35](../../packages/ts-shell/src/cli/interactive/picker/model.ts#L33)）：

```ts
const connections = normalizeConnections(config);
const connected = new Set<string>(connections.map((connection) => connection.provider));
```

`normalizeConnections` 在 `providerConnections` 缺失时返回 `[]`（[preset.ts:149-152](../../packages/ts-shell/src/core/commands/connect/preset.ts#L149)）。可用以下**合成输入**说明两条解析路径的差异，无需读取真实配置：

```text
providerConnections present? false
providerCredentials providers: openai-compatible
normalizeConnections -> 0 connections
=> picker connected set: (EMPTY)
```

于是该元数据集合不含provider，但不代表所有model行禁用，更不证明凭据在远端已失效。

**矛盾点**：`resolveProviderCredential` 可从独立credentials路径解析凭据（[providerCredentials.ts:44-60](../../packages/ts-shell/src/core/shell/providerCredentials.ts#L44)），选择器的connected集合却只认connections。修复应投影共享的、报告安全的配置可用性与来源；“已配置”与“远端已验证可用”分开。详见 [25](25-model-configuration-and-relays.md) §2.2。

### 2.3 同一缺陷也存在于 `/model list`

不是 picker 独有。`renderCatalogView` 的 connected 集合走同一条路（[modelCommandRuntime.ts:104](../../packages/ts-shell/src/core/commands/modelCommandRuntime.ts#L104)）：

```ts
connected: new Set(normalizeConnections(config).map(connection => connection.provider)),
```

因此TUI与文本列表都可能误标配置状态。共享投影应供两处消费，不能仅修picker，也不能为了UI而改变 `normalizeConnections` 的持久连接语义。

### 2.4 目录规模本身也偏大

即使修复 `connected`，24 provider / 49 model 平铺仍超过 8 行的可见上限。用户「如果我要配置多个模型呢？并且是不同中转站的」正是这个问题：多中转站会产生更多行。

### 2.5 omp 的 model-hub

`packages/tui/src/overlays/model-hub.ts` 达 **154 KB**，`model-browser.ts` **86 KB**，`model-picker.ts` 18 KB。从源码可见的结构：

- **tab 分组**：`MODEL_KIND_TABS = ["all", ...MODEL_KINDS]`（[model-hub.ts:355](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/model-hub.ts#L355)）与 `ROLE_TABS = ["all", "chat", "kind"]`（同文件 356 行），`Alt+←/→` 切换。
- **fuzzy 搜索**：`#catalogCorpus: { items, corpus: FuzzyCorpus<Model> }`（同文件 410-411 行）。
- **roles 视图**：把模型分配到角色（advisor/judge 等），`+ New role…` 行。
- **模型来源**：`model-registry.ts`（159 KB）、`model-presets.ts`、`custom-models.ts`、`account-pools.ts`——支持多账号池与命名预设。

即参考把「多中转站 + 多账号 + 角色分配」当成一个**带 tab 与搜索的专用界面**，而不是一个平铺列表。

## 3. 其他面板的同一问题

`MAX_OPTIONS = 8` 是 `form: "panel"` 的候选上限，包括 settings、permissions、help、statusItems。session是 `form: "modal"`（[session.ts:50-57](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L50)），已有高度增长，需另评估每项密度。其中：

- `/settings` 有 32 条（[settings.ts:53](../../packages/ts-shell/src/config/settings.ts#L53)）。
- `/help` 命令分组远超 8 行。
- 会话列表通常较长，但其可见项数取决于modal容量，不能用panel上限证明它受限。

因此「面板太小」是**横切**问题，不只是 model。

## 4. 差距表

| 维度 | Cheers | oh-my-pi | codex |
|---|---|---|---|
| 列表行数上限 | panel至多8；modal按height/detailRows | 由外层预算及组件chrome | 由 `desired_height` |
| 随终端高度增长 | panel到8项封顶；modal会增长 | 是，受各自预算限制 | 是，受外层限制 |
| 分组 / tab | 无 | kind tabs + role tabs | 有（list_selection_view） |
| 搜索 / fuzzy | 子串匹配（`OptionModel`） | `FuzzyCorpus` | 有 |
| 多账号 / 中转站 | 两套表，UI 只认一套 | 凭据池 + registry | provider 块 |
| 命名预设 | 已有 `/modelpreset` 及语法注册；交互可发现性另评估 | `/modelpreset` | profile |

## 5. 决策与任务（保留原 P-ID）

| # | 决策 | 选项 |
|---|---|---|
| P-01 | `MAX_OPTIONS` 是否改为随预算 | 已纳入：去掉8项封顶，使用实际可用预算 |
| P-02 | 列表预算抽象 | 技术决定：扩展既有panel/model接口，共享容量契约，不复制第二套列表系统 |
| P-03 | 模型面板是否分层 | 已配置项优先，按provider/connection分组并保留搜索；用户已将profile、命名模型预设、overlay、账号池纳入Phase20，域规格见25 |
| P-04 | 是否引入 tab 分组 | 已按34/Q-02纳入；仅显示有真实数据和动作的tab |
| P-05 | `connected` 是否读两表 | 共享配置可用性投影，区分配置存在、选择状态及远端验证 |
| P-06 | 未连接项是否仍显示 | 技术建议：单独可发现分组及明确配置动作；无可执行model的占位行才禁用 |

## 6. 未验证项

- 未在真实 TUI 中目视确认 11 行的观感。
- modal源码与历史实测已列§1.3；本次未新增真实终端验证，尤其缺小屏与长detail的端到端证据。
- omp model-hub 的完整交互（role 分配、账号切换）未逐流程核对。
- codex `list_selection_view.rs` 的具体常量未提取。

---

## 附：设置面板深度对照：omp 的 2002 行外壳与 Cheers 的扩展方案

只读研究。未修改产品源码。本文是 [35 §4.12](35-panel-inventory-full.md#412-settings-对照确实粗糙用户判断正确) 的深挖，回答「setting 该怎么学」。

用户已定：**扩展 `panel.ts`**（不新建平行面板系统）、**`/settings` 改造纳入范围**、`/omfg` 不做。“扩展”不是本篇P-06的含义；本篇P-06始终指未连接项显示策略。

### 1. omp 的 settings 外壳结构（实测）

`settings-selector.ts` **2,002 行**，只有 **3 个类**：

| 类 | 起始行 | 行数 | 角色 |
|---|---|---|---|
| `MultiSelectSubmenu extends Container` | 227 | 180 | 多选编辑器（数组型设置） |
| `ProviderLimitsSubmenu extends Container` | 407 | 208 | provider 配额编辑器（结构化对象） |
| `SettingsSelectorComponent implements Component` | **615** | **1,387** | 主外壳：tab + 列表 + 搜索 + 详情 |

`SettingsSelectorComponent` 有 **52 个私有方法**。关键分组：

| 组 | 方法（行号） |
|---|---|
| **tab** | `#switchToTab`(692)、`#buildSearchTabs`(795)、`#syncTabBarToSelection`(823)、`#showSettingsTab`(1193) |
| **搜索** | `#startSearch`(679)、`#setSearchQuery`(711)、`#endSearch`(776) |
| **渲染** | `render`(124)、`#describePrefs`(199)、`#describeCard`(521)、`nativeSheet`(180) |
| **编辑** | `#createSubmenu`(954)、`#createTextInput`(1057)、`#createProviderLimitsInput`(1085)、`#createMultiSelect`(1105) |
| **状态** | `#changedCount`(901)、`#isChanged`(915)、`#getCurrentValue`(911) |
| **鼠标** | `#handleMouse`(617)、`#routeMouseEvent`(621) |

#### 1.1 7 种编辑器类型（`#submenuOptions` 938 / `#create*` 系列）

| 类型 | 创建方法 | 行号 | 说明 |
|---|---|---|---|
| submenu | `#createSubmenu` | 954 | 枚举/对象子菜单 |
| text | `#createTextInput` → `createSettingsTextField` | 1057 | 自由文本，支持 secret 掩码 |
| providerLimits | `#createProviderLimitsInput` | 1085 | 结构化对象 |
| multiselect | `#createMultiSelect` | 1105 | 数组型 |
| boolean | （内联切换） | — | 直接切换 |
| number | （走 text） | — | `#formatTextInputValue` |
| json | （走 text，`ui.editor: "json"`） | — | `AnyUiMetadata.editor` |

**secret 掩码**：`createSettingsTextField` 的注释原文——「Current values prefill, including secrets retained behind Input masking; submitting an empty string clears the setting and validation errors stay inline」（[settings-selector.ts:159-163](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L159)）。即**空串 = 清除该设置**（不是设为空值），且校验错误**内联显示**。

#### 1.2 搜索：每 tab 一个语料 + 按 bestScore 跨 tab 聚合（实测算法）

[settings-selector.ts:1336-1376](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L1336)：

```ts
this.#searchCorpora ??= SETTING_TABS.map(tab => {
  const candidates: SettingItem[] = [];
  for (const def of getSettingsForTab(this.#context.settings.entries, tab)) {
    const item = this.#defToItem(def);
    if (item) candidates.push(item);
  }
  return { tab, corpus: new FuzzyCorpus(candidates, getSettingItemFilterText) };
});
for (let order = 0; order < this.#searchCorpora.length; order++) {
  const { tab, corpus } = this.#searchCorpora[order]!;
  const ranked = corpus.rank(query);
  const matched = ranked.map(result => result.item);
  if (matched.length === 0) continue;
  total += matched.length;
  tabResults.push({ tab, matched, bestScore: ranked[0]?.score ?? 0, order });
}
tabResults.sort((a, b) => a.bestScore - b.bestScore || a.order - b.order);
for (const result of tabResults) {
  const meta = TAB_METADATA[result.tab];
  items.push({ id: `__tab:${result.tab}`, label: `${theme.symbol(meta.icon)} ${meta.label}`, heading: true });
  this.#searchFirstMatch.set(result.tab, result.matched[0]?.id ?? "");
  items.push(...result.matched);
}
```

**四个要点**：

1. **每 tab 独立语料**，懒建（`??=`，只建一次）。
2. **跨 tab 结果按 `bestScore` 升序聚合**（分数越小越相关），同分按 tab 声明顺序（`order`）。
3. **每组前面插一行 heading**（`id: __tab:<tab>`），即搜索结果按 tab 分区显示。
4. `#searchFirstMatch` 记住每 tab 首个命中——用于搜索结果里按 Tab 跳转时定位。

#### 1.3 已改动计数（`#changedCount` 901）

```ts
#changedCount(tab: SettingTab): number {
  const cached = this.#changedCounts.get(tab);
  if (cached !== undefined) return cached;
  let count = 0;
  for (const def of getSettingsForTab(this.#context.settings.entries, tab)) {
    if (this.#isChanged(def, this.#getCurrentValue(def))) count++;
  }
  this.#changedCounts.set(tab, count);
  return count;
}
```

即「**非默认值的设置数**」，按 tab 缓存，显示在 tab 徽标上（[settings-selector.ts:822-824](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L822)）。

#### 1.4 tab 的分区模型（`TAB_GROUPS`）

[settings-defs.ts:66-110](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-defs.ts#L66) 为**每个 tab 声明有序分区名**，实测分区数：

| tab | 分区数 | 分区名 |
|---|---|---|
| appearance | 5 | Theme / Composer / Status Line / Display / Images |
| model | 7 | Thinking / Sampling / Prompt / Retry & Fallback / Advisor / Prewalk / Vision |
| interaction | 12 | Input / Approvals / Notifications / Speech / Collab / Stream / Magic Keywords / Startup & Updates / Power / Agent / Git / Skills |
| context | 4 | General / Compaction / Rules (TTSR) / Experimental |
| memory | 5 | General / Auto-Learn / Mnemopi / Hindsight / Sharpshooter |
| files | 4 | Editing / Reading / Read Summaries / LSP |
| shell | 2 | Bash / Eval & Runtimes |
| tools | 11 | Available Tools / Todos / Grep & Browser / Computer / IDA Pro / GitHub / Output Limits / Execution / Discovery & MCP / Extensions / Developer |
| tasks | 4 | Modes / Subagents / Isolation / Commands & Skills |
| providers | 6 | Services / Fireworks / Tiny Model / Protocol / Timeouts / Privacy |

**规则**：分区名**必须列在该 tab 的 `TAB_GROUPS` 里**（`UiBase.group` 的注释原文：「must be listed in TAB_GROUPS[tab]. Ungrouped settings render at the top.」，[settings-defs.ts:113](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-defs.ts#L113)）。即**未分组的设置渲染在 tab 顶部**。

#### 1.5 键盘提示按「焦点区」变化（`#footerHintText` 88）

实测有 3 种 hint 模式（[settings-selector.ts:124-146](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L124)）：

| 模式 | 提示 |
|---|---|
| `sections` | ↑↓ jump sections · tab to settings · switch tabs · close |
| `rows` | confirm/space change · tab switch tabs · type to search · close |
| `rows-sections` | confirm/space change · tab jump sections · type to search · close |

即**同一个 Tab 键在不同焦点区含义不同**（切 tab vs 跳分区）。

#### 1.6 实时预览

`#describePrefs` 里为 `appearance` tab 注入预览子节点（[settings-selector.ts:1170-1180](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L1170)）：

```ts
if (!searching && this.#currentTabId === "appearance") {
  const source = this.#getStatusPreviewString();
  if (memo.preview?.source !== source) {
    memo.preview = { source, node: … };
  }
}
```

**预览按 `source` 字符串记忆化**——只有预览内容变了才重建节点。这与 Cheers 的 `#memo` 思路一致（见 §3）。

#### 1.7 三种控件形态的选择规则（`#submenuOptions` 的 `style`）

[settings-selector.ts:925-948](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L925) 决定一个设置用哪种控件：

```ts
case "boolean": return { k: "switch", on: value === true };
case "enum":    return { k: "choice", value: shown, options: def.values.map(v => ({ value: v, label: v })) };
case "submenu": {
  const options = this.#submenuOptions(def).map(o => ({ value: o.value, label: o.label, detail: o.description }));
  // Few short plain choices segment; described ones and live-previewed ones keep the menu.
  return { k: "choice", value: shown, options,
    style: PREVIEWED_SETTINGS.has(def.path) || options.some(o => o.detail) ? "menu" : "auto",
    mono: options.every(o => o.label === o.value) };
}
```

**规则（注释原文）**：**选项少且无描述 → 内联分段（`style: "auto"`）；有描述或有实时预览 → 弹出菜单（`style: "menu"`）**。

`PREVIEWED_SETTINGS`（[settings-selector.ts:79-87](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L79)）是**写死的 7 个键**：

```ts
const PREVIEWED_SETTINGS = new Set([
  "theme.dark", "theme.light", "statusLine.preset", "statusLine.separator",
  "statusLine.contextLine", "snapcompact.shape", "composer.shape",
]);
```

即 **omp 的实时预览也是「白名单制」，覆盖 7 个键**。对照 Cheers 的 `settingPreview` 覆盖 2 个键（`theme` / `tui.composerShape`）——**数量上是同一量级的设计**，不是「omp 有 Cheers 没有」。

#### 1.8 行的渲染契约（`settings-list.ts:699-736`）

这是可比较的展示契约，按 Cheers 既有投影与状态边界实现，不机械移植。`#describeItem`：

```ts
const changed = item.changed === true;
const signature = `${item.heading}\0${item.label}\0${value}\0${changed}\0${item.warning ?? ""}\0${item.description ?? ""}`;
const cached = item[kNativeItem];
if (cached?.signature === signature) return cached.node;      // 按签名记忆化
if (item.heading) {
  described = node("item", { label: [span(plainLine(item.label), "strong")], disabled: true,
                             role: "omp.settings.heading" }, undefined, item.id);
} else {
  const label: TspSpan[] = [span(plainLine(item.label), changed ? "accent" : undefined)];
  if (item.warning && this.#theme.warningMark) label.push(span(` ${plainText(this.#theme.warningMark)}`, "warning"));
  const detail: TspSpan[] = [];
  if (item.warning) detail.push(span(plainLine(item.warning), "warning"));
  if (item.description) { if (detail.length > 0) detail.push(span(" ")); detail.push(span(plainLine(item.description), "muted")); }
  described = node("item", { label, value: [span(value, changed ? "accent" : "muted")], detail: detail.length > 0 ? detail : undefined }, undefined, item.id);
}
```

**四条可移植规则**：

| 规则 | 实现 |
|---|---|
| 已改动 vs 默认 | label 与 value 都用 `accent`，未改动用 `muted` |
| 警示 | label 后追加 `warningMark` span（`warning` 角色），并把 `warning` 文案置于 description 之前 |
| 记忆化 | 按 `heading+label+value+changed+warning+description` 拼签名，未变则复用节点 |
| 分区标题行 | 单独一种 item（`role: "omp.settings.heading"`，`disabled: true`） |

**注意 `changed` 直接驱动颜色**，表示相对默认值的偏离；这与“待保存草稿”不是同一状态。Cheers可采用颜色作为辅助，但不能用它替代 Effective/Accepted/Stored、信任来源、restart 与 Pending，详情需要持续可检查。

#### 1.9 多选与结构化编辑

| 类 | 行数 | 编辑什么 | 键位 |
|---|---|---|---|
| `MultiSelectSubmenu`（227-406） | 180 | 有序/无序的枚举数组 | Space 切换成员；←/→ 移动；**数字 1-9 直接定位**；鼠标点击切换、拖拽重排 |
| `ProviderLimitsSubmenu`（407-614） | 208 | `Record<string, number>`（provider 并发上限） | 选 provider → 打开 `TextFormField`；校验正整数；空 = 清除 |

`MultiSelectSubmenu` 的提示行（[settings-selector.ts:284](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L284)）：

```ts
`  Click to toggle · drag selected items to reorder · ${formatKeyHints(["left","right"])} move · 1-9 place · ${back}`
```

**无序时渲染 `○`/`●`，有序时渲染 `1.`/`2.`/`·`**（[settings-selector.ts:224](https://github.com/can1357/oh-my-pi/blob/c2cb79e4c227aa4b22c4ccb933ff72fd88bceba4/packages/tui/src/overlays/settings-selector.ts#L224) 注释）。

### 2. Cheers 侧：`panel.ts` 扩展可行性（实测）

#### 2.1 只有 1 个调用者

`renderPanel` 的调用点（全仓 grep）：

| 位置 | 用途 |
|---|---|
| [overlay.ts:219](../../packages/ts-shell/src/cli/interactive/overlay.ts#L219) | **唯一的生产调用者** |
| `sidebarPanelRenderer.ts:72,76` | **同名但无关**（`renderPanelLine`，侧栏自己的函数） |

**结论：生产调用点集中，适合扩展既有owner；不代表行为影响仅1个文件。** 所有panel picker都会受容量、行渲染、键位、预览及鼠标命中改变影响，必须按行为列回归范围，不能以调用点数量判低风险。

#### 2.2 现有的双形态分发（关键结构）

`overlay.ts:176` 的 `render(width, height, availableRows)` 已经在做**形态分发**：

```ts
if (picker.form === "modal") {
  return renderModal(this.model, { … detailRows: picker.detailRows ?? 2, … }, width, height);
}
return renderPanel(this.model, { title, empty, multiple, filterable, footer, hideCount, onOptionRow }, width, Math.max(0, Math.min(height, availableRows)));
```

即 **`form: "modal"` → `renderModal`（支持多行 detail），否则 → `renderPanel`**。而 `renderModal` **已经支持 `detailRows`**（[modal.ts:22,39,78-80](../../packages/ts-shell/src/presentation/tui/chrome/modal.ts#L22)）：

```ts
const perOption = 2 + Math.max(0, chrome.detailRows);
// …
for (const line of wrapToWidth(option.detail, detailWidth).slice(0, chrome.detailRows)) { … }
```

**这是一个重要的既有能力**：Cheers 的面板**已经能渲染多行 detail**，只是 `panel.ts` 那条路径固定单行。

#### 2.3 相对容器模型缺什么（实测）

| 能力 | omp `OverlayPanel` | Cheers `renderPanel` |
|---|---|---|
| 子组件列表 | `children: Component[]` | **无**（只有 `OptionModel`） |
| 任意行内容 | `child.render(width)` | 只有 `renderRow` 一种 |
| 分隔线 | `PanelDivider` → 整行 | **无** |
| 标题边框 | `topBorder(width, title)` | header 是**无边框的一行** |
| 上下边框 | 有 | **无** |
| 内宽 | `width - 4` | `width`（无内边距概念） |
| 记忆化 | `#memo` 按 width+title+children | **无** |

#### 2.4 建议的扩展接口（草案）

**保留 `renderPanel` 签名不变，新增可选的 `sections` 通道**：

```ts
export interface PanelSection {
  readonly heading?: string;              // 分区标题行（对应 omp 的 group）
  readonly rows: readonly string[];       // 预渲染的行，或
  readonly render?: (width: number) => readonly string[];  // 延迟渲染
  readonly dividerBefore?: boolean;       // 对应 PanelDivider
}

export interface PanelChrome {
  // …现有字段…
  readonly sections?: readonly PanelSection[];   // 新增：非列表内容
  readonly frame?: boolean;                      // 新增：是否画上下边框
}
```

**为什么用 `sections` 而不是 `children`**：Cheers 的渲染是**纯函数返回 `string[]`**（`renderPanel` 无状态），而 omp 的 `Component` 是**对象 + 状态**。引入 `Component` 接口会改变 `overlay.ts` 的整个渲染模型（现在它拿 `model` + `chrome` 算行）。`sections` 保持了「纯函数」的性质，同时给出「插入任意行」的能力。

**取舍**：`sections` 是展示通道，本身不提供交互。`form: "modal"` 只改变列表布局，也不自动获得任意表单能力。需要内联/多字段编辑时，必须为编辑器定义焦点、校验、暂存、确认及取消路由，并复用现有input生命周期。

### 3. 重大发现：Cheers 已有 `options: "runtime"` 的等价物

[35 §4.7](35-panel-inventory-full.md#47-theme应挪进-settings用户裁决且与-omp-一致) 提出 T-01（给 `theme` 接运行时候选），并推测需要新建机制。**实测不需要**——Cheers 已有完整基础设施：

#### 3.1 `CatalogKind`：16 个直接种类另加 5 个 memory 种类

[request.ts:21](../../packages/ts-shell/src/cli/interactive/completion/request.ts#L21)：

```ts
export type CatalogKind = "theme" | "skill" | "tools" | "session" | "entry" | "tree" | "thread"
  | "mcp" | "grant" | "connection" | "file" | "directory" | "reference" | "model" | "provider"
  | "workflow" | MemoryCatalogKind;
```

`createCatalogLoader`（[catalog.ts:67](../../packages/ts-shell/src/cli/interactive/completion/catalog.ts#L67)）提供统一的 `load(kind, signal, query?, progress?)`，且：

- **有在途去重**：通用分支用 `catalogIdentity(...) + kind` 识别单个pending，完成后清除；不是统一的已完成结果缓存（[catalog.ts:68-102](../../packages/ts-shell/src/cli/interactive/completion/catalog.ts#L68)）；
- **有失效入口**：`invalidate()` 清除pending；session/skill等专用源还有各自观察策略；
- **有观察**：`observe(kind, query, changed)`——如 `observeThemes` 监听主题目录变化。

#### 3.2 直接可用的候选源

| 设置字段 | 需要的候选 | 已有来源 |
|---|---|---|
| `theme` | 主题名 | `kind: "theme"` → `[...new Set(["auto", ...listThemes(cwd, themePaths)])]`（[catalog.ts:59](../../packages/ts-shell/src/cli/interactive/completion/catalog.ts#L59)） |
| `allowedTools` / `disabledTools` | 工具名 + 描述 | 现有 `tools` 源可提供建议，但它来自当前可见池，不能充当解除disabled或扩展allowlist时的全集；须保留未知/已禁用的stored值 |
| `hiddenToolPrefixes` | 工具名前缀 | 可提供前缀建议，必须允许合法自定义前缀；不可改成完整工具名的强制多选 |
| `tui.statusItems` | 状态项 id + 说明 | `STATUS_ITEMS`（[items.ts:67](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L67)），每项已有 `label` 与 `describe` |
| `tui.composerShape` | 8 种形态 | 已在 `choices` |
| `providerConnectTimeoutMs` 等 | — | 数值，无需候选 |
| `modelTokenBudgets` / `denyRules` | 结构化对象 | 需专门的编辑器（对应 omp 的 `ProviderLimitsSubmenu`） |

**独立 `/statusline` 的 `statusItemPicker` 支持实时预览**（[picker/statusItems.ts:10-14](../../packages/ts-shell/src/cli/interactive/picker/statusItems.ts#L10)）。但 `/settings` 的暂存路径目前传 `preview: () => {}`（[picker/settings.ts:26](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L26)），不能把另一入口的预览能力算成这里已经接线。

**`STATUS_ITEMS` 的每项已经有 `label` + `describe`**（[items.ts:67-83](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L67)），例如：

```ts
{ id: "permission-scope", label: "permissions", describe: "how much a turn may do without asking" },
```

**这正是 omp 的 `options: [{value, label, description}]` 形态**——Cheers 的 `Option` 也有 `label` + `detail` 字段（[options.ts:13-28](../../packages/ts-shell/src/presentation/tui/chrome/options.ts#L13)）。

#### 3.3 结论：T-01 从「新建机制」降级为「接线」

| 原判断 | 修正 |
|---|---|
| 需新建平行的「运行时候选」目录系统 | 不需要。已有Catalog加载/取消/观察可复用；设置仍需类型化提供者适配 |
| `theme` 完全没有动态候选 | 错误：`settingDetail` 已用 `host.themes.names()` 注入choices（[settings.ts:73](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L73)）；应补说明与来源，统一观察和刷新策略 |
| 候选值无说明 | `Option.detail` 字段已存在，只是 `settings.ts` 的 `choices` 生成逻辑没填它（[config/settings.ts:46](../../packages/ts-shell/src/config/settings.ts#L46) 只取 `schema.enum` 裸值） |

**因此 SE-04 的实际工作是**：把 `CONFIG_SETTINGS` 的 `choices` 从「裸值数组」改为「可带 label/detail 的项」，并让 `settings.ts` 的渲染走 `Option.detail`。

#### 3.4 实测：`/theme` 已经在产出候选列表（含描述与「在用」标记）

`/settings theme` 现在的输出是**纯文本说明**：

```text
### theme
Theme name, including custom themes and auto
Group: Display. Input: string. Applies: immediate.
Editable scope: project, user. Merge: replace.
Open /settings, select the field, stage a value, and choose Apply to save. …
```

而 `/theme`（另一个命令）**已经在产出结构化候选**：

```text
### Themes
- `auto` — follow terminal appearance
- `dark` — Dark theme (default) (built in) **(in use)**
- `dark-contrast` — High contrast on a black terminal background (built in)
- `light` — Light theme (built in)
- `light-contrast` — High contrast on a white terminal background (built in)
```

数据源（[themeCommandRuntime.ts:32-45](../../packages/ts-shell/src/core/commands/themeCommandRuntime.ts#L32)）：

```ts
const names = listThemes(context.cwd, extraPaths).filter((name) => name !== "auto");
const where = themeSource(name, context.cwd, extraPaths) === "built-in" ? "built in" : "from disk";
const mark = name === active && selectedTheme() !== "auto" ? " **(in use)**" : "";
```

即**同一个字段的三条信息（名称 / 描述 / 来源 / 是否在用）已经全部算好了**，只是 `/settings` 那条路径没用上。

**结论（SE-04）**：将主题名称、描述、来源及选中态投影收敛到主题owner的可复用提供者，供命令、补全和settings消费；继续使用 `host.themes` 的revision/lease。需同时覆盖目录加载失败、观察解除、当前值不在新目录及取消，不能估算成只搬一段字符串组装。

同理适用于 `tui.statusItems`：`STATUS_ITEMS`（[items.ts:67](../../packages/ts-shell/src/presentation/tui/chrome/items.ts#L67)）每项已有 `label` + `describe`，且 `/statusline` 命令已有面板（`picker/statusItems.ts`）——该 picker 的候选组装同样可复用。

### 4. Cheers settings 的缺陷复核（逐条确认）

| # | 断言 | 复核 | 证据 |
|---|---|---|---|
| D1 | 无 tab 分页 | **确认** | `picker/settings.ts` 无 tab 概念；`CONFIG_SETTINGS` 只按 `group` 排序 |
| D2 | settings列表无fuzzy排序 | **确认此路径** | OptionModel.applyFilter使用子串；slash suggestions另有排序，不能据此说全产品没有fuzzy能力 |
| D3 | 通用编辑器是 JSON 输入 | **确认但有限定** | 无choices字段的通用 `valueEditor` 使用JSON.parse；theme动态choices与statusItems专门编辑器不走此通用路径 |
| D4 | 通用候选缺少逐项说明 | **确认** | 静态choices是boolean/enum裸值；theme另有动态名称注入，仍缺类型化label/detail投影 |
| D5 | 无实时预览 | **推翻（错误）** | `settingPreview`已支持theme/composerShape，theme使用可撤销revision租约，overlay路由preview生命周期；调用次数不是正确性证明 |
| D6 | 无通用 warning / 条件显示元数据 | **限定成立** | ConfigField无这两个展示字段；现有详情已显示projectTrustNotice、restart与未确认保存，不能说没有任何警示 |
| D7 | 无已改动计数 | **确认** | 全文件 grep `changed`/`dirty`/`modified` 只命中一处**无关**的并发守卫（[settings.ts:95](../../packages/ts-shell/src/cli/interactive/settings.ts#L95)：「Settings changed or the session moved」），与「本 tab 有几个非默认值」无关 |

#### 4.0 复核结论：按能力路径分别判断，不计简单成立比例

**D5 被推翻**：theme/composer已有预览lease；statusItems在settings中的回调尚为空。D3/D4/D6也只能按通用编辑器、候选描述和通用展示元数据的范围表述，不能计作全面缺失。调用次数不证明生命周期正确。

**教训（与 32 号的 S2「只测一侧」同型）**：对照时**必须查目标侧是否已有该能力的另一种实现**，不能因为参考侧用某个名字就断定目标侧没有。

#### 4.1 实测：32 个设置中只有 11 个有 `choices`

```text
有 choices (11)：tuiMode(2) tui.composerShape(8) tui.diagrams(2) retryEnabled(2)
                 attentionOnIdle(2) offline(2) cacheWarming(3) agentMode(2)
                 steeringMode(2) followUpMode(2) enableMcpTools(2)
schema 无 choices (21)：其中 theme 在有 host.themes 时注入动态候选，statusItems 走专门编辑器
```

**标准theme host存在时，通用JSON编辑路径为19/32**；缺少theme host则theme也回落通用路径。32是schema展示元数据数量，实际可编辑项还受scope与public策略筛选。候选适合枚举，数值、任意对象与规则仍需要类型化编辑器，不能宣称全都变为可选项。

#### 4.2 详情面板现有的三态溯源（Cheers 优于 omp 之处）

`settingDetail` 的选项行（[picker/settings.ts:57-68](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L57)）：

```ts
{ id: 'effective', label: `Effective: ${compact(current.effective)}`, note: current.source, disabled: true },
{ id: 'accepted',  label: `Accepted: ${compact(current.requested)}`, note: current.restartRequired ? 'restart required' : current.requestedSource, disabled: true },
{ id: 'stored',    label: `Stored: ${compact(current.stored)}`, note: `${draft.scope} file`, disabled: true },
if (current.projectTrustNotice) options.push({ id: 'trust', label: 'Project value inactive', … });
if (pending) options.push({ id: 'pending', label: `Pending: ${compact(pending.value)}`, note: setting.policy.application, disabled: true });
```

**分层状态并列**：Effective / Accepted / Stored / Project-inactive / Pending。**改造时必须保留这些语义**，见[25来源与保存契约](25-model-configuration-and-relays.md#11-保存应用与预览)。参考选择器的单值行不证明整个参考配置系统没有来源或信任机制。

### 5. 改造方案（SE-01…SE-06 落到具体改动）

| # | 任务 | 具体改动 | 依赖 |
|---|---|---|---|
| **SE-01** | tab 分页 | `CONFIG_SETTINGS` 的 7 个 group → 7 个 tab；`Picker` 需要一个 tab 概念（`overlay.ts` 现无）。参考 §1.4 的分区模型（每 tab 声明有序分区） | 需先扩 `panel.ts` 或新增 `Picker.tabs` |
| **SE-01b** | 行渲染契约 | 借鉴changed辅助色、warning优先与分区标题；“相对默认”和“未保存”分开，来源与信任状态不被颜色替代；缓存键含影响输出的theme/width/revision | 与 SE-01 联动 |
| **SE-02** | 模糊搜索 | 在OptionModel/展示搜索owner共享确定性排序，复用已有slash排序决策；跨tab按稳定分数组合，保留精确与字面命中优先 | 与 SE-01 联动 |
| **SE-03** | 候选值说明 | 类型化候选区分稳定id、原始value与label/detail；同时更新settings消费者内的展示、索引、相等比较、暂存、preview和apply，不能只改一行 | — |
| **SE-04** | 运行时候选 | 复用theme/tools目录和STATUS_ITEMS，在各域owner提供报告安全的候选投影，由SettingsHost适配；config/settings保留schema/策略/静态展示元数据，不反向导入CLI completion loader。theme继续沿host.themes更新与lease，工具全集和prefix单独定义 | SE-03 |
| **SE-05** | warning / condition | 展示域定义类型化availability/warning投影和reason；不向安全配置策略塞无解释的condition字符串。失效、未信任与未知stored值保持可检查 | — |
| **SE-06** | 实时预览 | 保留theme/composer可撤销preview；为settings的statusItems暂存路径接视觉预览，统一结束/撤销协议，不把预览当持久保存 | — |

**建议顺序**：先锁定保存与来源契约，再SE-03/04候选及类型化编辑 → SE-05 → SE-01/01b/02 → SE-06。数值、对象、规则仍按类型编辑与schema校验，不把19个通用JSON字段都伪装为有限枚举。

### 6. 技术决定（保留原 J-ID）

| # | 决策 | 选项 |
|---|---|---|
| J-01 | tab 的实现位置 | 技术决定：展示原语属presentation；Picker声明tab与选中状态，overlay路由事件，不向渲染函数堆业务 |
| J-02 | fuzzy 搜索算法 | 技术决定：共享确定性排序，精确/前缀/子串优先再fuzzy；跨tab稳定聚合，按真实语料验证噪声，不照搬参考类 |
| J-03 | `choices` 的类型变更范围 | 一个生产消费者模块、多个读取点；所有value语义与preview/index消费必须一起迁移 |
| J-04 | 是否引入分区 | 技术决定：tab内允许有序分区，未分组项有明确位置，不为参考对齐强造空分区 |
| J-05 | 7 个 tab 是否合理 | 技术默认：沿现有7个group交付，当前数量不构成缺陷；后续信息架构变更另提产品建议 |

### 6.1 必须保留的生产契约与反例

- [openSettings](../../packages/ts-shell/src/cli/interactive/settings.ts#L78) 的public/scope筛选、schema校验、substrateRevision守卫、单次草稿、原始edit baseline写入、写后读确认与refresh结果必须完整保留；saved、applied、restart-required、unverified分别呈现。取消/切scope不写盘。
- Effective/Accepted/Stored/Project-inactive/Pending可在详情区组织，但不能由changed高亮替代。unknown/失效目录值保持显示并可移除；环境、launch override、project trust及merge策略仍解释实际生效来源。
- 预览lease按revision获取，关闭、返回、错误、项目切换、外部主题更新和保存失败都幂等撤销；任何preview都不增加写入授权。
- 动态候选覆盖loading/empty/error、取消与observer解除。工具可见目录不是全目录；允许移除已禁用/未知stored项，保留allowlist `undefined` 与空数组不同、deny union和prefix语义，避免UI失败时清空限制。
- 两栏、tabs与footer鼠标命中按实际行列矩形重建；过滤或resize后不能命中旧id。窄屏详情可下钻，仍可检查保存范围及失败原因。

### 7. 未验证项

- `#describePrefs`（813）/ `#describeCard`（1135）的**完整节点树未逐行读**（只读了子节点顺序与关键片段）。重派的 `SettingsInternals` 子代理给出了行号与结构，主代理复验了 `#describeCard`/`#describePrefs`/`#createSubmenu` 的**行号正确**（1135/813/1568），以及 `settings-list.ts:699-736` 的行渲染契约（§1.8）与 `PREVIEWED_SETTINGS` 的 7 个键（§1.7）。
- `settings-list.ts` 共 1,131 行，只读了 `#describeItem` 与 `#hintText` 附近。
- `FuzzyCorpus` 的**打分算法未读**（只读了调用方式与排序规则）。
- `MultiSelectSubmenu`（227-406）与 `ProviderLimitsSubmenu`（407-614）的**内部实现未读**。
- 未实测 Cheers 面板在真实终端里的渲染效果。
- `panel.ts` 的 `measureLabelWidth`（128 行起）**实际行号与子代理报告不符**（子代理报 128-133，实测该范围是 `renderFooter` 的结尾）——子代理的行号有偏移，本文的行号为主代理实测。
- 未读 `#routeMouseEvent`(621) 与 `#handleMouse`(617) 的鼠标实现细节。

### 8. 子代理说明

| 子代理 | 结果 |
|---|---|
| `SettingsShell` | **失败**（`content_filter`，5m08s）——重派为 `SettingsInternals` |
| `SettingsInternals` | 完成（8m14s）。**行号经主代理复验正确**（`#describeCard` 1135 / `#describePrefs` 813 / `#createSubmenu` 1568 / `settings-list.ts:699-736`）。其内容已并入 §1.7–1.9 |
| `SettingsCheers` | 完成，但**行号有偏移**（如 `measureLabelWidth` 报 128-133，实测该处是 `renderFooter` 结尾）。本文只采用经复验的内容：`renderPanel` 只有 1 个生产调用者（§2.1）、`renderModal` 已支持 `detailRows`（§2.2）、容器模型缺口清单（§2.3） |
