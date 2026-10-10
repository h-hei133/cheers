# 协作服务、只读共享与本地导出

## 启用

协作服务是显式前台入口：

```text
cheers serve /absolute/private/service.json
```

此入口直接启动 TypeScript 服务，不加载 agent/provider。默认 CLI 不建立协作连接。服务配置、token 文件和持久状态必须是私有普通文件，禁止符号链接和宽松权限；当前已验平台为 Linux。账户 token 由部署者独立生成，只把其 SHA-256 保存进服务配置。token 不作为命令参数，也不进入日志。

服务配置示意（所有路径为绝对路径）：

```json
{
  "version": 1,
  "host": "127.0.0.1",
  "port": 7443,
  "stateFile": "/private/collaboration/state.json",
  "accounts": [
    { "principal": "owner", "tokenHash": "<64 lowercase hex characters>", "enabled": true },
    { "principal": "guest", "tokenHash": "<different 64 lowercase hex characters>", "enabled": true }
  ]
}
```

只有字面 loopback `127.0.0.1` / `::1` 可使用 HTTP。其他 bind IP 必须配置 `tls: { "cert": "/absolute/cert.pem", "key": "/absolute/private/key.pem" }`，客户端始终验证证书；没有跳过验证选项。服务不自动注册公网 relay。账户配置在启动时读取；禁用或轮换账户需要更新私有配置并重启服务。

客户端 profile 同样为私有普通文件：

```json
{
  "version": 1,
  "origin": "https://collaboration.example:7443",
  "principal": "guest",
  "tokenFile": "/private/collaboration/guest.token",
  "addresses": ["192.0.2.10"]
}
```

origin 不含用户信息、路径、query 或 fragment；`addresses` 是用户明确检查的 IP 集合，连接解析结果必须属于该集合。不跟随重定向。`/collab profile <file>` 通过普通审批选择来源，但不连接服务；`/collab test` 才检查认证身份及协议版本。profile/token 的内容和祖先身份在操作时复验。wire 请求声明的 principal 必须与 token 身份相同，回复身份也必须匹配。

## 房间、观察与本地接管

```text
/collab start '{"guest":["observe","ask","control"]}'
/join <roomId>
/collab events
/collab ask '请检查当前任务的证据'
/collab proposals
/collab inspect <proposalId>
/collab accept <proposalId>
/collab grant guest observe,ask
/collab revoke guest
/leave
/collab stop
```

`start` 先展示确切目的地、认证主体、session/project 绑定、完整逐账户 ACL、完整投影的字节数/摘要及有界脱敏内容摘录，经普通 prepared-tool 审批后才披露。`observe`、`ask`、`control` 分开检查，ask/control 需要 observe。收到 proposal 只登记提案，不调模型或工具。观察不连接本地工作区，也不继承权限。

ask 由 host 明确批准后，携带来源 principal、origin、room/epoch/generation、session 创建身份、project hash、proposal/acceptance ID、摘要和 accepting actor，进入普通 prompt 路径。批准时显示完整脱敏提案，分成至多512字符的标记行，避免长单行阻塞终端。提交前重新校验 ACL 并消费一次性 acceptance；重启、排队后过期、撤权或重复提交均拒绝。工具仍走本地原权限/审批/hooks。

模型请求复用原 session ledger：有 goal 时保持其 scope 和 cap；无 goal 时以 room/epoch/principal 建立同一账本内的 scope。每次实际 attempt 的 purpose 保留 principal/acceptance，主请求和辅助请求继承相同准入。终止后已发送但未获完整 usage 的请求仍保持 unknown，不能因取消、重连或新回合被删除。本组件不宣称已完成 SSH 作业或完整 REM-05 跨域用量归属。

取消是另一个提案：`/collab cancel <acceptanceId>` 需要 control 和 host 对精确当前 acceptance/controller 的批准。撤权、连接失效或 lease 到期只取消匹配的远端来源 controller。旧 settlement 先同步释放来源，再等待网络回复；迟到回复不能清除或取消后来的本地回合。持久 prompt/terminal 保存完成后才提交 outcome；持久结果未知时保留 unknown。撤权后重新授予权限、host 接管，都不能把已隔离的旧结果升级为 completed。

同一 owner/session 创建身份/project 只允许一个有效 host lease。租约 5 秒，心跳续约；每次接管增加 generation。`/collab resume <roomId>` 先读取并展示保留 ACL，再要求 epoch、ACL revision、generation 精确相同才发布新 snapshot。服务重启变更 epoch 并隔离旧能力，accepted/dispatched 工作保留 unknown，不自动重放。再次撤权仍保留已执行操作的 unknown，不把它改称从未执行的 rejected。

