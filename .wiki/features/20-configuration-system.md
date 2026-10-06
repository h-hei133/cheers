---
title: "20：配置系统演进与高级参数模型设计"
category: article
sources: [user-experience-report-2026-10-05, current-source-28ff98ce, isolated-probes-2026-10-05, 14-user-experience-research, codex, oh-my-pi, pi]
created: 2026-10-05
updated: 2026-10-06
tags: [research, configuration, schema, validation, provenance, settings, registry]
summary: "Phase 19 已实施字段及项目主题信任策略、来源追踪、JSONC 原文编辑、基线字段补丁、绑定身份的 revision reload、高级 settings 和终端提醒。其他资源边界、跨字段能力及凭据代际保护继续。"
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

每个候选配置带 revision、workspace identity、trust revision 和启动 overrides。loader 的目标顺序为：读取 → 解析/迁移 → 字段来源过滤 → 校验/合并 → 跨字段检查 → 准备可应用资源 → **一次发布不可变 revision**。失败保留 last-good；并发较旧候选不得覆盖新 revision。§8.3 已实施发布与应用边界，完整跨字段能力检查和迁移仍以各自验收为准。

生效状态不能只用 `requiresRestart` 一个布尔量：

| 状态 | 含义 |
|---|---|
| persisted | 对指定文件的字段补丁已提交且读取核验成功 |
| effective | 当前运行组件实际消费的 revision/value |
| next-turn / next operation | 已验证的普通设置在下一操作捕获；进行中的操作固定其快照，安全撤销和会话/工作区/信任变化仍在副作用前检查 |
| restart-required | 已接受的偏好与当前安装的显示设置不同；目前为 tui/tuiMode，provider/工具配置在下一操作使用 |
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
| C3 | config loader 与 runtime reload | C1–C2；候选验证后发布；错误保留 last-good；保留启动 overrides；较旧候选失效；in-flight 普通设置固定 revision，安全撤销仍阻断新副作用 |
| C4 | settings UI、provenance 与通知接线 | C3；persisted/effective/next-turn/restart 分离；scope 可见；保存失败不显示成功；通知行为验证 |
| C5 | 配置接线门禁与回归用例 | 随 C1–C4 实施；检查允许来源与真实消费，保留模型/连接/安全政策语义 |

本轮仅做文档复审与路径检查，没有运行构建、产品测试、真实 provider 或通知实测。后续生产代码变更应运行与 owner 对应的聚焦测试及仓库要求门禁；JSONC 成本、并发写、reload 和通知效果必须以实际结果验收。


## 8. 2026-10-06 首批实施记录

