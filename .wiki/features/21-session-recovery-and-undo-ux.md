---
title: "21：会话恢复、撤销语义与分支导航交互体验设计"
category: article
sources: [user-experience-report-2026-10-05, current-source-28ff98ce, 14-user-experience-research, pi, oh-my-pi, codex]
created: 2026-10-05
updated: 2026-10-07
tags: [research, ux, sessions, recovery, undo, rewind, tui]
summary: "按已确认的 current 会话焦点、核心会话文件逻辑字节与最近已提交编辑操作撤销语义，修正 picker 生命周期、恢复安全链和分支反馈方案；区分源码事实、现场未知与后续生产验收。"
confidence: high
---

# 21：会话恢复、撤销语义与分支导航交互体验设计

## 1. 范围、事实与用户裁决

本文承接 [14 号文档](14-user-experience-research.md) §8，覆盖 `/resume` 焦点、会话大小、`/undo` 文件恢复以及双 Esc 分支导航。源码基线为 `28ff98cee8c4dd63e6752452f73a362ed3559ae3`。2026-10-05 复审只修改文档，没有修改产品代码、执行恢复写入或复跑历史探针。

证据分为**源码事实**、**历史观察**、**已裁定方案**与**待实施验证**。参考项目只能支持被定向检查的具体决策，不能代替 Cheers 的安全与视觉验证。

用户已确认的产品语义：

1. 每次打开 resume，标记并聚焦**当前活动 session**，不一律归零。`current` 是稳定 session ID 指向的活动身份；高亮移动不改变 current。
2. 会话面板用文件大小替代消息条目数。本文裁定口径为核心会话文件的逻辑字节和，见 §3。
3. `/undo` 的单位是**最近一次已提交的编辑操作；一次多文件 patch 算一个操作**。它不按整轮对话回滚，也不改变 `/back`、`/tree` 和双 Esc 的对话导航语义。

| 问题 | 当前事实 | 已裁定方案 |
|---|---|---|
| resume 重开焦点 | 生命周期隔离、按运行时 current ID 聚焦及动作复验已实施，见 §2.6–2.7 | 完整生命周期 reset + generation；按稳定 current ID 聚焦 |
| 大小指标 | `turns.length` 是消息条目数；当前列表没有落盘大小投影 | session read/store owner 异步有界统计核心文件逻辑 bytes |
| undo | 只描述最新快照并打印 restore 命令；无 session 归属和已提交操作筛选 | 先建立 operation receipts、加固恢复写链，再提供预览/批准/执行 |
| 双 Esc 反馈 | 分支切换、note 与 draft 链路已存在；真实现场视觉根因未证明 | 修复失败后的状态真值，验收两种终端模式中的可见导航结果 |

## 2. Resume：current 身份与 picker 生命周期

### 2.1 当前源码链路

