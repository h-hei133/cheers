# Cheers 下一阶段演进路线图（2026-11-23）

> **依据**：基于 [codex-and-frontier-gap-audit-2026-11.md](codex-and-frontier-gap-audit-2026-11.md) 对 Cheers（`f65ba979`）与 Codex（`4210c08def`）、`oh-my-pi`（`e1a9f4b41d`）、Claude Code `Code Mode`、DeepSeek Harness（`2e39e70496`）、`deepseek-ai/dsh-superagent-prototype`（`8c32a9dc`）及 NormProof（`ea50541`）的联合源码审计。
>
> **总原则**：**先止血（解决最伤体验的 `/model` 不可用与 Prompt Cache 击穿）→ 再补安全与日常核心顺手度 → 最后做减法收口与 Cheers × NormProof 差异化分发**；严禁继续堆叠低频斜杠命令或开启高风险低 ROI 的底层重写。

---

## 阶段总览（Batch 0 → Batch 4）

| 批次 | 主题 | 目标与用户可感知收益 | 预估规模 |
|---|---|---|---|
| **Batch 0** | **止血修复：`/model` 选择器重构 + `models.json` 多连接打通 + 现场清理** | `/model` 从 9,197 行降至仅展示已配置可用模型（~9 行）；`models.json` 中 `workbuddy`/`nofx`/`apikey-casa`/`BaiLu` 全部可一键选中并正确切连接；清理 `.tmp/` 1.9 GB 与 `renameSession` 竞态 bug | 1–2 个聚焦 PR |
| **Batch 0.5** | **人类配置 YAML 化与保注释写回（融合 OMP 格式 + Codex 边界/诊断）** | `config.yaml` / `models.yaml` / `sandbox.yaml` / `keybindings.yaml` / `.agents/workflows/*.yaml` 彻底告别 `{}`/`[]` 括号失配；CST 保注释写回 + 无损兼容旧 `.json` + 显式 `cheers config migrate`；修掉 `sandbox` 静默吞错与 3 处非原子写 | 1 个聚焦 PR |
| **Batch 1** | **Prompt Caching 对齐 Codex（P0 四个缓存杀手 + P1 基础设施）** | 消除每轮对话 100% 前缀击穿，显著拉高跨轮缓存命中率与降本提速，状态栏实时可见缓存命中率 | 2–3 个聚焦 PR |
| **Batch 2** | **Code Mode 安全闭环与 TUI 体验升级（对照 Claude Code）** | 堵死 `codemode` 无门控回退与内部拒绝不终止脚本的安全洞；TUI 直接渲染内部编辑 diff 并支持 `Ctrl+O` 折叠代码；支持审批暂停计时与 `PostToolUse` 密钥脱敏 | 2 个聚焦 PR |
| **Batch 3** | **日常编码顺手度、轻量化守卫与表面做减法（对照 Codex & DeepSeek）** | 固定高频编码工具、首启 `/connect` 引导、`/theme` 预览、并排 Diff 换行、`Tab` 排队 / `Alt+Up` 弹回、命令面板按频次/上下文剪枝；引入防死循环提醒与流式 `idleWatchdog` | 2–3 个聚焦 PR |
| **Batch 4** | **可分发化 + Cheers × NormProof 原生外部工作区协同** | 补齐 `README.md` / `LICENSE` / `release.yml` 单文件二进制发布；升级并内置 NormProof `ea50541`，让任意外部项目可在 Cheers 中一键开启架构证明与低噪声门控 | 2 个聚焦 PR |

---

## 分批明细与验收标准

### Batch 0：`/model` 重构、`models.json` 多连接修复与现场止血（最高优先）

1. **重塑 `/model` 默认作用域（消除 9,197 行噪音）**
   - 修改 `packages/ts-shell/src/cli/interactive/picker/model.ts`、`navigation.ts`、`model/order.ts`、`packages/ts-shell/src/core/commands/modelCommandRuntime.ts`、`catalogSurface.ts`、`cli/interactive/completion/models.ts`：
   - 默认标签页改为 `Ready / Configured`（仅显示有就绪连接、凭证或用户 `models.json` 绑定的模型，按连接/提供商分组），把 9,000+ 未配置 `models.dev` 公共目录移入显式按需进入的 `Registry / All catalog` 视图；搜索默认只搜当前视图；非交互 `/model` 与斜杠补全同步收窄。