本地 host 替换也按精确实例隔离。已经关闭的 host 即使收到迟到心跳成功或失败，都不能发布提案、清除新实例的批准或取消新实例的 controller；请求返回后再次检查实例及关闭状态。

## 事件、游标与恢复

wire event 只有固定 lifecycle kind、单调 sequence 和 timestamp。不转发文本 chunk、推理、路径、工具名/参数、provider graph 或二进制附件。完整消息经过共享脱敏 owner 后投影为文本；大的字段整体省略，避免在截断边界留下秘密。

event 最近保留 256 项，每页 64 项、host 批次至多 128 项。观察器不等待网络，不参加 renderer，异常立即撤销准入并注销；队列溢出产生 `relay.gap`。snapshot 与 sequence cutover 同一服务事务发布，但 transcript/thread 获取本身不是事务，所以 source consistency 始终明确为 partial。

guest 只运行一个有界 polling 请求；私有 cursor 保存 room/service/binding/generation、sequence、事件和 snapshot。显式重新 join 遇到不同 epoch/generation 时丢弃旧投影，并展示 gap；离开或关闭取消实际在途请求。ACL 变化隔离旧 ticket，失联不伪造完整恢复。

## 共享与本地导出

```text
/share preview
/share publish guest 3600
/share read <shareId>
/share revoke <shareId>
/share delete <shareId>
/dump preview
/dump copy
/dump save ./conversation.json
/dump save ./transcript.jsonl --raw
```

preview 不建立网络连接。publish 冻结 snapshot、digest、origin、账户 ACL 和过期时间，通过普通本地审批后上传。share ID 只是 locator；读取仍需认证账户和 ACL。TTL 为 60–86400 秒。撤销或删除后移除内容并拒绝访问；不因持有链接授予访问权。

snapshot 至多 256 条、每条文本 32KiB、总计 512KiB；opaque/HTML 字段不能由客户端上传。获取 transcript/state 在分配正文前限制 2MiB，超限明确不可导出。UTF-8、遗漏附件、大字段和损坏源均保留真实限制。

dump 默认只保存脱敏 projection；copy 复用现有 clipboard owner，保留 copied/offered/unavailable。save 复用现有 guarded file commit，传递原生每文件授权检查，批准后仍复验附加 root 身份、deny、session 和源绑定。`--raw` 只允许另行批准的本地 save，可能包含秘密；不支持 raw share/copy。目的地、完整字节数与内容摘要在审批中可见；一般内容展示至多4096字符，raw展示至多2048字符，缩短时明确标记。先脱敏再缩短并限制控制字符转义后的显示长度，完整原始保存内容保持其批准摘要。文件以 mode0600 发布。

## 持久性、容量与部署边界

一个私有服务状态事务拥有 ACL、lease、snapshot/sequence、proposal、share 和 mutation receipt。结构性变更先保存 intent，再保存 actor/request-ID/digest 绑定的结果。丢失回复时查询 `/collab receipt <requestId>`；客户端保留 unknown 和 request ID，不自动重发效果。同 ID 不同内容拒绝，1024 项收据满时拒绝新结构变更，不淘汰收据使旧效果再次可执行。frame 使用持久 high-watermark/digest，不占结构性收据。

服务状态 8MiB，最多 32 个账户、64 个房间、128 个 share、每房间128个 proposal；wire body/reply 768KiB、header8KiB、16个活动请求、32条连接、每请求10秒总期限。服务 owner 文件防止两个 listener 共享同一状态；只回收可证实已退出的本机进程。状态不可写、容量满、取消、失联和未知 publication 不显示成功。

文件锁与条件 publication 不承诺对不合作的外部进程提供文件系统竞态消除，也不承诺多文件 crash atomicity。已验的 loopback/TLS 合成部署不能证明公共部署运维、真实模型质量或非 Linux 平台可用；具体源码、测试、CLI 和交付证据分别记在 [Phase 19](phase-19-decisions.md)。SSH 与媒体能力有各自 owner，协作 relay 不替代远端执行、语音或终端录制。

实现入口：[服务](../../packages/ts-shell/src/collaboration/service/listener.ts)、[客户端](../../packages/ts-shell/src/collaboration/client/service.ts)、[CLI](../../packages/ts-shell/src/cli/collaboration/command.ts)、[导出获取](../../packages/ts-shell/src/session/export/source.ts)。
