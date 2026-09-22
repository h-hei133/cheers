# Cheers 使用手册

适用目录：`/home/wang/projects/cheers`

## 1. 先说结论：用户态与开发态是否已区分
已区分，方式是“同一 CLI 下的视图与职责分层”：
- 用户态（默认）：`/view user`（等价 `compact`），强调任务结果与必要提示，隐藏大部分调试噪音。
- 开发态：`/view developer`（等价 `verbose`），显示更完整的运行时事件（tool、approval、retry、MCP 状态等）。

## 2. 快速开始
### 2.1 初始化
```bash
npm install
npm run setup
```

### 2.2 以用户方式启动（推荐）
```bash
npm start
```
推荐进入后先执行：
1. `/connect status`
2. `/workspace status`
3. 输入你的任务

### 2.3 指定“目标项目”启动（非常推荐）
```bash
npm start -- --project D:\your\repo
```
也可以用别名：
```bash
npm start -- --attach D:\your\repo
```

### 2.4 常用 CLI 参数
- `--version` / `-v` / `-V`：打印版本并退出
- `--doctor`：打印诊断信息并退出
- `--session-id <id>`：直接恢复指定会话
- `--project <path>` / `--attach <path>`：启动即附着目标项目
- `--provider <openai|anthropic|openai-compatible>`：仅本次进程覆盖 provider
- `--api-key <key>`：仅本次进程覆盖 API key
- `--tools <a,b,c>`：**只**向模型提供这些工具（只读审查常用 `--tools read,grep,glob`）。省略即不限制。值里至少要有一个名字，写 `--tools ,,` 会被当作参数错误而不是“一个工具都不给”。

## 3. 会话内控制面（Slash 命令）

### 3.1 `/help`
显示用户命令指南（推荐当作总入口）。

### 3.2 `/view`
- `/view status`：查看当前视图
- `/view user` 或 `/view compact`：用户态输出
- `/view developer` 或 `/view verbose`：开发态输出

### 3.3 `/workspace`（项目上下文控制面）
- `/workspace status`：当前项目、cwd、git、会话绑定信息
- `/workspace attach <path>`：会话内切换目标项目（无需重启 CLI）
- `/workspace recent`：最近项目上下文

### 3.4 `/sessions`（会话控制面）
- `/sessions`：打开交互面板（推荐）
- `/sessions list`：文本列表
- `/sessions current`：当前会话详情
- `/sessions switch <session-id>`：直接切换

#### Sessions 面板快捷键
- `↑/↓`：上下移动
- `Enter`：切换到选中会话
- `Ctrl+R`：重命名会话
- `Ctrl+D`：删除会话
- `Esc` 或 `Q`：关闭面板

### 3.5 `/resume [session-id]`
恢复可恢复会话。  
不带参数时，按恢复策略选择最合适的会话；带参数时恢复指定会话。

### 3.6 `/cancel`
取消当前正在运行的这一次请求（不是退出整个 CLI 进程）。

### 3.7 `/mcp`（MCP 控制面）
- `/mcp status`：查看 MCP 服务连接总览
- `/mcp tools [server]`：查看工具清单
- `/mcp doctor`：诊断连接/鉴权异常
- `/mcp refresh [server|all]`：刷新连接

### 3.8 `/permissions`（审批信任策略管理）
- `/permissions list`：查看当前项目的持久化 trust grants
- `/permissions explain`：解释最近一次自动放行命中来源
- `/permissions revoke <index|scope-key>`：撤销单条规则
- `/permissions reset`：清空当前项目规则
- `/permissions reset all`：清空全部规则

### 3.9 `/connect`（推荐的 provider onboarding 入口）
- `/connect status` 或 `/connect list`
- `/connect presets`
- `/connect login <provider|preset> --api-key <key> [--base-url <url>] [--model <model>] [--label <name>]`
- `/connect login <provider|preset> --browser [--label <name>]`
- `/connect use <connection-id|provider>`
- `/connect logout <connection-id|provider>`

支持目标：`openai`、`anthropic`、`openai-compatible`、`siliconflow`

### 3.10 `/connect`（凭据接入）
- `/connect status`
- `/connect set <provider> <api-key> [base-url] [model]`
- `/connect use <provider>`
- `/connect logout [provider]`

> `/auth` 已于 2026-09-20 移除（维护者认定 `/connect` 取代）。旧脚本若仍调用
> `/auth set ...`，改用 `/connect set ...` —— 参数形状相同。

### 3.11 其他
- `/doctor`：本地诊断
- `/workflow-status`（别名 `/status`）：工作区 git/状态信息
- `/theme [name]`：列出可用主题，或切换到指定主题

#### 编辑与折叠快捷键

| 按键 | 作用 |
|---|---|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做（撤销的撤销） |
| `Ctrl+Y` | 粘贴最近一次剪切 |
| `Alt+Y` | 在剪切环里往前翻，取更早的那次剪切 |
| `Ctrl+O` | 折叠/展开工具输出 |
| `Ctrl+T` | 折叠/展开思考内容 |

`Ctrl+O` 与 `Ctrl+T` 分开绑定，是因为工具输出和思考内容在不同时候看：一个键同时切换两者，会让每次按键都抵消上一次的效果。

主题不只有内建的两个。除内建的 `dark` / `light` 外，还会读取：

- 用户级：`~/.cheers/themes/*.json`
- 项目级：`<projectRoot>/.agents/themes/*.json`

项目覆盖用户，靠近工作目录的目录覆盖更远的目录 —— 与指令文件和技能的优先级规则一致。同名主题会覆盖内建主题，删掉自己的文件即可恢复内建版本。主题文件里的 `name` 可省略，省略时用文件名。