CFG-01 首批实现和证据见 [Phase 19 §8.68](phase-19-decisions.md#868-cfg-01首批配置验证来源与安全合并边界)。当前代码以 config registry 验证已知字段和已有 env/overrides，保持普通 user-first 与 TUI 叶子 project-first；项目不能提供个人连接或展开环境引用，工具限制按收紧语义合并。诊断不回显值，raw 保存保留未知顶层字段和占位符，最终落盘文本受同一读取字节上限保护。

现有无版本文件保持兼容，显式 schemaVersion 1 表示相同格式，未知版本不写回；当前仍为 JSON，未实施 JSONC、重复键检测、迁移、CAS、last-good revision、来源 UI 或 attentionOnIdle 全链路。§§1–7 中的基线说明保留为研究历史，未完成项不能由首批验证层代替验收。完整范围和安全限制详见上述记录。


### 8.1 JSONC 解析与原文编辑

实施与验证见 [Phase 19 §8.69](phase-19-decisions.md#869-cfg-02有界-jsonc-解析与保留原文的配置编辑)。既有路径现支持注释/尾逗号，重复解码键、无效 UTF-8 和非有限数字被拒绝；语法错误保留受控字符位置。保存按变化路径编辑并保留未编辑文本，删除使用 AST/扫描器边界；变化数组只有位置一致的唯一字符串 ID 才逐项编辑，否则整体替换且不保留其内部注释。新文件和已有文件均核验最终字节上限；候选语义与预期不一致时零写。

此进展取代 §8 中“仍为 JSON、未实施 JSONC/重复键检测”的当时状态；锁/CAS、提交后核验、last-good revision、来源 UI 和通知接线仍未完成，不能从原文编辑推导并发安全或全部设置已生效。


### 8.2 基线补丁与保存核验

实施与证据见 [Phase 19 §8.70](phase-19-decisions.md#870-cfg-03基线字段补丁跨进程锁与保存结果)。writer 现在要求显式不可变基线，在既有文件锁内重读并只合并真正变化；普通叶子、数组、连接记录和凭据对象有不同冲突单位，外部删除/活动选择变化不会被旧请求静默覆盖。配置锁只回收明确死亡的本机 owner，保留未知 owner；JSONC 候选在写入前后核对精确原文，错误分别报告本次未写、最终状态未核验和已核验但清理失败。生产写入点均传递基线，异步模型 hook 与登录补写分支有对应回归。

此进展取代 §8.1 中尚无锁与提交后核验的状态；没有承诺对非参与编辑器的原子 CAS、跨主机锁或断电持久性。账户刷新网络响应的身份绑定仍待处理。last-good revision reload、来源 UI、应用边界和通知接线仍未完成。


### 8.3 不可变配置发布与安全撤销

实施与验证见 [Phase 19 §8.71](phase-19-decisions.md#871-cfg-03不可变配置发布与副作用准入)。配置 owner 保存 last-good、递增 revision、绑定身份和一次性候选代数；从 projectRoot 重读并保留冻结的启动 overrides，先准备主题再发布。普通非法候选或主题准备失败保留旧设置；安全字段、语法、读取或结构失败同时锁住后续副作用准入，直到完整有效候选恢复。意外资源提交异常报告 application-unverified，不声称资源已回滚。

主题立即应用；provider、工具、上下文、重试等普通值由下一操作捕获。自动压缩与主请求在账户刷新后使用同一份最终解析结果；手动压缩等独立操作各自捕获。当前安装的 tui/tuiMode 与已接受但待重启的偏好分开保存，重复 reload 仍显示待重启项。模型/连接状态与选择器显示已接受配置，connect 只有确认保存后才触发发布，并分别报告保存和应用结果。

固定快照不冻结授权：会话/工作区/信任变化或安全阻断会使工具、审批后的 hook、实际签名后 HTTP 派发和 MCP 连接/发现/调用重新检查准入。信任 revision 是失效标记，不替代授权。每次发布、拒绝或绑定转换都会终止旧后台预热；成功 token 刷新也可能使预热暂停到下一操作，这是当前保守边界。

此进展取代 §8.2 中 reload 尚未完成的状态。CFG-03 的字段补丁与版本发布本批已验证；不扩展为跨文件资源事务、凭据代际安全或完整来源 UI 的保证。账户刷新仍按 provider 范围保存、网络返回后取基线，旧响应覆盖新登录的竞态仍待修复。CFG-01 完整 provenance/trust 与模型能力检查、CFG-04 settings/attentionOnIdle、CFG-05 和 Phase 19 其他任务继续。


### 8.4 现有设置开关与终端提醒

实施与证据见 [Phase 19 §8.72](phase-19-decisions.md#872-cfg-04现有设置开关保存应用与终端提醒)。attentionOnIdle 已接入文件 schema、默认 false、project/user/override 投影和下一操作时机。实际交互宿主捕获操作开始时的开关，达到 30 秒且没有待运行队列、没有阻塞操作、终端仍活动时才发送既有 BEL 与 OSC 777。保持当前“操作结束”语义，未把中止或失败称作任务成功；没有新增 editor 必须为空的条件。

现有两个设置开关显示当前有效值、用户文件值及固定用户保存范围，80/120 列实际面板均保持状态可见。打开菜单捕获编辑基线，Enter 才提交一个精确选择；退出、浏览和过滤不写入。保存后核对所选字段，再触发配置发布；保存、未核验、拒绝应用及覆盖分别报告。offline 的有效值复用网络 owner，包含 CHEERS_OFFLINE 对配置的双向覆盖，不从磁盘值推断实际网络行为。

regular/fullscreen CLI 均经本地合成 HTTP 的短回合、开启后的真实长回合、关闭后的真实长回合验证，只证明终端序列，没有验证操作系统实际通知。此记录完成现有开关链路，取代早期 attentionOnIdle 投影缺失的状态；高级参数搜索/分组、可选 project 保存范围、完整来源与 pending/restart 面板仍属于 CFG-04 后续工作，不以两个开关冒充完整设置系统。


### 8.5 来源快照基础

实施与证据见 [Phase 19 §8.73](phase-19-decisions.md#873-cfg-0104随有效快照发布的配置来源基础)。现有 loader 已把 schema 控制的无值来源树与配置一起发布，覆盖叶子、合并贡献、受控拒绝原因、归一化/派生字段、会话 model 覆盖以及安装显示/待重启偏好的区别。开放 map 使用当前快照内的位置，报告不携带原键或值；环境引用只保留标记。字段生效时机与敏感级别已并入 registry，现有 settings 开关展示已接受来源及实际 offline 环境覆盖。

本批完成来源基础，并未完成高级设置编辑器：搜索/分组、project 目标选择、pending/restart 详情仍需接入同一配置发布和保存边界。配置来源不是渲染器所有归一化视觉值的来源；完整 trust 与模型能力检查、账户刷新代际保护和 CFG-05 继续。


### 8.6 高级设置与显式应用

实施与验证见 [Phase 19 §8.74](phase-19-decisions.md#874-cfg-04高级设置编辑明确范围与显式应用)。31 个条目按组搜索，界面、说明和补全共用字段 registry；详情区分当前有效值及来源、已接受偏好、目标文件值、暂存值和重启需求。user/project 范围可见，只有 Apply 才保存；切换范围重新获取基线，浏览/编辑/取消不写。保存复用字段并发补丁与核验，状态项使用 owner 合法集合，实际视觉默认值从渲染 owner 取得。

输入表单复用现有 Editor，Settings 步骤续接保持输入归属，同一终端块的连续键入/粘贴不进入对话；普通独占选择期间仍可输入并排队。最终两种 CLI 模式验证暂存零写、项目目标隔离、保存温度进入下一次真实合成请求和重启提示。此记录取代 §8.5 中高级编辑器未完成的状态，完整信任/模型能力检查、账户刷新代际保护、CFG-05 与阶段其余任务继续。


### 8.7 会话模型选择的提交边界

实施与证据见 [Phase 19 §8.75](phase-19-decisions.md#875-cfg-05会话模型选择基线准入与持久化核验)。选择前捕获会话 model revision/项目基线；取得状态锁后检查最新选择、绑定及同步准入/连接 guard，保留其他生命周期更新，写后核验完整快照。相同连接 ID 的认证或端点替换不再借模型选择静默应用；实际菜单捕获会话准入和 projectRoot。错误区分未写、未核验、已核验但清理失败。

模型-only 会话覆盖与空凭据身份相容，连续选择和 no-op 均有回归。两种实际 CLI 验证未保存时请求继续使用旧模型、重试保存后请求使用新模型。此进展不关闭 CFG-05：model/effort 共同验证/保存尚待实施，--global 分步写的后半失败仍可能保留会话选择；完整跨字段能力/信任政策和账户刷新代际保护继续。


### 8.8 模型与 effort 的同记录选择

实施及验证见 [Phase 19 §8.76](phase-19-decisions.md#876-cfg-05模型与-effort-联合选择请求快照与全局失败补偿)。`/thinking` 与 `/model --effort` 共用 session selection，默认不污染另一会话或项目状态；显式 global 同时保存默认 model/effort。null 是 provider-decides 状态，缺值才继承旧默认/项目后备。已知不支持组合及无法容纳预算的输出 cap 在写前拒绝，自定义未知模型明确显示能力未验证。

请求在操作开始捕获偏好，重试不读取变化中的项目状态；显式 effort 被拒绝时不会静默省略。global 已知未写时按 receipt 执行有条件恢复并生成新 revision，未知/部分结果不自动发布，不宣称跨文件崩溃原子性。此记录取代 §8.7 中 effort 尚未接入的状态，完整配置跨字段/trust policy、账户刷新代际保护和阶段其余目标继续。

### 8.9 信任判定与发布失效前置

[Phase 19 §8.77](phase-19-decisions.md#877-cfg-01-前置统一项目信任判定与可核验保存)统一 trusted/untrusted/undecided/unavailable；不可读来源不回退到旧允许，进程授权随持久来源变化或读取失败失效，保存只有完整核验后才刷新配置。允许记录不随替换链接迁移，拒绝保留原路径边界；配置准入同时核对已接受 publication 的信任版本。

此项只是字段过滤的可靠前置。当前 getRuntimeConfig 尚未接入字段 trust 条件，启动没有肯定信任确认；undecided 与明确拒绝必须继续分别说明。下一步按字段保留安全声明和收紧值，不能把所有非 security 字段都视为安全，也不能过滤 plan、零指令预算或 offline:true 后回落到更宽默认。

### 8.10 字段信任策略与一致项目身份

[Phase 19 §8.78](phase-19-decisions.md#878-cfg-01字段信任过滤与配置身份绑定)已将 trust 条件接入 registry 和 loader：肯定信任才允许 required 项目字段；明确安全字段及禁用/收紧例外保留原合并顺序。首次加载与 reload 携带捕获的 canonical root/revision，Settings 区分已保存与信任未启用，启动提示使用最终快照。

这取代 §8.9 中“getRuntimeConfig 尚未接入字段条件”的状态。未建立信任的项目不能再自动提供成本、上下文、执行模式扩展或主题选择；用户配置与明确启动参数继续生效。其他资源的 undecided 行为未在本批统一，尤其项目主题资产仍可覆盖同名默认主题，不能据字段过滤宣称资源隔离完成。跨字段能力验证、凭据代际保护和阶段其余任务继续。

### 8.11 项目主题资源信任

[Phase 19 §8.79](phase-19-decisions.md#879-cfg-01项目主题资源的肯定信任与观察路径)已将自动主题发现绑定到实际目录/文件的肯定信任，子目录授权不放行祖先资源或链接外部目标；全部读取结束后核对信任版本，变化时只丢弃自动项目结果，个人和显式 CLI 路径仍可用。补全跟踪信任来源及 lexical/canonical 项目目录链，动态重绑新目标。

此项关闭 §8.10 中默认主题仍会被未授权项目资产覆盖的缺口。成功配置刷新更新调色板和 follower；失败准备保持既有 last-good 与准入阻断语义，不宣称外部撤销即时移除已经渲染的颜色。主题历史优先级差异另行处理，其他资源兼容规则、完整跨字段能力和账户刷新代际安全仍继续。


### 8.12 账户续期的身份与保存边界

[Phase 19 §8.80](phase-19-decisions.md#880-cfg-03账户续期身份条件保存与可见失败)在网络前捕获实际配置 owner 和原始选择意图，锁内检查完整选择依赖，写后复查当前解析结果。只轮换选中槽与完全匹配的镜像，保留其他账户、时间戳和原始非令牌环境引用；重复 ID 在网络前拒绝。共享等待者独立保存/核验，leader 失败不被误认为已保存。

主请求、手动压缩、遗留摘要和缓存共用协调器。保存失败保留 unchanged/unknown/persisted 与清理结果，不把 fresh token 交给后续请求；取消已开始的交换仍尝试条件保存，取消和失败同时发生时写入事实保持可见。此项取代 §8.11 中账户刷新代际缺口仍未修复的状态，但不提供跨进程刷新去重、严格 CAS 或跨文件崩溃原子性。完整跨字段能力、其他资源与 Phase 19 剩余任务继续。

### 8.13 跨字段预算与已接受模型目录

[Phase 19 §8.81](phase-19-decisions.md#881-cfg-01跨字段预算校验与模型目录共同发布)接通重试延迟、模型输出 ceiling、上下文预留、模型预算命名空间及 effort 能力/最小输出预算校验。验证使用会话投影后的实际 CLI 凭据选择，模型预算覆盖全局值且保留零值；输出与压缩预留仍是不同预算。显式窗口覆盖与近期历史裁剪保持原契约，并给出受控提示。

首次约束失败阻断请求，普通失败 reload 保留已接受配置和不可变目录，成功后一起发布。主请求和已接入的压缩/缓存续期路径按操作捕获目录；模型保存前及 hook 后重验共享约束。扩大 494 项、9 组有效反转及六场两模式本地 HTTP 验证通过，详细边界与审查证据见裁决记录。

这覆盖 §8.12 中上述跨字段能力缺口，但尚不等于完整 CFG-01/05。不同 CLI provider 下的 `/model` 现在按 [Phase 19 §8.82](phase-19-decisions.md#882-cfg-05请求-provider-与模型保存目标一致启动诊断不覆盖恢复通知) 在保存前拒绝不匹配的活动连接，先选中匹配连接才允许模型更新；命令目录一致性见下一节，其他资源策略与完整阶段目标继续。

### 8.14 命令与模型目录的发布一致性

[Phase 19 §8.83](phase-19-decisions.md#883-cfg-0105命令与模型菜单共用已接受目录)将 `/btw`、`/context`、模型列表、模型 picker 和补全接入同一已接受配置/目录。侧问使用实际 CLI 凭据目标；上下文报告保留模型零预留，工具 schema 来自当前池并标为估算，不与历史用量混算。默认列表不隐式联网，显式刷新分别报告缓存保存和运行时应用。

目录编辑和失败 reload 保留旧视图，成功发布才使补全缓存与后续操作更新。474 项组合、4 组有效反转、构建和两模式共 8 次本地 HTTP 验证通过。此记录取代上一节中命令目录尚未统一的状态；状态栏与连接 picker 的后续接线见下一节。

### 8.15 状态栏与连接选择器的目录一致性

[Phase 19 §8.84](phase-19-decisions.md#884-cfg-01ui-05状态栏与连接选择器消费已接受目录)将状态栏/欢迎界面的实际模型、上下文窗口及费用估算接入已接受配置和目录；连接列表与登录草稿也消费该目录。磁盘编辑及失败 reload 保持原值，成功发布后才更新，绘制时不再重复读取目录文件。

87 项相关测试、另行运行的 loop 2 项、3 组有效反转、构建及两模式 VT 屏幕状态验证通过。此项不把费用估算称作账单；压缩后的用量未知性和完整费用标识仍属于 UI-05，主题历史优先级、其他资源策略及完整阶段目标继续。