2. **修复 `models.json` 多连接选择与 `openai-compatible` 串线**
   - `packages/ts-shell/src/core/models/availability.ts:114`：`matchesCatalog()` 当 `provider.baseUrl` 显式声明（如 BaiLu）时必须校验 `baseUrl` 匹配，仅在未声明 `baseUrl` 且连接未被更具体条目认领时回退到 `provider.id === provider.runtime`；
   - `packages/ts-shell/src/core/commands/model/selection.ts:94-155`：`/model use <provider>/<model>` 命中唯一就绪连接时自动在会话级切换到对应 `connectionId`，不再拿旧活跃连接硬拒或错发到错误网关；
   - `packages/ts-shell/src/core/commands/modelCommandRuntime.ts:453-457`：`/model list <provider>` 指定显式 ID 时不再被当前活跃连接的 `baseUrl` 覆盖；
   - `packages/ts-shell/src/cli/interactive/picker/model.ts:175-197`：效仿 Codex，**不因上一个模型的 `thinkingEffort` 不兼容而置灰目标模型**，选中后自动弹出目标模型支持的 effort 选择器或回退到其默认支持档位；释放已被显式切换覆盖的 CLI `--model` 锁定。
3. **顺手止血项**
   - 清理 `/home/wang/projects/cheers/.tmp/`（释放 1.9 GB 历史验证残留）；
   - 将 `SessionManager.renameSession`（`packages/ts-shell/src/session/SessionManager.ts:202-209`）切入事务提交并在 RPC `set_session_name`（`packages/ts-shell/src/cli/rpc/host/session.ts:49-53`）补 `busy()` 检查。
- **验收标准**：本机 `~/.cheers/` 打开 `/model` 默认列表仅展示 ~9 个已配置模型且按 4 个连接清晰分组；在 `medium` effort 下可无缝切换到 `workbuddy/global:deepseek-v4.1-flash`、`nofx/gpt-6.1-terra`、`openai-compatible/bailu-2.8`、`apikey-casa/gpt-6.2-sol` 且实际请求命中各自正确 `baseUrl`。

---

### Batch 0.5：人类配置 YAML 化、保注释写回与诊断补齐（融合 OMP & Codex）

1. **引入纯 JS `yaml`（`eemeli/yaml` v2，YAML 1.2 Core Schema）与统一格式层**
   - 新增统一配置格式读写适配层（兼容 Node `>=20.3.0`、`esbuild` 与 `bun build --compile`，零原生绑定），按 `.yaml` > `.yml` > `.json`（JSONC）优先级解析人类配置文件，附带 1-based `file:line:col` + 源码指示行诊断。
   - **迁入 YAML 支持（向下无损兼容旧 `.json`）**：`config.yaml`（`~/.cheers/` 与 `.cheers/`）、`models.yaml`、`sandbox.yaml`、`keybindings.yaml`、`.agents/workflows/*.yaml`。
   - **程序化保注释写回**：`config/patch.ts` + `config/persistence.ts` 对 `.yaml` 文件采用 `yaml` `parseDocument()` CST 节点级修改（`setIn`/`deleteIn`），保留手写注释与键序，并补齐软链目标解析（避免覆盖 dotfiles 软链）。
   - **显式平滑迁移**：提供 `cheers config migrate` 命令将已有 `config.json` / `models.json` / `keybindings.json` / `sandbox.json` 转为 `.yaml`（自动留存 `.json.bak`），不强制自动改写用户文件。
2. **生态互操作文件与机器状态边界加固**
   - `mcp.json` 与 `.agents/hooks.json`（含 NormProof 门控）及 `themes/*.json` 保持 JSON 规范路径以确保跨工具与 NormProof 零摩擦互通，同时将 `hooks.json` 与 `themes/*.json` 从裸 `JSON.parse` 升级为 `jsonc-parser`（支持注释与尾逗号）；
   - `auth.json`、`models-cache.json`、`current-session.json`、`sessions/`、`trust.json`、`hook-trust.json`、`approval-policy.json`、`crashes.json` 坚守 JSON/JSONL；
   - 修复 `packages/ts-shell/src/sandbox/osSandbox.ts:94-110` 解析失败静默吞错问题，并将 `core/models/catalogStore.ts`、`core/shell/approvalTrustPolicy.ts`、`observability/crashLog.ts` 3 处裸 `fs.writeFileSync` 统一改为 `writeTextFileAtomic`。
- **验收标准**：用户手写带 `#` 注释的 `models.yaml` 与 `config.yaml` 可正确加载；在交互中切换 `/model` 或 `/settings` 写回 `config.yaml` 后注释与排版完整保留；故意写错缩进或语法时给出准确 `file:line:col` 错误定位；旧 `.json` 与 `.agents/hooks.json` 全量回归通过且 `npm run build:exe` 正常打包。

---

### Batch 1：Prompt Caching 对齐 Codex

