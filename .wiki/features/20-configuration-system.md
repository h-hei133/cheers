---
title: "20：配置系统演进与高级参数模型设计"
category: article
sources: [user-experience-report-2026-10-05, current-source-28ff98ce, isolated-probes-2026-10-05, 14-user-experience-research, codex, oh-my-pi, pi]
created: 2026-10-05
updated: 2026-10-05
tags: [research, configuration, schema, validation, provenance, settings, registry]
summary: "复核配置路径、局部校验、分层差异、attentionOnIdle 断线与 reload 行为；裁定保留现有 JSON 路径、按字段限定来源与信任、成熟 JSONC parser、无秘密诊断、并发安全字段补丁及版本化生效快照。Phase 19 字段验证与 JSONC 原文编辑首批已实施，revision/并发补丁/通知仍待完成。"
confidence: high
---

# 20：配置系统演进与高级参数模型设计

## 1. 范围与证据口径

本文承接 [14 号文档](14-user-experience-research.md) §5，审查高级配置、文件与 UI 联动、来源追踪及配置安全。源码基线为 `28ff98cee8c4dd63e6752452f73a362ed3559ae3`。2026-10-05 复审修正了原稿的错误事实、无依据数值和不完整伪代码；这里只修改研究文档，**没有修改或验证产品实现**。

- **源码**：当前目标实现及定向参考源码支持的事实。
- **历史观察**：14 号文档既有隔离探针结果；本次未复跑，不升级为新验证结果。
- **已裁定方案**：Phase 19 应实施的契约；不代表当前功能已经可用。
- **待实施验证**：边界测试、性能测量和真实终端验收；不以方案文字替代证据。

配置字段的声明、文件可配置性、最终生效和功能消费是不同环节。完整方案必须证明这些环节如何连接，并保留本来只允许 CLI 输入的安全边界。

## 2. 当前实现与已核实缺口

### 2.1 文件路径、读取和插值

