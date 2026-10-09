# MCP 内容与连接

当前实现共享一个经过 capability negotiation 的 stdio 连接。工具发现、资源、提示模板与通知复用 `core/mcp/`；显式内容请求使用 `core/mcp/content/`，不会额外执行 tools/list 或 tools/call。配置管理由 `cli/mcp/config.ts` 组合现有审批和文件发布；HTTP 与认证仍属于 ECO-05 后续交付。

| 命令 | 行为 |
|---|---|
| `/mcp resources <server>` | 获取完整资源目录 |
| `/mcp templates <server>` | 获取完整资源 URI 模板目录 |
| `/mcp prompts <server>` | 获取提示模板及参数目录 |
| `/mcp read <server> <uri>` | 显示资源正文 |
| `/mcp prompt <server> <name> [arguments-json]` | 校验必需/未知参数后预览提示；不发模型请求、不执行工具 |
| `/mcp subscribe <server> <uri>` | 为当前连接订阅资源更新 |
| `/mcp unsubscribe <server> <uri>` | 取消当前连接的资源订阅 |
| `/mcp notifications [server]` | 只读当前连接的有界通知元数据；冷状态不连接 |
| `/mcp cancel` | 取消既有 host 队列、待发布配置及 gateway 内容请求；随后明确输入保留 |

服务器名、URI 与模板名可使用普通命令引号；提示参数是至多 32 KiB 的字符串值 JSON 对象。语法、帮助与补全复用同一描述，`--` 按标准语法终止选项。

每个内容请求共享 30 秒期限。目录最多 100 页、10000 项、4 MiB；重复 cursor/身份、无效 schema、未完成分页不发布。资源/提示结果最多 1 MiB，显示投影另有截断界；二进制或媒体明确省略。显示使用共同脱敏及终端控制字符转义，远端错误同样处理。所有内容保留服务器、配置范围和 transport 来源；正文不提供执行或写入授权。

资源与提示目录分别维护版本。list-changed 使对应在途目录失效；resource-updated 只使相同 URI 的在途读取失效，不撤销无关目录或共享订阅。普通请求拒绝保留健康连接。取消、工作区切换、配置变更或准入撤销拒绝迟到结果并关闭失效连接；随后明确请求才可重新连接，未知结果不自动重放。订阅只对当前连接有效，不自动恢复。

通知仅保留最近 200 项 sequence/time/method/level 及 dropped 数；不保留远端正文、logger 或 URI。禁用、移除、连接关闭和配置/工作区不匹配不展示旧通知。取消只表示已提出停止请求，实际请求仍需结算；关闭期间的预期 startup abort 不冒充清理失败，真实 transport 清理失败仍向上报告。

本地验收与交付边界见 [Phase 19 §8.128](phase-19-decisions.md#8128-w11-eco-05协商后的资源提示与有界通知本地协议组件)。

## 配置管理

| 命令 | 行为 |
|---|---|
| `/mcp list` | 列出有效定义及来源；不连接 |
| `/mcp show <server>` | 显示脱敏后的有效定义和 override 来源 |
| `/mcp add <user\|project> <server> <file>` | 从本地 JSONC 文件准备新定义，审批后保存 |
| `/mcp edit <user\|project> <server> <file>` | 用完整定义替换该范围的已有条目 |
| `/mcp remove <user\|project> <server>` | 移除该范围条目；`delete` 为别名 |
| `/mcp enable <user\|project> <server>` | 启用已有条目；项目范围可覆盖用户条目的启停 |
| `/mcp disable <user\|project> <server>` | 停用已有条目并撤销对应连接 |
| `/mcp test <server>` | 只对精确服务器名协商和发现工具，不调用工具 |
| `/mcp reload [server]` | `refresh` 的别名；省略目标或 `all` 刷新全部，具体目标只连接该服务器 |

用户文件为用户数据目录内的 `mcp.json`，项目文件为根目录的 `.cheers.mcp.json`。只有受信项目参与覆盖和项目写入。完整项目定义替换用户定义；只有 `enabled` 的项目条目保留用户定义的 source/scope，并单独标记 override 文件。删除被此类项目条目引用的用户定义前，先移除项目 override。

定义输入不超过 32 KiB。stdio 定义提供 `command`、可选 `args`/`env`；HTTP 定义提供 `url`、可选 `headers`。`transport` 可由 command/URL 推断。输入必须完整，重复键、危险键和混合 transport 字段被拒绝。配置文件共享有界 JSONC 解析；每个文件最多256条，保存前再次验证候选文件和有效覆盖关系。旧的未支持 transport 只保留诊断能力，不构成连接成功。

定义正文从本地文件读取，避免环境/headers 密钥进入命令历史。list/show/审批预览省略参数值、环境和 headers 值、URL query；审批提供最终文件的 SHA-256 与大小，绑定完整字节。读取权限、源/目标字节、文件与祖先身份、继承来源、项目/session/trust 在批准后重查；BOM、注释及无关字段保留。发布沿用唯一普通工具审批、hooks、文件锁和提交器。PostToolUse 替换文件保持 unverified，hooks 的密钥在事件持久化前脱敏。

保存与连接测试分开。保存只撤销发生变化的连接，不做发现或重放，未变化的订阅保留；发布事实与清理失败分别显示。`test all` 是精确名称：无此服务器时冷拒绝，有此服务器时只测试它。命令输入的 `reload all` 保留全量刷新语义。忙碌时管理命令可以通过同一普通审批执行；已有审批或问题待答时拒绝抢答。文件锁不承诺跨进程文件竞争或多文件崩溃原子性。