1. **P0-1 修复 `openingMessage` 跨轮改写 `messages[0]`**
   - 修改 `packages/ts-shell/src/turn/opening.ts`、`turn/session.ts`、`turn/prompt.ts`、`cli/runtime/cliSessionRuntimeFactory.ts`：初始环境上下文一次性落盘到不可变前置消息（或会话首条环境项），后续仅当 `cwd`/`permissionScope`/`active_goal`/`workspaceRoots` 实际变化时向历史**尾部**追加增量上下文，保证 Turn 2+ 的前缀与 Turn 1 逐字节一致。
2. **P0-2 消除 `toolDiscovery: 'dynamic'` 导致的 `body.tools` 抖动**
   - 顶层 `body.tools` 在会话内保持固定（并规范化 Schema 键序），将高频核心工具 `apply_patch`/`task`/`ask`/`todo` 纳入固定集，减少不必要的动态加载；对动态发现的扩展/MCP 工具，在历史 `tool_search`/`tool_load` 结果中声明（或持久化已加载工具集避免每轮重置），并在核验支持的内置 Anthropic 模型目录条目上启用 `supportsMidConvoToolChanges` / `supportsMidConvoEffort`。
3. **P0-3 收尾步（`allowTools: false`）保前缀**
   - 修改 `packages/ts-shell/src/turn/context/prepare.ts:168` 及各端点请求构造器：收尾步保留完全相同的 `wireTools`，改用 `tool_choice: "none"` / `{ type: "none" }` / `mode: "NONE"` 禁止调用工具。
4. **P0-4 补齐 `prompt_cache_key`、粘性路由与 Codex WS 增量链路**
   - 为 `openai-account-responses`（ChatGPT 后端）、Azure Responses 与可选 OpenAI-Compatible 端点发送稳定的会话级 `prompt_cache_key` 及 `thread-id` / `x-codex-turn-state` 捕获重放；在 `codexWs.ts` 中默认启用 `auto` 连接复用、支持 `previous_response_id` 增量尾部发送与 `generate: false` 启动预热。
5. **P1 缓存基础设施补齐与可观测性**
   - 为内置模型目录补充基线价格与缺失的 `promptCache`（如 `o4-mini`、Bedrock Claude）以激活 `cacheWarming` 与 `turnCacheMissNotice`，修正 `responses/index.ts:16` 的 `max_output_tokens: 1 → 16`；
   - 将 `microCompact.ts` 的大输出裁剪前移至入库阶段，停止每步原地改写历史槽位；
   - 为本地摘要压缩保留主会话 `systemPrompt` + `tools`（`tool_choice: "none"`）并将压缩提示置于尾部，为 OpenAI Responses 增加 `/responses/compact` 支持；为 Bedrock Converse 补齐 3 个 `cachePoint`；在 TUI 状态栏（`presentation/tui/chrome/items.ts`）增加实时缓存命中率徽标。
- **验收标准**：新增端到端前缀字节等价测试（Turn 1 → Turn 2 → Turn 3 发出请求的前缀逐字节一致、工具收尾步 `tools` 字节一致）；实测多轮对话 `cached_input_tokens` 命中率显著提升并在状态栏可见。

---

### Batch 2：Code Mode 安全闭环与 TUI 可观测性（对齐 Claude Code `Code Mode`）

1. **P0 安全与控制流闭环**
   - 移除 `packages/ts-shell/src/core/tools/codemode/nestedCalls.ts:160-189` 对写/执行/MCP 工具的无门控直接回退（统一 fail-closed，强制经 `executeNestedTool` 走 `HookDispatcher`/NormProof 与 `askPermission`）；
   - 区分内部审批框的“无备注 `No` / `Esc`”（立即中止整段脚本并保留已落盘调用回执，外层状态标为 `stopped_error`）与“带备注 `No`”（仅拒绝单次 Promise、把用户反馈传回脚本继续）；
   - 禁用外层 `codemode` 永久通配 `Allow always`，提供代码预览或将鉴权收敛至内部逐调用门控（允许 `plan` 模式只读探索脚本）。
2. **P1 TUI 渲染、暂停计时与 `PostToolUse` 脱敏**
   - 将 `turn/nestedTools.ts` 的内部 `edit`/`write`/`apply_patch`/`bash` 事件实时投影到对话卡片（直接显示 diff 与审批状态），在 `toolCards.ts`/`history.ts` 中默认折叠展示 `Code (N tools)` 并在 `Ctrl+O` 展开完整 JS 与嵌套回执；
   - 在 `execution.ts:100` 暂停审批等待期间的脚本超时计数，并将上限提升至 600s；
   - 为 `PostToolUse` 增加 `updatedToolOutput` 脱敏覆写与 `{ code, result, stdout, stderr, toolsUsed }` 载荷，并借鉴 `deepseek-harness` 的 `PtcInspectableValue` 精简模型可见输出。
