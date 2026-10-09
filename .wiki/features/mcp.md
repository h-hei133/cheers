# MCP 内容与连接

当前实现共享一个经过 capability negotiation 的 stdio 连接。工具发现、资源、提示模板与通知复用 `core/mcp/`；显式内容请求使用 `core/mcp/content/`，不会额外执行 tools/list 或 tools/call。配置 CRUD、HTTP 与认证仍属于 ECO-05 后续交付。

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
| `/mcp cancel` | 取消既有 host 队列及 gateway 队列中的内容请求和在途请求 |

服务器名、URI 与模板名可使用普通命令引号；提示参数是至多 32 KiB 的字符串值 JSON 对象。语法、帮助与补全复用同一描述，`--` 按标准语法终止选项。

每个内容请求共享 30 秒期限。目录最多 100 页、10000 项、4 MiB；重复 cursor/身份、无效 schema、未完成分页不发布。资源/提示结果最多 1 MiB，显示投影另有截断界；二进制或媒体明确省略。显示使用共同脱敏及终端控制字符转义，远端错误同样处理。所有内容保留服务器、配置范围和 transport 来源；正文不提供执行或写入授权。

资源与提示目录分别维护版本。list-changed 使对应在途目录失效；resource-updated 只使相同 URI 的在途读取失效，不撤销无关目录或共享订阅。普通请求拒绝保留健康连接。取消、工作区切换、配置变更或准入撤销拒绝迟到结果并关闭失效连接；随后明确请求才可重新连接，未知结果不自动重放。订阅只对当前连接有效，不自动恢复。

通知仅保留最近 200 项 sequence/time/method/level 及 dropped 数；不保留远端正文、logger 或 URI。禁用、移除、连接关闭和配置/工作区不匹配不展示旧通知。取消只表示已提出停止请求，实际请求仍需结算；关闭期间的预期 startup abort 不冒充清理失败，真实 transport 清理失败仍向上报告。

本地验收与交付边界见 [Phase 19 §8.128](phase-19-decisions.md#8128-w11-eco-05协商后的资源提示与有界通知本地协议组件)。