[OverlayHost](../../packages/ts-shell/src/cli/interactive/overlay.ts#L84) 每次打开均创建独立的 [OptionModel](../../packages/ts-shell/src/presentation/tui/chrome/options.ts)，同一打开期间复用其过滤与选择状态。

- `open()` 重置候选、过滤、多选、临时操作和行映射；初次 load 与 reload 共用取消和代际校验，有 `initialSelection` 才显式 focus。
- [sessionPicker](../../packages/ts-shell/src/cli/interactive/picker/session.ts) 的 `initialSelection` 取本次加载捕获的运行时 current ID；标记与用户移动的高亮分开。
- `OptionModel.applyFilter()` 现按稳定 ID 保留焦点，目标离开集合后回退首个 enabled；reload 保留用户明确取消的多选，删除/disabled 条目移出 chosen。
- load/reload 与异步 rename/delete 完成现在同时绑定 generation 和请求 controller；旧请求成功、失败或旧操作完成均不能刷新新面板。同对象重开仍有独立代际。

14 号文档记录了选择器重开的历史观察。原稿“15 个模型第 10 项切到 4 个会话第 4 项”是可由 clamp 推导的反例，**没有本次实测证据**，不能当独立探针通过记录。

### 2.2 参考证据与采用边界

pi 的 [session-selector.ts](../../../pi/packages/coding-agent/src/modes/interactive/components/session-selector.ts#L290) 把选中索引放在列表组件内，并在更新时根据稳定 session path 保持已触及的选择。该文件展示的是 message count 和 modified age，支持 threaded/recent/relevance 等排序；原稿把它写成“按 mtime 排序并显示大小”不成立。

这支持“生命周期初始化与列表内更新分开”“更新按身份保持”的设计，不证明所有 picker 必须永远聚焦第一项。本产品 current 默认焦点直接来自用户裁决，无需用未经核实的“Codex/oh-my-pi 每次一律归零”作为理由。

### 2.3 统一生命周期契约

以下为实现契约；当前交付与验证见 §2.6–2.7：

1. **打开/关闭**：每次 open 生成新的 generation；关闭使其失效并结束预览、取消可取消的读取。清空上一 picker 的候选、filter、cursor、scroll、chosen、多选、行映射及临时 rename/delete 状态，再初始化本次上下文。不存在依据不足的通用 `preserveCursorOnOpen` 逃生开关。
2. **加载**：load/reload 结果同时携带 generation、请求序号、workspace/session identity；只有仍属于当前打开实例且是最新请求的结果可发布。对象引用相同不足以判断请求仍有效。
3. **初始焦点**：先应用 picker 声明的有效初始 ID；resume 取 `runtimeContext.session.id`，model/theme 等取各自当前值。无当前语义、目标无效或不可选时才回退首个有效匹配；空列表和全 disabled 列表没有可提交项。
4. **打开后过滤与更新**：过滤不触发整套 open reset；尽可能保留当前高亮的稳定 ID，目标离开匹配集才选择有效回退。reload 后按 ID 保留用户当前选择，不继承旧 index。记录选中与过滤状态属于当前 generation。
5. **提交与异步变更**：apply、rename、delete 绑定 session ID/operation identity 和 generation；确认后再次验证目标仍在允许范围。过期回调不得改变新面板、当前会话或 draft。执行途中状态变化按动作契约处理，不能静默改写被操作对象。
6. **预览**：关闭、错误、切换面板均恢复临时预览；导航高亮不触发文件保存或其他副作用。

原稿 `resetCursor()` 向不存在的 `offset` 字段赋值，且没有清掉 `chosen`；已撤除这段伪代码。具体状态由拥有它的 model/overlay 负责复位，不能凭一个方法名声称完整 reset。

### 2.4 current 的展示、范围与稳定排序

`current` 直接使用运行时活动 session ID，不新建另一份易失步的持久指针。current 标记与可移动高亮分别渲染；仅移动光标或搜索不会切换 session。

列表按 `updatedAt DESC`，相同时以稳定 ID 作 tie-break。若 current 只是落在最近 40 条限制之外，owner 可额外纳入这一条，仍保持有界结果。**不能为了 current 绕过 workspace/trust/可恢复性过滤**。已删除、不可恢复或被用户搜索隐藏时说明原因，并焦点回退到当前匹配集中的首个有效项；禁止跨工作区寻找另一个“近似 current”。

恢复成功后才发布新的活动 session 身份；失败、permission-pending 或 unknown 不得提前把 current 标记移过去。切项目后旧列表结果和针对旧项目的选中请求都必须失效。

### 2.5 验收范围

- 同一 picker 两次 open；不同 picker 切换；同对象重开；旧 load/reload 比新结果更晚返回。
- filter/cursor/scroll/chosen/rename/delete/preview 状态不跨生命周期泄漏。
- current 在最近列表内、在截断外、已删除、被 filter 隐藏、不可恢复；空列表和全 disabled。
- 稳定排序与数据变更后按 ID 保持选择；Enter 使用预览时确认的目标身份。
- 现有 [options tests](../../packages/ts-shell/src/presentation/tui/chrome/options.test.ts)、[overlay tests](../../packages/ts-shell/src/cli/interactive/overlay.test.ts) 与 [rewind tests](../../packages/ts-shell/src/cli/interactive/picker/rewind.test.ts) 按新契约评估，不预先声称“既有测试完全不受影响”。

### 2.6 SES-01 通用生命周期已实施部分（2026-10-07）

- 首次加载与刷新复用同一 OverlayHost 方法；可选 AbortSignal 在换请求、关闭和接受时撤销，忽略取消的 producer 仍受身份/代际守卫。现有同步磁盘读取不能被 signal 物理打断，没有将可取消接口当作 I/O 性能证据。
- rename/delete 一经确认执行，关闭面板不宣称撤销已接受的写入；完成只刷新当时的实例，操作期间屏蔽重复键/鼠标/粘贴提交。拒绝 note 可见，异常只提示结果未确认，不泄露原始异常，不许用错误路径显示成功；恢复面板 action owner 的忙碌/current/工作区复验见 §2.7。
- 过滤、排序和 live options 更新以稳定 ID 保持单选；多选明确取消不会因旧 selected 标志在 reload 时被复选，已删除/disabled ID 清除。空或全 disabled 集合不可提交，显式 approval shortcut 也须命中 enabled ID；加载期间 Enter 不应用未知选项。预览跟随过滤/替换的真实焦点，加载失败结束临时预览，并与成功空集合区分。
- Node 20.3 构建和 172 项通过；三组有效反转覆盖 reload 代际、操作完成归属及焦点身份，恢复后 64 项通过。实际 regular/fullscreen 均验证报告会话→resume→rename→刷新→取消 delete→重开→40 列，配置未改、零 provider 请求、退出 0。详见 [主裁决 §8.102](phase-19-decisions.md#8102-ses-01选择器加载与异步操作生命周期)。
- current 部分随后在 §2.7 交付。会话大小/列表索引归 SES-02 后续工作，W5 和完整 Phase 19 尚未完成。

### 2.7 SES-01 current 身份与动作复验（2026-10-07）

- [selection owner](../../packages/ts-shell/src/session/navigation/selection.ts)沿用路径身份和 `sessionHasReentrySurface`，仅纳入当前项目已有可重入内容的会话；普通重开允许 completed，不误用仅服务异常恢复的 eligibility。最近 40 条按 updatedAt/精确 ID 排序，current 在限制之外时额外纳入，仍经过相同过滤。当前目录指针不影响运行时 current；缺失/不可读、跨项目、无保存内容与搜索隐藏分别说明。
- 提交 resume/rename/delete 前验证 offered ID、捕获与实时 session/project、忙碌状态、重新读取的目标存在/范围/内容，以及请求 ID 与 metadata ID 相等。删除当前会话检查请求 ID，不信任可变 metadata 身份。沿用现有动作 owner，不声称跨进程租约或跨文件原子性。
- modal 为右侧 current 标记保留宽度，并为 contextual status、Updating 和 action notice 提供独立换行行；加载失败不误报过滤隐藏，40 列长标题也能看到 current 与删除拒绝。宿主投影移入 session/host，InteractiveMode 既有函数数 94→93。
- 最终隔离 Node 20.3 构建与 9 文件/188 项通过；三组有效反转覆盖截断外 current、metadata/requested ID、当前删除保护，恢复后 16 项通过。独立代码 APPROVE（151 项），架构 CLEAR（最终 77 项、1754 文件依赖图无环/未解析相对导入）。actual regular/fullscreen 验证 45 条较新会话、外项目排除、40 列标记/拒绝/过滤、重开及切换后 current 更新；配置逐字节不变、47 个 metadata 保留、零 provider 请求、退出 0。详见 [主裁决 §8.103](phase-19-decisions.md#8103-ses-01current-身份范围与动作复验)。
- 本批仍调用同步完整列表；41 条展示上限不是磁盘 I/O 上限，SES-02 必须替换列表读取链路。

## 3. 会话面板大小：核心文件逻辑字节

### 3.1 当前数据与存储边界

[sessionPicker.describe](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L82) 的 `N turns` 来自消息数组长度，不是用户问答回合数。[SessionLike](../../packages/ts-shell/src/cli/interactive/picker/session.ts#L72) 只是局部显示接口，领域模型仍是 [Session](../../packages/ts-shell/src/session/schema/sessionRecord.ts)。14 号文档指出局部接口缺 byte size 并没有混淆领域模型，不应称为已被推翻的事实错误。

[sessionFileLayout.ts](../../packages/ts-shell/src/session/store/sessionFileLayout.ts#L83) 定义 metadata、transcript、state、lock 的布局，并保留 legacy 定位路径；生产代码不能硬编码 `~/.cheers`。典型布局为：

```text
<resolved-session-directory>/
  metadata.json
  transcript.jsonl
  state.json
  state.lock
```

[artifactManager.ts](../../packages/ts-shell/src/core/session/artifactManager.ts#L21) 的大输出 artifact 则位于工作区 `.ts-shell/sessions/<sessionId>/artifacts/`。这是不同存储边界。排除 artifact 是本次大小指标的明确选择，不是声称它永远无法统计；14 号文档把它作为待定口径是合理的。

### 3.2 已裁定指标与结果状态

**size = metadata.json + 完整 transcript.jsonl + state.json 的 `stat.size` 之和**。完整 transcript 包括保留分支，不只计算当前 active branch；排除 `state.lock` 和工作区 artifact。标签使用“会话文件大小”，必要说明“不含工具输出附件”。

这是**逻辑字节**，不是 filesystem allocated blocks，也不是整个磁盘占用。不能用普通 `du` 输出验等，也不能用 `JSON.stringify(turns).length` 替代落盘 UTF-8 字节。

读取投影包含：

| 状态 | 展示与含义 |
|---|---|
| complete | 三类核心文件按该布局的存在规则成功统计，显示人类可读大小 |
| partial | 有确定的部分字节，但有文件不可读、读取中变化或异常缺失；显示“至少 … / 部分可读” |
| unknown | 不能确定有意义的统计；显示“大小未知”，不能冒充 `0 B` |

旧布局允许不存在的可选文件与一个应存在文件突然丢失不同，交给存储 owner 判定。真实空文件可以是零字节；权限错误或读取失败不能转换为零。

### 3.3 Owner、异步 I/O 与一致性

统计属于 session read/store owner，向 picker 提供只读摘要，不在 renderer 或 picker 内做 `fs.statSync`、路径发现和全量目录扫描。按可见/已选 session 做有界并发异步读取，支持取消和 generation 失效；缓存必须随已知写入、版本或有限有效期失效。

当前 [SessionStoreAccess.listSessions](../../packages/ts-shell/src/session/store/sessionStoreAccess.ts#L139) 先加载历史目录后排序。因此“只对返回的 40 条 stat 就没有全历史扫描”不成立。Phase 19 应把目录枚举、列表摘要读取与大小补充分别设预算，采用可分页或可增量列表，不在每次按键重复读取历史 transcript。

三个文件可能同时变化，采样总和不是跨文件原子快照。记录采样时点/版本，检测变化后有限重试或标 partial；不能为显示大小长期持有写锁。读取必须走真实 layout，覆盖 legacy、注入存储目录、已删除会话和不可读路径。

### 3.4 待实施验收

隔离夹具按真实文件的 UTF-8 bytes 断言总和，覆盖中文、BOM/换行、保留分支、缺失可选文件、异常缺失、EACCES、append 并发、legacy 与注入目录。新增 lock/artifact 不改变指标。验收 I/O 并发上限、取消和重开后过期结果丢弃；UI 只接收大小投影，不调用文件系统。

## 4. `/undo`：最近已提交编辑操作的安全恢复

### 4.1 当前事实与安全缺口

[runUndoCommand](../../packages/ts-shell/src/core/commands/undoCommandRuntime.ts#L26) 当前只描述最近快照并打印 `/restore execute ...`，不会恢复文件。`latestEdit` 扫工作区默认 ledger 的所有 authority，按 `createdAt` 取最新，没有当前 session 过滤。

[editSnapshot.defaultAuthorityId](../../packages/ts-shell/src/edit/recovery/editSnapshot.ts#L191) 默认生成含时间/随机散列的 authority；随机 ID 本身不是污染根因，**缺少归属、提交状态与操作分组**才使测试/外部脚本的快照有机会成为用户候选。只过滤 `.tmp` 路径不能证明记录属于本会话。

[recoveryAuthorityStore.ts](../../packages/ts-shell/src/edit/recovery/recoveryAuthorityStore.ts#L40) 的记录是写前快照，不证明后续编辑成功。只加 `sessionId` 仍不能区分捕获后未写、部分写入、已提交、已撤销或未知操作。

当前 [restorePrimitive.ts](../../packages/ts-shell/src/edit/recovery/restorePrimitive.ts#L72) 在读取 blob 的异步间隔之前检查目标内容，再执行写入/删除，缺少与共享写路径结合的锁内最后 stale-read、完整审批上下文和写后核验。[restoreExecutionBridge.ts](../../packages/ts-shell/src/edit/recovery/restoreExecutionBridge.ts#L54) 也明确跨文件非原子且无自动恢复。因此“加确认框并复用现有 restore 就安全”不成立。

### 4.2 用户已确认的操作单位

`/undo` 选择**当前 session、当前规范工作区内，最近一次已提交且尚未完整撤销的编辑操作**。一次多文件 patch 的所有文件属于同一个 operation；不能按 authority 目录、单个 snapshot、某次 stat 时间或整个 turn 偶然分组。

作用域仅限有可验证快照与实际结果收据的文件编辑。它不承诺撤回任意 bash、网络、Git、provider 或外部系统副作用，不调用全局 Git discard，不删除对话分支。旧记录无法确定 session/operation 归属时，不自动认领、不回退到全局最新记录；可留在显式 `/restore` 检查路径中，并同样经过恢复安全验证。

有未对账的 partial/unknown 操作时必须显式展示并先确定相关文件现状；不能跳过它然后把更旧操作当作安全的“最新可撤销项”。

### 4.3 操作收据与身份绑定

后续 edit/recovery owner 应记录 durable operation receipt，至少包含：

- 稳定 operation ID、session ID、规范 workspace identity、tool-call/请求关联与单调操作顺序；时间仅用于展示。
- 目标集合、每个目标的原始/预期内容 hash、快照 blob identity、创建/修改/删除类型与捕获状态。
- 实际编辑逐文件提交/核验状态；操作整体 committed、partial、failed、unknown；后续 undo 的执行与核验结果。
- parent/child 或多文件分组关系，防止把一次 patch 拆成多次不一致撤销；并发编辑结果以实际提交顺序确定。

只有已证明提交的操作才能进入正常 undo 栈。snapshot 存在、模型宣称完成、write 已开始均不能代替 committed evidence。重复 undo 必须识别已完成收据；不能再次写入后伪装首次成功。

本地 JSON 与 hash 提供可追踪审计，不是对同用户篡改的不可抵赖证明。路径归属、blob/hash 和 schema 都需验证；如要抵御拥有同账户写权限的恶意篡改，需额外可信签名或外部 append-only 存储，不能把现有文件 ledger 夸成该能力。

### 4.4 预览、批准、写入与核验

下面是开放 `/undo` 真执行前的强制顺序：

1. **选择**：读取当前 session/workspace 的 operation receipts，确认目标操作及所有文件；没有有效操作时明确提示，不扫描全局替代。
2. **预览**：显示操作时间、文件、diff 和冲突/不可恢复原因。预览只读；加载、选择高亮、Enter 打开详情均不是写授权。
3. **审批**：批准绑定 operation/session/workspace、目标集、前后内容版本和预览 revision；旧批准不能被复用于新候选。取消、denied、permission-pending 都不写入。
4. **准备**：重新验证 receipt、blob 完整性、规范路径与 symlink/越界条件。恢复内容准备完成后进入与实际编辑共享的写锁/锁顺序；所有可协调 writer 必须使用同一协议。
5. **最后 stale-read**：在锁内、实际 writer 紧前重读目标原始内容和归属，核对与批准的预览一致；不能把读 blob 之前的检查当最终检查。冲突阻断对应操作，不能覆盖用户外部修改。
6. **执行**：持久化操作意图后按既有安全 writer 提交文件替换/删除；能原子替换的单文件使用原子提交。文件失败停止策略、已写文件和后续文件必须有明确结果，不能以“多文件 patch”暗示跨文件原子性。
7. **核验与发布**：逐文件读取验证恢复结果，再提交 undo receipt 并发布 UI 结果。write 返回不等于 verified；收据写入失败必须保留对账信息和 unknown/partial 状态。

共享应用锁不能保证任意外部程序不会修改文件。实现应减少检查与写入之间的竞争窗口，并验证平台可提供的路径/文件身份保证；不得宣称能实现文件系统不存在的通用跨进程内容 CAS。

### 4.5 崩溃、部分成功与恢复后的真值

| 结果 | 用户可见含义 |
|---|---|
| preview / permission-pending / denied / blocked | 未获准写或前置条件不满足；不可显示“已撤销” |
| restored-verified | 该文件恢复已写入并核验，收据可确认 |
| failed / unchanged | 有证据证明该文件未完成恢复；与未知写入区别展示 |
| partial | 同一操作部分文件已恢复，其他文件未恢复；列出逐文件证据 |
| unknown / unverified | writer 可能执行或已执行但无法确认；不能报告全部撤销，也不能自动再次覆盖 |

进程重启先根据 operation intent、目标内容及收据对账，再决定是否可继续。未知写入不得自动重放；补偿也需检查最新内容与审批范围。保留用户能够检查/恢复的入口，但不承诺跨文件崩溃原子性。

恢复会改变磁盘事实，成功核验后须使相关读取缓存和后续模型上下文失效/刷新；这是文件状态同步，不是回退会话历史。

### 4.6 参考比较与待实施验收

Codex 的 [app_backtrack.rs](../../../codex/codex-rs/tui/src/app_backtrack.rs) 提供对话导航比较，不能证明 Cheers 的文件恢复安全。oh-my-pi 的 checkpoint/rewind 名称涉及探索上下文与摘要分支，不能仅凭工具名宣称其等价于文件恢复。文件编辑和对话导航分离是 Cheers 自己的明确产品契约。

恢复验收至少包含：捕获但未写、编辑失败/partial/unknown、单文件与多文件 committed、跨 session/workspace、旧无归属记录、重复 undo、外部修改、预览后变化、blob/hash 篡改、symlink/越界、批准过期、拒绝/取消无写、异步读 blob 后竞争、逐文件失败、写后核验失败及各持久化边界崩溃。反转任何最终 stale-read、归属检查或证据投影都应使对应测试失败。

## 5. 双 Esc 与会话导航反馈

### 5.1 当前链路已具备 note 和 draft

[rewindPicker](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts#L41) → [navigateSession](../../packages/ts-shell/src/cli/runtime/navigation.ts#L16) → [SessionManager.revertTo](../../packages/ts-shell/src/session/SessionManager.ts#L159) 已切换 durable active leaf 并保留被离开的分支。`navigateSession` 重读 session、标记上下文未知、重放 todo，并返回说明和 draft。

[rewindPicker.apply](../../packages/ts-shell/src/cli/interactive/picker/rewind.ts#L64) 已返回 `{note, draft}`，[InteractiveMode.applyPicker](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L704) 已追加 note、回填 draft；[showConversation](../../packages/ts-shell/src/cli/interactive/history.ts#L128) 已重建活动转录。后续工作应验收这条既有链路的视觉与错误行为，不再声称它们完全未接线或重复追加第二份提示。

### 5.2 现场根因仍未确认

当前 [默认 tuiMode](../../packages/ts-shell/src/config/runtimeConfig.ts#L426) 是 `fullscreen`，不是原稿所称的 regular。

[MainScreenPainter](../../packages/ts-shell/src/presentation/tui/render/mainScreen.ts#L131) 的 `newScrolled = Math.max(this.scrolled, overflow)` 对 regular 模式超屏转录骤减构成条件性风险：旧 scrolled 可能使新可见内容计算异常。但本次没有证明用户现场使用该分支、满足该条件，或视觉问题只由它引起，不能“推翻 14 的原因未知”。

regular 的终端既有 scrollback 不适合由应用可靠地选择性重写；某些终端支持整体清除历史，也不是产品应依赖的修复方式。保留旧屏幕历史不等于 active branch 未改变；产品要让新活动分支和保留历史的关系可辨认。

### 5.3 先修导航失败后的真实状态

`revertTo` 先切 durable leaf，再追加 `branch_summary`。若后一步失败，磁盘 leaf 可能已经改变而调用抛错，UI 仍保留旧 session。这是需要补齐的部分成功边界。

后续 navigation owner 在异常路径重读实际 leaf：若未变化，报告 unchanged；若 leaf 已切换，重新加载活动 session 并报告 changed-with-warning/摘要未写；若无法确认，显示 unknown 并要求刷新。不得用一次异常把已经发生的导航伪装成“完全没变”，也不得把未知状态升级成功。展示层按这个结果重建，而不是自己猜测。

### 5.4 可见结果与 Esc 优先级

回退成功应让用户同时看到活动分支转录、原问题 draft 和一份清楚说明：“当前位置、保留多少后续消息、文件未更改”。消息数量以实际条目语义标注，不把 `turns.length` 说成问答轮数。分支状态项可作为可选展示，不能为解决反馈再造一份 active leaf 数据源。

已有 [keymap.ts](../../packages/ts-shell/src/cli/interactive/keymap.ts#L258) 的优先级应保持：pager/overlay/search 先消费 Esc；busy 时取消并清除双击手势；非空草稿不触发回退；空 prompt 的双 Esc 才进入 chooser。取消、关闭面板或异步完成后遗留的 Esc 不能意外触发导航。

### 5.5 待实施视觉与持久化验收

构造至少两组问答并导航到第一条 user entry：活动转录保留该问题及祖先，不再显示之后的回答；draft 是该问题；提示只出现一次；旧末尾仍可通过 tree 导航恢复。关闭重开后 durable leaf 与 UI 一致，文件内容未变化。

分别在 fullscreen/regular 实际 PTY 验证：短转录、先超过视口再缩短、resize、overlay、原生 scrollback、取消与错误、摘要追加失败及读取失败。数据断言证明分支状态，字节探针证明序列，截图/现场观察证明视觉；没有后者不能宣称“现场视觉问题彻底解决”。

## 6. Phase 19 任务依赖

以下均为后续实现，统一批次见 [Phase 19 决策](phase-19-decisions.md)。

| 任务 | Owner | 依赖与验收重点 |
|---|---|---|
| S1 picker lifecycle | `presentation/tui/chrome/`、`cli/interactive/` | 完整 reset、generation、身份化异步动作、preview cleanup |
| S2 resume current | session read + session picker | S1；current 截断补入不越 trust/workspace；稳定排序；恢复成功后才改 current |
| S3 会话大小 | session store/read owner | 列表预算与异步摘要；逻辑 bytes、legacy、partial/unknown、取消；UI 无 fs I/O |
| S4 edit operation receipts | edit/recovery + 实际 writer owner | session/workspace/operation identity、实际提交证据、多文件分组与未知结果 |
| S5 restore 写路径加固 | recovery + 既有 permission/write boundary | S4；审批绑定、锁内最后 stale-read、逐文件核验、崩溃对账；不宣称跨文件原子 |
| S6 undo 交互执行 | undo command + recovery + picker/report | S4–S5；按用户确认的最近已提交 operation，preview/批准/结果，不全局 fallback |
| S7 分支导航真值与反馈 | session navigation + TUI render | S1；异常重读 leaf，既有 note/draft 单次显示，两种模式视觉验收 |

## 7. 本轮证据边界

本次交付是文档复审：核对源码、研究结论和路径，撤回“归零是最终默认”“默认 regular”“现场根因已破解”“确认后恢复天然安全”等断言。没有运行 `/undo` 写入、文件大小动态探针、产品测试、build 或真实终端录屏。所有新增 API、operation receipts、异步统计和安全恢复要求均为 Phase 19 待实现项，不得据本文把现状描述成生产能力已完成。