3. **P2 易用性增强**
   - 在 `prelude.ts` 增加薄封装 `` $`cmd` ``（`.text()`/`.json()`/`.nothrow()`，严格路由至 `tools.bash` + OS 沙箱），并支持无人值守模式下超长脚本晋升 `/jobs` 后台运行。

---

### Batch 3：日常体验打磨、轻量守卫与做减法（对齐 Codex & DeepSeek）

1. **交互体验与做减法**
   - 命令面板收敛（`registry.ts`、`slashSuggestions.ts`）：参考 Codex 按高频优先排序、按运行态/特性/实验开关剪枝，默认面板从 ~74+ 个收敛至 ~15–20 个日常核心命令，低频控制面收纳到实验开关或二级入口；
   - 输入框操控补齐 `Tab` 显式排队与 `Alt+Up` 弹回队尾编辑；
   - 首次无配置启动自动触发 `/connect` 交互向导；`/theme` 直达实时预览选择器；并排 Diff 改用成对列内换行（替换 `truncateToWidth`）；`lsp` 增加常见语言服务器（`typescript-language-server`/`pyright`/`gopls`/`rust-analyzer`）受控自动探测；
   - 解耦 `E.3`/`F2.1` 的 `generate_image`/`classify` 凭证与目录绑定（按配置池解析，不与当前聊天提供商硬耦合）。
2. **轻量运行时守卫与注意力优化（吸收 DeepSeek Harness & Super-Agent 精华）**
   - 新增非否决式 `repeat-tool-reminder` 观察器（参数深度排序、包含被拒调用、`[3, 5, 8]` 渐进提醒、用户输入重置）；
   - 为流式模型请求增加可重装 `idleWatchdog`；
   - 为 `/jobs` 与 `/director` 监听增加零 LLM 确定性差值过滤，并借鉴 `dsh-superagent-prototype` 的“健康状态不占空间（仅高亮 `waitsForPerson` 阻塞项）”、5 秒长命令自动转后台与 +1 人类优先并发槽机制，防止后台任务阻塞或饿死前台交互。
3. **按需结构减负**
   - 逐步清理 `.normproof/dispositions.md` 中可确认的不可达死代码簇，并在新增 TUI 特性前优先拆分 `interactiveMode.ts`（1,739 行）与 `overlay.ts`（987 行）。

---

### Batch 4：分发闭环 + Cheers × NormProof 杀手级协同

1. **产品级分发收口**
   - 补齐 Cheers 根目录 `README.md`、`LICENSE`，更新过时的 `INSTALL.md`；
   - 增加 `.github/workflows/release.yml` 自动产出 Linux/macOS 单文件 Bun 二进制（接通 `core/update/check.ts` 的 GitHub Releases 检查）；
   - 在 CLI 入口做懒加载边界或 `esbuild` 单文件打包，缩短 Node 启动耗时。
2. **Cheers × NormProof 原生外部工作区集成**
   - 将 Cheers 的 NormProof 同步升级到 `ea50541`（含 MIT、单包/Monorepo 自动探测、`exclude`、软链区分与 `./` 解析）；
   - 借助 `artifact.ts` 已验证的 `BUN_BE_BUN=1` 路径，将 NormProof 门控与 CLI 能力直接开放给**任意外部工作区**（不再限于 Cheers 自仓）：新增 `/arch`（或升级 `/init`）一键完成 `normproof init → baseline accept → prose --sync → 启用写前/停机门控`，并在状态栏实时展示架构健康徽标（`proven` / `partial`）。

---

## 明确暂缓 / 不做清单（防止范围失控）

- **暂缓 `T5.1` 单文件会话大重写**：牵动 ~15 个物理路径消费方，现有 v1–v5 日志事务已稳定可靠，ROI 极低。
- **暂缓 `F1.2` 全面服务端状态接管**：除 Codex WS 增量传输（Batch 1）外，不把会话历史主权交由服务端（保留 Cheers 本地分支树与压缩优势）。
- **不引入 Cordis 全插件微内核、独立前台 Router 常驻池或原生 V8 绑定重写 `codemode`**。
- **不引入 OMP 的 `Bun.YAML`/`Bun.TOML` 运行时绑定或 SQLite `agent.db` + 原生 Rust `FileLock` 插件**（避免破坏 Cheers 的 Node `>=20.3.0` 基线与纯 TypeScript 控制面原则）。
- **不新增第 9 个领域包或新的顶层实验斜杠命令**，优先把已有主路径打磨到日常无摩擦。
