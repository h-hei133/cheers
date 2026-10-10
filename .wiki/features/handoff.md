# 一次性模型交接

`/handover arm <model> [--effort auto|low|medium|high]` 为下一次普通主回合选择执行模型。模型必须属于当前 provider 连接；带斜线的模型 ID 使用完整的 `provider/model` 表达。`/handover status` 查看保留记录，`/handover off` 取消空闲待执行选择或解除未知回合的模型占用。已有 `/handoff` 仍是 `/compact` 的兼容别名。

当前模型先规划，建立非空会话 todo，然后完成第一项独立批准且实际提交的 `write`、`edit` 或 `apply_patch`。完整工具结果保存后，后续模型请求使用目标模型及临时 effort，保留原始约束、工具结果和输入顺序。两端都沿普通工具审批、sandbox、执行服务、provider 请求及共享预算；交接不会授予写权限。选择仅覆盖这一次主回合，下一回合使用会话原模型，不改全局或会话偏好。

拒绝、失败、无变化及未确认的修改不会触发交接。工具结果、操作收据或模型切换发布不确定时停止继续请求；目标模型失败不会自动退回来源模型，也不会重放或撤销已经批准的修改。provider HTTP 错误展示状态和失败类别，正文留在内部分类路径，不进入终端、转录和日志。

记录绑定会话、workspace 对象、模型 revision 和确切回合。`armed` 还要求当前进程内的显式选择；重启、fork 或新 runtime 不接管旧选择。丢失的 `running`/`switched` 投影为 `unknown`，需要明确 `/handover off` 后才能开始新回合；解除选择保留原未知结果。最多保留 16 个周期、64 KiB，满时拒绝新选择，不淘汰历史。

运行中用现有 Escape 手势中断当前回合，原生清理与用量按实际结果结算。状态 `completed` 只表示回合终结，`completionProof` 固定为 false，不证明用户目标完成。检查和解除选择都不会重放工具。该能力只覆盖一次性模型交接；持久编排使用同属 FLOW-02 的 [director/worker](director.md)。