配置入口见 [runtimeConfig.ts](../../packages/ts-shell/src/config/runtimeConfig.ts#L469)，路径解析见 [userHome.ts](../../packages/ts-shell/src/core/paths/userHome.ts#L27)。

| 环节 | 当前行为 | 影响 |
|---|---|---|
| 用户配置 | 规范路径为 `~/.cheers/config.json`；读取兼容 `.cheer`、`.private-agents`、`.coding-agents` 历史目录，写入规范目录 | 后续不能靠改扩展名悄悄改变配置来源 |
| 项目配置 | 工作区根目录 `.cheers.json` | 路径必须由现有 owner 解析 |
| 文件顺序 | 候选 `[user, project]` 被反转为 `[project, user]` | 普通同名顶层字段现为 user 覆盖 project |
| 解析 | 去 BOM，文本级替换 `${VAR}` 与 `$VAR`，再 `JSON.parse` | 不支持注释/尾逗号；未定义变量被换成空串；引号、反斜杠等环境值可能破坏 JSON 文本 |
| 解析失败 | 记录 diagnostic，跳过该文件 | `getRuntimeConfig` 不一定抛异常；调用方不能仅用 try/catch 判断 reload 成功 |

这里只审查源码，不读取用户实际配置或 provider 凭据。

### 2.2 来源规则不同，不能据此全量改成 project-first

[runtimeConfig.ts:477](../../packages/ts-shell/src/config/runtimeConfig.ts#L477) 的历史注释用 `/auth` 解释 user 优先：保护个人凭据和 provider 选择；当前认证命令入口是 `/connect`。除 `providerCredentials` 有一层额外合并外，大部分对象仍按顶层覆盖，可能丢掉其他层的嵌套字段。

[tuiSettings.ts:24](../../packages/ts-shell/src/cli/interactive/tuiSettings.ts#L24) 对 `tui.statusItems` 单独采用 project 优先，并声称它与所有设置一致；后半句与运行时装配不符。这是**缺少字段级规则和统一解释面**，不证明所有字段必须具有相同优先级。

Phase 19 保留普通字段既有 `default → project → user` 的兼容行为；把已存在的 TUI project-first 规则明确登记到对应字段。个人身份、provider、endpoint 与安全限制另有来源政策，见 §4.2。不得把一次配置基础设施升级隐式变成所有用户的优先级迁移。

### 2.3 缺完整 schema，但并非零校验

[RuntimeConfigFile](../../packages/ts-shell/src/config/runtimeConfig.ts#L362) 的 TypeScript 类型不能验证文件中的值。14 号文档历史探针记录普通 `maxTurns`、`temperature`、`retryEnabled` 的错误值可进入有效配置；这一缺口仍有源码支持。

原稿“零运行时断言”“diagnostics 只有两种”不成立：

- [runtimeConfig.ts:529](../../packages/ts-shell/src/config/runtimeConfig.ts#L529) 已调用 `parseDenyRules` 并记录被丢弃的规则。
- [provider normalizers](../../packages/ts-shell/src/config/runtimeConfig.ts#L738) 已处理连接、provider、ID、URL、凭据与 account auth 等局部结构。
- 这些 normalizer 仍不等于完整 schema。例如错误类型的 `apiKey` 可能到达 `.trim()`，且调用发生在文件解析 catch 之外。后续应统一验证输入形状后再交给领域 normalizer，不能因已有部分校验就宣称任意输入安全。
- 未知普通键通常不进入最终投影，但缺少系统化诊断；开放 map 的动态键与固定结构拼写错误不能用同一未知键策略处理。

### 2.4 Settings UI、通知与 reload

[settings picker](../../packages/ts-shell/src/cli/interactive/picker/settings.ts#L30) 目前只暴露 `attentionOnIdle` 和 `offline`。其 host [readSetting/saveSetting](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L790) 直接读写用户文件，不能解释所有有效层。它并非已经覆盖完整高级配置。

`attentionOnIdle` 已在 `RuntimeConfig` 声明，且 [interactiveMode.ts:674](../../packages/ts-shell/src/cli/interactive/interactiveMode.ts#L674) 有真实生产消费；缺的是文件类型、默认值和 `getRuntimeConfig` 返回投影的连接。当前通知消费使用 `bell()` 与 `idleNotification()`，不能用单一 BEL 的伪摘录替代。条件检查 busy、队列和 30 秒阈值，**没有检查 editor 草稿是否为空**。发出终端控制序列也不证明操作系统实际显示了通知。

[reloadCommandRuntime.ts](../../packages/ts-shell/src/core/commands/reloadCommandRuntime.ts#L35) 只在 refresh 抛异常时保留旧配置；而文件解析错误可能只返回 diagnostics。[interactiveCommandRouter.ts](../../packages/ts-shell/src/cli/interactive/interactiveCommandRouter.ts#L136) 的 refresh 路径重新调用 `getRuntimeConfig(cwd)` 后替换当前对象，没有保留启动 overrides 的完整契约，也未按诊断裁定候选能否发布。因此“保存后 `/reload` 必定正确生效”不是当前保证。

### 2.5 写入完整性不等于并发安全

[writeRuntimeConfigFileAt](../../packages/ts-shell/src/config/runtimeConfig.ts#L691) 使用临时文件与 rename，能降低写半份文件的风险。两个进程各自读旧对象后先后写回，仍可能覆盖对方的字段。原子 rename **不能防 lost update**，也不能阻止把已插值的有效值误写回文件。

## 3. 定向参考比较

以下只借鉴已经查明的局部决策，不把参考项目的实现或语言整体移植到 Cheers。

| 参考与证据 | 可确认行为 | Cheers 采用的原则与边界 |
|---|---|---|
| Codex [config_toml.rs](../../../codex/codex-rs/config/src/config_toml.rs)、[strict_config.rs](../../../codex/codex-rs/config/src/strict_config.rs)、[diagnostics.rs](../../../codex/codex-rs/config/src/diagnostics.rs) | Serde 类型解析、schema 元数据、`serde_ignored` 未知路径收集与 TOML span 定位；严格配置开关名为 `--strict-config`，不是 `--strict` | 借鉴结构化诊断与定位；不能将 schema 注解等同于所有加载路径都拒绝未知键 |
| Codex [merge.rs](../../../codex/codex-rs/config/src/merge.rs)、[loader/local.rs](../../../codex/codex-rs/config/src/loader/local.rs) | table 合并与多层来源栈；managed、CLI、project/profile/user 等各有来源信息 | 借鉴逐字段 provenance；不复制一个固定“8 层”口号或把管理约束等同于普通偏好覆盖 |
| oh-my-pi [registry.ts](../../../oh-my-pi/packages/coding-agent/src/config/registry.ts)、[settings.ts](../../../oh-my-pi/packages/coding-agent/src/config/settings.ts) | 领域设置注册、校验和 UI 元数据；`settings.getProvenance` 覆盖 runtime/overlay/project/global/parent/default，环境来源由 registry handle 的 provenance 处理 | 用同一字段定义连接输入、校验、消费与 UI；来源查询还涉及路径/parent，不能一概承诺 O(1) |
| oh-my-pi [config-file.ts](../../../oh-my-pi/packages/coding-agent/src/config/config-file.ts) | 同时处理 JSONC/YAML，并有 JSON→YAML 迁移 | 存在性检查、进程内 Set 与同步写不是跨进程/断电安全证明；Cheers 不采用自动改扩展名 |
| pi [settings-manager.ts](../../../pi/packages/coding-agent/src/core/settings-manager.ts) | 显式迁移旧字段；`projectTrusted=false` 时跳过项目设置，但该参数默认 true；持久化使用 `proper-lockfile` | trust 必须贯穿调用方，不能单凭一个参数声称所有工作区先信任；借鉴锁内读取修改写回与迁移边界 |

Node `>=20.3.0`、TypeScript 和单文件分发不构成“零依赖”约束。原稿关于 YAML/TOML 库一定显著损害启动的断言没有测量依据。选择 JSONC 的主要理由是现有 JSON 兼容和注释需求；解析器的体积、启动与维护成本需要在后续选型时测量。

## 4. 已裁定的生产契约

### 4.1 保持路径与 JSON 兼容，增量支持 JSONC

继续读写现有 `config.json` 与 `.cheers.json`，保留历史目录解析，不自动探测一个更高优先级的 `.jsonc` 文件，也不在首次保存时重命名、删除或覆写旧文件。JSONC 是读取语法能力的增量，标准 JSON 必须继续有效。

使用维护中的成熟 JSONC parser；`jsonc-parser` 可作为候选，最终版本须核对 Node floor、许可证、错误定位、CST/文本补丁能力、包体和冷启动成本。**禁止保留原稿的手写去注释/尾逗号正则**。该示例会修改字符串 `"x,}"`、把 `1/*x*/2` 拼成 `12`，并可能接受未闭合注释，不能作为实现蓝本。

解析契约：

1. 注释与尾逗号必须由完整语法分析处理；裸多行 JSON 字符串仍非法。
2. 保留 BOM、行列位置与原始文本范围；语法错误不能因预处理删除字符而定位漂移。
3. 限制配置字节数、嵌套深度和节点数量，拒绝重复关键配置键及危险结构，避免含糊覆盖。
4. 先解析，再对**字段 policy 允许的字符串值**解析环境占位符，避免环境值注入 JSON 语法。禁止对键名或任意未知结构插值；兼容已有 `$VAR`/`${VAR}` 语法时明确转义与 literal dollar 规则。
5. 缺环境变量不能静默变空串：按字段返回可诊断的缺值或阻断相关能力。原始占位符保留在持久化文本中；有效对象绝不写回。

### 4.2 字段 policy：来源、信任和合并

每个字段定义 `allowedSources`、来源顺序、trust 条件、合并规则、敏感级别、校验器和生效边界。统一的是这套规则的表达和执行，**不是所有字段共享一种覆盖顺序**。

| 字段类别 | Phase 19 裁定 |
|---|---|
| 普通已有配置 | 默认兼容 `default → project → user`；只有声明支持的 env/CLI/runtime override 才能参与，不凭空增加所有字段的环境映射 |
| 已有 TUI project-first 字段 | `tui.statusItems` 等逐字段登记现有读写政策；读取与保存范围必须一致并可见，不能把该规则外推到所有 TUI 字段 |
| 个人 identity、provider、连接和 endpoint | 仓库不得静默替换个人选择或把个人凭据绑定到项目指定的新 endpoint；显式选择和连接验证交给 provider owner |
| 会话模型选择 | 用户已确认 `/model` 默认只修改并持久化当前会话的 model/effort overlay；显式 `--global` 才修改全局默认。会话 overlay 随恢复加载，不写用户配置，来源应显示为 session；model/effort 必须作为一致候选发布，失败不半更新 |
| 凭据与环境引用 | 项目 `${OPENAI_API_KEY}` 仍可能与恶意 endpoint 组合外泄，不因“不是明文”就自动允许；项目不能通过配置获得任意环境秘密读取权 |
| 工具/网络/执行安全限制 | 项目只能在已有授权上收紧。deny 合并、allow 交集与上下游限制需各自定义；空数组不能含糊解释成取消所有限制 |
| `allowUntrustedHooks` | 保持 CLI-only override，不进入文件可编辑字段，不因 File/Runtime parity 门禁而开放 |
| 未信任项目 | 仅允许字段 policy 明示安全的声明；危险能力不得加载或启用，trust 变化必须使候选快照与缓存失效 |

同一 `providerConnections` 条目是身份、endpoint 和凭据引用的关联对象，不能跨来源递归拼接成未经授权的新连接。若将来改变普通字段优先级，需独立兼容迁移与面向用户的变化说明；本次不作该变化。

### 4.3 Schema、诊断与合并

校验覆盖解析后的 unknown 值、文件层、环境层和 overrides，再做领域 normalizer 和最终跨字段校验。字段范围应来自实际消费契约、模型能力及运行资源，不把研究表中的任意 `500`、`32768` 等数字当全局硬限制。

- 普通非法值：显示 warning，保留本次已验证的下层值；reload 时按候选策略保留上次有效值，不回退到未经验证的数据。
- 安全字段异常：阻断相关能力或保留已生效的更严格限制；不能静默用宽松默认值继续执行。
- 语法损坏、无法读取或未来 schema：不让不完整候选替换整份有效快照。启动无 last-good 时只允许已验证的安全能力，明确诊断阻断项。
- diagnostics 仅含受控字段 ID、source layer、错误 code、expected type/range、严重性与经过处理的位置；不存 `received`、`fallbackValue`、原始文本、密钥、认证头或原始异常。未知键也必须处理长度/控制字符，秘密字段不生成内容相似性建议。
- 固定对象按 schema 检查未知键；开放 map 另校验 key/value。旧 schema 通过显式幂等迁移；未来版本只读保留，禁止旧客户端保存后丢掉新字段。

合并由 schema 驱动：仅递归合并允许合并的普通 record；拒绝 `__proto__`、`constructor`、`prototype` 等危险路径；限制深度；限定 plain object；分别规定 `null`、缺值、数组替换/合并和显式删除语义。连接身份对象原子选择，安全集合按约束合并。原稿通用 `deepMergeConfig<T>` 不能证明这些性质，已撤除。

### 4.4 来源与生效快照

来源需覆盖嵌套叶子和合并贡献，不只有顶层 winner。runtime 内部可保留解析定位；报告只投影可公开的 scope/来源标签，敏感值显示为已配置/未配置。必要时说明某层值为何被拒绝或遮蔽，而不回显秘密。

每个候选配置带 revision、workspace identity、trust revision 和启动 overrides。后续 loader 应执行：读取 → 解析/迁移 → 字段来源过滤 → 校验/合并 → 跨字段检查 → 准备可应用资源 → **一次发布不可变 revision**。失败保留 last-good；并发较旧候选不得覆盖新 revision。

生效状态不能只用 `requiresRestart` 一个布尔量：

| 状态 | 含义 |
|---|---|
| persisted | 对指定文件的字段补丁已提交且读取核验成功 |
| effective | 当前运行组件实际消费的 revision/value |
| next-turn | 已验证的变更将在下一个回合开始时使用；进行中的回合固定其快照 |
| restart-required | 文件已保存，但现有 provider/工具池等资源尚未重建 |
| rejected / not-saved | 候选或落盘失败，旧有效状态仍可辨认 |

`/reload` 保留启动 CLI overrides，不因重读文件丢失 `--offline`、安全限制或其他显式启动值。主题预览回退、provider/工具资源替换和并发回合的生效边界分别由 owner 确认，不能发布一个“全已生效”的对象后才发现资源应用失败。

### 4.5 并发安全字段补丁与持久化

保存接受字段补丁和期望 revision，不能接受整份插值后的 `EffectiveConfig`。使用可靠跨进程锁与锁内重读，或等价 CAS/版本检查；同字段冲突报告冲突，不吞掉其他终端更新。进程内 Promise 队列和 rename 均不能单独完成这个保证。

对原始文本应用最小补丁，保留注释、未知键、占位符和未编辑字段。临时文件应在目标目录创建并保持必要权限；提交前校验来源范围、路径与当前版本，提交后读取核验。无法核验时报告 persisted-unknown，不宣称保存成功。配置新版本不得被旧客户端降级写回。

### 4.6 Settings Registry 与 UI

在 config owner 中聚合领域字段定义，包含输入映射、允许来源、验证/合并策略、默认/可选语义、敏感级别、UI 控件及生效边界。UI 只消费可编辑字段的投影；注册一个条目不等于已经有正确生产消费。

设置面板展示有效值、来源、目标保存范围和 pending/restart 状态。选择行不保存、不改变执行语义；Apply 才发字段补丁。主题/输入框形态可按 [16](16-tui-composer-and-theme.md) 进行可撤销临时预览，Esc 恢复预览前状态。保存范围不能仅由 winning layer 自动推断，因为 env/CLI 来源并非可写文件，项目写入也需要明确的 scope。

高级项通过搜索和分组可发现；秘密字段使用专用安全连接界面，不能因泛型 registry 就把原始凭据显示到通用列表。

## 5. 高级参数清单：兼容默认与能力约束

本表是后续 schema 覆盖清单。数值取自当前 [DEFAULT_CONFIG](../../packages/ts-shell/src/config/runtimeConfig.ts#L400)；新增字段和动态来源单独标明，**不是新增默认值的批准清单**。

| 参数 | 当前默认/状态 | 后续校验与生效要求 |
|---|---|---|
| `temperature` / `topP` | `0.7` / `1.0` | 有限数；provider/model 不支持时明确处理，不能把低温等同于正确代码 |
| `maxTurns` | `15` | 有界正整数及消耗语义；不以任意 500 作全局上限，不替代自主 goal 主子预算 |
| `maxOutputTokens` | `4096` | 正整数，符合模型输出能力及上下文/保留预算，不能统一封顶 32768 |
| `contextWindow` | 未配置时走模型窗口解析 | 正整数并标来源；默认估算不能冒充模型规格 |
| `reserveTokens` / `modelTokenBudgets` | `8000` / `{}` | 非负与各模型能力交叉校验；不得把输入系统提示和输出预留混为一谈 |
| `autoCompactTokenLimit` | **拟新增，当前无此字段** | 与 context owner 协调阈值含义、范围和兼容；不能仅注册后声称压缩已接线 |
| `instructionBudgetBytes` | `32768` | 非负安全整数，按 bytes 计量；0 保留[当前禁载语义](../../packages/ts-shell/src/context/instructions/projectInstructions.ts#L98)及 CLI `--no-context-files`，负值/非数拒绝；显示 disabled/truncated 真值，来源与信任规则及运行时安全限制仍有效 |
| connect / headers / body timeout | `30000` / `120000` / `120000` ms | 分别是连接、响应头和流体等待边界；保留现值；不把 headers 时间解释成所有推理阶段的总上限 |
| `retryEnabled` / `retryMaxRetries` / `providerRetryMaxRetries` | `true` / `3` / `0` | 区分 turn 与 provider 层；合成重试不得绕过 goal 预算 |
| `retryBaseDelayMs` / `retryMaxDelayMs` | `2000` / `60000` | 非负有限值、顺序与总预算；取消应立即生效 |
| `steeringMode` / `followUpMode` | 均为 `one-at-a-time` | 当前支持 `one-at-a-time` / `all`，在队列 owner 验证 |
| `allowedTools` / `disabledTools` / `denyRules` | 未指定 / `[]` / `[]` | 由安全 policy 定义白名单、禁用与 deny 合并；非法项不能放宽权限 |
| `enableMcpTools` | `true` | 受 trust、工具池和审批约束；资源重建边界需明示 |
| `theme` | `dark` | 实际 theme registry、用户路径、项目路径和 `auto`；不能收窄为只有 dark/light/auto |
| `tuiMode` | `fullscreen` | `fullscreen` / `regular`；切换的终端生命周期由展示 owner 管理 |
| `attentionOnIdle` | 当前投影缺失；目标默认 `false` | 文件→有效配置→通知消费全链路接通，终端序列与 OS 实际通知分开验收 |
| `offline` | `false` | 按现有消费者限定网络行为；它不是操作系统级断网隔离 |
| `tui.diagrams` / `tui.statusItems` | 当前 `tui: {}`，各读取方归一化 | 沿用实际 renderer 与 `STATUS_ITEMS` 合法集；记录字段级来源与默认来源 |

## 6. 接线门禁与验证设计

### 6.1 修复 attentionOnIdle 的完整链路

后续实施需补齐 file schema/registry、默认 false、有效投影与允许的 override 映射，同时让 settings 读取、保存、reload 和当前消费指向同一份有效事实。不能只加四处字段就把“通知可用”视为完成。

针对隔离环境验证：文件 true/false、非法类型、保存重开、reload、启动 overrides、30 秒边界、busy/队列状态、终端能力及实际输出。若产品要新增“仅 editor 为空才通知”，需在通知契约中显式定义；不能假装当前已有。真实 OS 通知若未验证，报告仅证明序列发出。

### 6.2 门禁检查声明的来源与行为，不强迫同名 parity

[check-config-consumers.mjs](../../scripts/check-config-consumers.mjs#L55) 当前扫描运行时字段及生产属性访问，能发现部分无消费字段，不能证明输入→装配→消费者的完整链路。`attentionOnIdle` 有真实 `.attentionOnIdle` 消费，因此该门禁通过并不与断线矛盾。

后续补充 registry/映射一致性检查：

- file-configurable 字段必须有文件输入映射、校验、默认或可选语义和有效投影。
- CLI-only、derived、runtime-only 字段必须有明确豁免来源，**不要求**同名存在于 `RuntimeConfigFile`；禁止把 `allowUntrustedHooks` 暴露到文件。
- 校验默认、映射和领域消费，支持重命名/normalizer/migration；不能要求所有输入输出逐值相等。
- 聚焦行为测试对配置来源、拒绝来源、归一化结果和实际效果分别断言。撤掉任一 attention 映射、丢启动 override、放宽安全字段或把 effective 写回的反例都应失败。

## 7. Phase 19 实施依赖与验收

以下全部为**后续任务**；任务批次和总范围由 [Phase 19 决策](phase-19-decisions.md) 汇总。

| 顺序 | Owner / 工作 | 前置与关键验收 |
|---|---|---|
| C1 | config 字段 policy、schema 与 revision 契约 | 逐字段 sources/trust/merge/apply 定义；保留 `/connect` 的个人认证与 CLI-only 边界；未来 schema 只读 |
| C2 | config JSONC、诊断、迁移与持久化 | C1；成熟 parser 实测；字符串/注释/尾逗号/未闭合/深度/危险键；秘密不进日志；两个进程不同字段不丢更新 |
| C3 | config loader 与 runtime reload | C1–C2；候选验证后原子发布；错误保留 last-good；保留启动 overrides；较旧候选失效；in-flight 回合固定 revision |
| C4 | settings UI、provenance 与通知接线 | C3；persisted/effective/next-turn/restart 分离；scope 可见；保存失败不显示成功；通知行为验证 |
| C5 | 配置接线门禁与回归用例 | 随 C1–C4 实施；检查允许来源与真实消费，保留模型/连接/安全政策语义 |

本轮仅做文档复审与路径检查，没有运行构建、产品测试、真实 provider 或通知实测。后续生产代码变更应运行与 owner 对应的聚焦测试及仓库要求门禁；JSONC 成本、并发写、reload 和通知效果必须以实际结果验收。


## 8. 2026-10-06 首批实施记录

CFG-01 首批实现和证据见 [Phase 19 §8.68](phase-19-decisions.md#868-cfg-01首批配置验证来源与安全合并边界)。当前代码以 config registry 验证已知字段和已有 env/overrides，保持普通 user-first 与 TUI 叶子 project-first；项目不能提供个人连接或展开环境引用，工具限制按收紧语义合并。诊断不回显值，raw 保存保留未知顶层字段和占位符，最终落盘文本受同一读取字节上限保护。

现有无版本文件保持兼容，显式 schemaVersion 1 表示相同格式，未知版本不写回；当前仍为 JSON，未实施 JSONC、重复键检测、迁移、CAS、last-good revision、来源 UI 或 attentionOnIdle 全链路。§§1–7 中的基线说明保留为研究历史，未完成项不能由首批验证层代替验收。完整范围和安全限制详见上述记录。


### 8.1 JSONC 解析与原文编辑

实施与验证见 [Phase 19 §8.69](phase-19-decisions.md#869-cfg-02有界-jsonc-解析与保留原文的配置编辑)。既有路径现支持注释/尾逗号，重复解码键、无效 UTF-8 和非有限数字被拒绝；语法错误保留受控字符位置。保存按变化路径编辑并保留未编辑文本，删除使用 AST/扫描器边界；变化数组只有位置一致的唯一字符串 ID 才逐项编辑，否则整体替换且不保留其内部注释。新文件和已有文件均核验最终字节上限；候选语义与预期不一致时零写。

此进展取代 §8 中“仍为 JSON、未实施 JSONC/重复键检测”的当时状态；锁/CAS、提交后核验、last-good revision、来源 UI 和通知接线仍未完成，不能从原文编辑推导并发安全或全部设置已生效。
