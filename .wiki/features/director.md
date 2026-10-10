# 持久 worker 编排

`/director on [--model provider/model] [--effort auto|low|medium|high]` 启用当前会话的编排预设。主模型只看到读取、检索、todo、ask 和 worker 管理工具；原工具 allowlist、禁用项和隐藏规则继续生效。worker 使用会话原工具配置，显式委派需要普通 task 审批，每个文件、进程和网络效果仍需自己的授权。菜单和预设不授予写权限。

| 操作 | 行为 |
|---|---|
| `/director status` | 查看实际保留周期、worker 和来源；无模型请求 |
| `/director spawn <prompt>` | 批准创建独立持久 child，并开始一项明确任务 |
| `/director send <id> <prompt>` | 从已终结的确切 checkpoint 批准新 run，保留 child、模型和 effort |
| `/director show <id>` | 查看真实运行、输出和 child 身份 |
| `/director output <id> <byte-offset>` | 读取脱敏后的有界分页；offset 是原 UTF-8 字节位置 |
| `/director wait <id> [1–30]` | 等待确切 run，超时仍返回当前状态 |
| `/director stop <id>` | 批准停止确切 worker；清理未确认时保留 unknown |
| `/director off` | 立即撤销选择，取消当前主回合并等待所属 worker 清理 |

模型也使用同一组 `worker_start/send/show/output/wait/stop` 工具。spawn/send 保留原始 prompt 内的空白和顺序；忙碌或 unknown 的 worker 拒绝 send。完成通知只是观察结果，不投递新的模型 prompt，不自动排队或重放。最多同时运行两个原生 agent；每个周期最多 16 个永久 worker ID，最多保留 16 个周期、64 KiB，满时拒绝新增。

身份、调度、独立 child、转录、checkpoint、输出和取消复用原有 agent job owner。child 创建的未知 fence 先持久化，再发布 director 的永久成员 ID，之后才 fork 和派发；发布不确定不会创建可供普通 resume 接管的孤儿。每次请求使用同一个父会话预算账本，并携带 director/job/run 来源。可选 worker 模型必须属于当前连接，含斜线的 opaque ID 需要完整 provider 前缀；不修改会话或全局模型偏好。

预设绑定当前会话、workspace 对象、cwd 身份、模型 revision、配置、模式和权限，且需要进程内的 live 选择。重启或 fork 不接管旧选择；显式 off 保留未知历史后才可重新 on。active goal、plan 模式或未解除的模型交接拒绝 on。关闭只停止所属 worker，不关闭共享 agent service。Escape 在主回合或空闲预设下都会使用同一取消路径；有界清理、状态发布、输出或操作收据未确认时仍显示 unknown。文件结果发布失败后禁止后续模型请求和续接，不能因模型说完成而升级状态。

工具覆盖只投影到当前主调用，退出后的普通调用使用会话原工具和模型。`completed` 表示一项 worker 回合终结，`completionProof` 为 false；它不证明整个用户目标完成。
