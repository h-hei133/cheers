---
title: "显式账号池"
category: article
created: 2026-10-17
updated: 2026-10-18
tags: [auth, accounts, phase-20]
summary: "按 provider 限定的封闭连接集合：显式成员、endpoint/OAuth 受众约束、稳定 credential 身份、会话亲和；空池零发送且不回退环境或 profile 凭据。"
---

# 显式账号池

```jsonc
{
  "accountPool": {
    "openai": { "connections": ["work", "personal"], "baseUrl": "https://api.openai.com/v1" }
  }
}
```

`accountPool` 只接受 user 与运行覆盖来源；项目文件不能声明它。每个键是 runtime provider，成员是同一 provider 的既有连接 id。`connections: []` 是明确的“零授权”，不是“无限制”。

## 1. 校验

加载时逐项检查：成员必须存在、属于声明的 provider、不得重复；声明 `baseUrl` 时每个成员的 endpoint 必须与之一致。任一失败使本次配置无效并给出不含秘密的诊断，不会静默丢弃成员。

OAuth 受众沿用现有凭据类型检查：OpenAI 账户 token、Google 账户 token 与订阅 token 各自只发给对应 provider；池不会把一种 token 当作另一种。

## 2. 选择

| 情形 | 结果 |
|---|---|
| 显式 active connection | 使用该连接，即使它在池外 |
| CLI 显式 API key | 使用 CLI 凭据 |
| 已声明池 | 只在池成员中选择 |
| 池为空 | `pool-empty`，不发送 |
| 池成员均不可用 | `pool-unavailable`，不发送 |

池模式下凭据只来自被选中的连接本身（accountAuth 或 API key），不回退到 `OPENAI_API_KEY` 等环境变量或 provider profile 的兼容 key；这些来源不属于池授权。

同一 session 内按稳定哈希选择成员并记住结果，后续请求保持亲和；成员被删除或失去凭据时重新选择。亲和表有界（1024 个会话键），不写入会话文件。

## 3. 身份

`credentialId` 为 `<provider>:<connectionId>`，与数组下标和显示标签无关；`generation` 是凭据材料的非秘密摘要，凭据轮换后变化。后续 refresh/请求归属（PRV-04/05）以这组身份做条件保存和退避归属。

可用性投影新增 `pool-empty` / `pool-unavailable` 状态与 `pool.members/available` 计数；`/model`、连接选择器与 `/model status` 继续使用同一投影。

## 4. 边界

- refresh lease、请求凭据代次与独立 advisor/subagent 的发送前续期已接入；完整 quota/429 与历史成本归属仍按 PRV-04/05 继续复核。
- 不复制 live rotating OAuth 到其他 profile；每个 profile 独立登录。
- 已验证：池校验、空池、不可用成员、池内选择、显式连接优先、会话亲和、身份/代际；未运行真实 provider。

## 5. Refresh 归属与跨进程互斥

同一 refresh token 的交换由 profile 内的 `refresh-leases.json`（`CHEERS_REFRESH_LEASES_FILE` 可覆盖，必须位于 profile 内）协调。lineage key 是 provider + credentialId + refresh token 摘要；条目记录 owner、阶段与 generation：

| 阶段 | 含义 |
|---|---|
| `prepared` | 已取得所有权，尚未发送 |
| `dispatched` | 已越过发送边界，服务端可能已旋转 |
| `unknown` | 结果不可验证；禁止重放旧 token，需重新登录 |

同进程仍先走既有 single-flight：共享调用不会重复取得 lease，只有真正执行交换的调用取 lease。其他进程遇到活动 lease 时等待有界时间并重读已保存凭据；遇到过期 `dispatched` 或 `unknown` 时直接拒绝发送并要求重新登录。持久化成功后按 lineage generation 清除条目，因此共享调用中的跟随者也能确认完成；generation 不匹配拒绝清除。迟到响应仍由 `persistAccountEdit` 的完整身份比较拒绝，不覆盖重新登录、删除或换连接后的新 generation。

发送标记在实际刷新 fetch 之前持久化并读回；标记无法验证则不发送。已经开始的交换发生网络失败、响应丢失或存储不可验证时，保留 `unknown`，后继调用不重放原 refresh token。

只有未发送的 `prepared` 记录按时间淘汰。`dispatched/unknown` 不因年龄或其他账号的清理而删除；过期只取消活动所有权，不证明旧 token 可以再次消耗。多年后重启、更换 access generation 或操作其他 lineage 仍保留拒绝事实；正常已验证持久化继续按原 generation 完成清理，新 refresh token 不受旧记录限制。

等待 peer 完成的调用仍使用交换前捕获的 `AccountEdit`：配置存储位置、provider、连接、endpoint、账号元数据、原始选择规则和镜像必须与该 owner 的旋转结果一致。原连接消失不能借用 provider 槽；不把另一账号的新 token 当作成功。完成凭据必须有变化且仍有效；服务端保留 refresh token、只更新 access token/expiry 也可接受。读回验证不重写 peer 已保存的配置。

本地证据包含真实两个 Node 进程与本机 HTTP 的成功、稳定 refresh token、删除、重登录及响应丢失五格；每格只发送一次交换。未访问真实账号，不能据此宣称真实 provider 或全部委派消费者已完成验收。

profile 导入不复制 live rotating OAuth，因此不会产生第二个可消费授权；lease 文件也不跨 profile 共享。

不同存储槽位的同一消费 lineage 互斥、旧键迁移以及 `rotated-persisted` 故障恢复仍须按 PRV-04 复核；当前的年龄保留修复不能代替这些验收。

## 6. 委派请求的续期与发布

普通子代理与顾问在实际请求前复用同一账号续期 owner。单次运行最多缓存 32 个捕获的账号身份；并发模型共享正在进行的交换和已验证结果。每次复用仍读取原 `AccountEdit` 的存储回执，删除、重登录、拓扑或镜像变化都拒绝，不能仅凭内存里的新 token 继续发送。目录提供的默认地址用于请求校验，不写入原凭据身份。

已开始的交换即使被取消也完成条件持久化，但取消后不再派发模型请求。只有存储验证通过才发布新凭据；主账号续期也不可变地更新当前运行配置的精确 owner/镜像，使随后按名称选择的角色使用新凭据。

顾问准备发生在原超时、取消和 durable pending 生命周期内；关闭或未命中 every-N 的 checkpoint 不续期。只允许该次准备通过其专属 publication 回调接纳经过验证的 token 字段变化，普通委派和并发顾问不能互相接纳对方的发布。设置、模型 revision、目录、作用域或账号身份变化仍使旧审核失效；准备超时后保留 pending，直至准备真正结束。

主请求发送前续期的存储回执同样交给该回合已经捕获的 checkpoint。只有精确 owner 的 token 发布、配置 revision 单次前进及原模型绑定都通过时，当前回合才继续顾问审核；共享同一账号的不同模型角色直接使用新 token，不重复交换。回执仅经过原生回调，不进入模型请求或事件。

存储成功仍必须发布，观察者遗漏、重复调用或抛错不能阻断或重复这次发布；发布者自身的错误保留。缺回执、宿主拒绝/未确认发布、模型读取失败及任何不相符变更均使旧 checkpoint 失效，即使宿主保留原配置对象也不发顾问请求。下一新回合重新捕获配置；这一接纳不放宽取消、超时、作用域或原始账号限制。