`/theme` 的列表会标出每个名字来自内建还是磁盘，因为「`dark` 指的是内建那个」和「指的是你家目录里那个」在颜色不同时是两件事。

## 4. Approval（审批）与信任边界

### 4.1 提示含义
当请求涉及受限操作（通常是工具执行）时，会出现 `approval>`。

输入选项：
- `y`：Allow Once（仅本次）
- `a`：Allow Always（写入持久化策略）
- `n`：Deny

### 4.2 作用域（关键）
`allow-always` 不是“全局永远放行所有命令”，而是按项目边界与操作范围命中。  
你可以用 `/permissions list/explain/revoke/reset` 进行查看与回收。

## 5. 中断与退出

- `Ctrl+C`：若当前有运行中的请求，取消本次请求；若空闲，再次触发会退出 CLI。
- `Esc` 双击中断：运行中按一次 `Esc` 会进入 3 秒确认窗，3 秒内再按一次 `Esc`，取消当前响应。
- `Ctrl+D`：退出 CLI。

## 6. 典型用户路径

### 6.1 纯聊天/问答
1. `npm start`
2. `/view user`
3. 直接提问

### 6.2 在某个仓库内做任务（推荐）
1. `npm start -- --project D:\my-repo`
2. `/workspace status` 确认绑定
3. `/connect status` 确认 provider
4. 提交任务
5. 需要审批时按需 `y/a/n`

### 6.3 会话恢复继续工作
1. `/sessions`
2. 选中并 Enter 切换，或 `/resume <id>`
3. 看 `/sessions current` 与 `/workspace status` 确认上下文

## 7. npm 命令总览（根目录）

来源：`/home/wang/projects/cheers/package.json`

### 7.1 初始化与诊断
- `npm run bootstrap`
- `npm run setup`
- `npm run doctor`
- `npm run workflow:status`
- `npm run audit:recent`

### 7.2 构建
- `npm run build`
- `npm run build:ts`
- `npm run build:rust`

### 7.3 测试
- `npm test`
- `npm run test:gate:golden-main-path`
- `npm run test:ts`
- `npm run test:rust`
- `npm run test:python`
- `npm run test:all`

### 7.4 运行
- `npm run dev`
- `npm start`

### 7.5 结构/工作区工具
- `npm run validate`
- `npm run worktree:create -- <branch> <targetPath>`

## 8. 子包常用命令

### 8.1 `@cheers/ts-shell`
- `npm run build -w packages/ts-shell`
- `npm run dev -w packages/ts-shell`
- `npm run start -w packages/ts-shell`
- `npm run test -w packages/ts-shell`
- `npm run test:gate:golden-main-path -w packages/ts-shell`
- `npm run test:watch -w packages/ts-shell`

### 8.2 `@cheers/rust-core`
- `npm run build -w packages/rust-core`
- `npm run test -w packages/rust-core`
- `npm run test:watch -w packages/rust-core`
- `npm run check -w packages/rust-core`
- `npm run lint -w packages/rust-core`

### 8.3 `@cheers/python-eval`
- `npm run build -w packages/python-eval`
- `npm run test -w packages/python-eval`
- `npm run test:watch -w packages/python-eval`
- `npm run check -w packages/python-eval`
- `npm run lint -w packages/python-eval`

## 9. 配置与优先级

### 9.1 配置文件位置
- 用户级：`%USERPROFILE%\.cheers\config.json`
- 项目级：`<projectRoot>\.cheers.json`

### 9.2 Provider/凭证优先级（简化）
- provider：CLI 参数 > runtime 配置
- api key：CLI 参数 > 环境变量 > 配置文件

环境变量映射：
- `openai` -> `OPENAI_API_KEY`
- `anthropic` -> `ANTHROPIC_API_KEY`
- `openai-compatible` -> `OPENAI_COMPATIBLE_API_KEY`

### 9.3 命令能读到的会话变量

`bash` 工具执行的命令会收到当前会话的信息，可直接读取：

| 变量 | 含义 |
|---|---|
| `CHEERS_SESSION_ID` | 当前会话 ID |
| `CHEERS_SESSION_FILE` | 当前会话的 `transcript.jsonl` 绝对路径 |
| `CHEERS_PROVIDER` | 当前 provider |
| `CHEERS_MODEL` | 当前模型 |
| `CHEERS_REASONING_LEVEL` | 当前推理档位（`low` / `medium` / `high`） |

值在**每条命令启动时**解析，所以切换模型或档位对下一条命令立即生效。想知道自己在哪个模型上运行时，直接读变量而不是猜：

```bash
printf '%s/%s\n' "$CHEERS_PROVIDER" "$CHEERS_MODEL"
```

命令默认有 **60 秒**超时。需要更久的构建或安装可以显式指定，上限为 2147483.647 秒；超出上限会被拒绝（而不是被悄悄改成别的值）。

## 10. 常见问题

### 10.1 为什么有时还会弹 approval？
因为该动作触发了受限工具执行。  
如果你确认当前项目内同类动作可长期信任，可使用 `a`，并通过 `/permissions` 管理。

### 10.2 `/resume` 是“恢复什么”？
恢复的是会话上下文与可恢复运行边界，不只是把某个 session id 设为 current。

### 10.3 我怎么确认它到底在哪个项目工作？
看 `/workspace status` 的 `Project root`，并确认当前会话绑定项目是否一致。

### 10.4 我只想看简洁输出
使用 `/view user`（默认）。排障时临时切 `/view developer`，结束后切回。

---

如果你希望，我下一步可以再补一份“纯用户版速查手册（1页）”，只保留最常用 12 条命令和 3 条典型流程。
