---
title: "显式账号池"
category: article
created: 2026-10-17
updated: 2026-10-19
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

OpenAI/Google 槽位检查现有凭据类型；subscription 保留在 Anthropic/Copilot 的既有槽位。两种 subscription 仍共享类型，没有完整 issuer/受众证明，不能据此宣称跨 provider 受众隔离完成。

OpenAI/Google 账号由 issuer 固定选择账户服务地址和各自原生协议；存储/CLI 显式地址不相符即拒绝。其他账号地址仍来自所属配置/连接、subscription 签发地址及内置缺省值。连接自身账号不继承 provider profile 地址；模型目录不能搬迁账号凭据。主请求、委派、摘要、cache、agent 和 `/btw` 共用校验，在续期与发送之前拒绝；原生 OpenAI 没有 cache refresh 能力。API key 保留原目录地址回退。其他 provider 的显式存储绑定不能证明 OAuth 受众或原生协议合法。

## 2. 选择

| 情形 | 结果 |
|---|---|
| 显式 active connection | 必须是完整合法池中的可用成员；池外或仍在退避时拒绝 |
| CLI 显式 API key/endpoint/provider | 已声明池时不得扩大授权；无池 API key 保留覆盖，账号地址仍校验 owner |
| 已声明池 | 只在池成员中选择 |
| 池为空 | `pool-empty`，不发送 |
| 池成员均不可用 | `pool-unavailable`，不发送 |

池模式下凭据只来自被选中的连接本身（accountAuth 或 API key），不回退到 `OPENAI_API_KEY` 等环境变量或 provider profile 的兼容 key；这些来源不属于池授权。

实际解析再次校验捕获的完整拓扑，包括缺失、重复及去除空白后重复、外来 provider 和声明 endpoint 不匹配。显式委派保留完整父拓扑；有父 provider 池时，具名外来连接和角色也不能通过重写绑定扩大它。bare/current-provider 委派同样校验原池。

可用成员必须有自己的合法凭据。首选 account-auth 缺少对应槽位、类型不符或 access token 为空时拒绝，不改用保留的 API key；环境及 profile 凭据不能让池成员变成可用。池选择与实际请求使用同一个所选材料 generation。

同一 session 内按稳定哈希选择成员并记住结果，后续请求保持亲和；成员被删除、失去凭据、换代或仍在退避时不复用旧 pin。普通亲和可以选择可用兄弟成员，显式连接不自动换账号。亲和表有界（1024 个会话键），不写入会话文件；切换不清空 session cap。

## 3. 身份

`credentialId` 为 `<provider>:<connectionId>`，与数组下标和显示标签无关；`generation` 是凭据材料的非秘密摘要，凭据轮换后变化。后续 refresh/请求归属（PRV-04/05）以这组身份做条件保存和退避归属。

可用性投影新增 `pool-empty` / `pool-unavailable` 状态与 `pool.members/available` 计数；`/model`、连接选择器与 `/model status` 继续使用同一投影。

可用集合与请求选择共用 `availablePoolConnections`。完整拓扑校验后才筛选自身合法凭据、状态及当前 generation 的等待；池外、ambient、无效 account-auth 和 foreign 成员不能计入可用数。无目录 provider 仍保留全部连接。只读检查不选择亲和、续期、发布配置或访问网络；active 连接不可用也展示拒绝原因。

## 4. 边界

- refresh lease、请求凭据代次与独立 advisor/subagent 的发送前续期已接入；完整 quota/429 与历史成本归属仍按 PRV-04/05 继续复核。
- 不复制 live rotating OAuth 到其他 profile；每个 profile 独立登录。
- subscription 配置规范化现已保留，完整 subscription 身份/续期继续开放。[原生请求协议](provider-protocols.md)独立声明 OpenAI issuer、stream-only、provider-owned output 和 grant 回放，以及 Google 自有 OAuth 的固定 API、实际 scope/project、精确续期与签名回放；合成协议成功不证明真实账户 entitlement 或远端兼容性。
- 本轮已验证完整拓扑、显式/CLI/委派限制、owned credential/实际代次、等待亲和、实际 CLI 子请求与共享账本、Linux 四格隔离 PTY。独立复核、反转和精确交付证据见开发日志；完整 PRV-03/05 仍开放，未运行真实 provider。

## 5. Refresh 归属与跨进程互斥

同一 profile 的权威 `refresh-leases.json` 使用 V2；`CHEERS_REFRESH_LEASES_FILE` 覆盖仍必须位于 profile 内。实现与合成验收已完成，提交、推送和远端结果以开发日志为准；旧批的并发和年龄测试不能作为 V2 全部验收。

消费谱系由可信 provider/issuer/client 与去除首尾空白的 refresh token 摘要确定，不包含连接 id。每个授权 grant 另绑定权威存储、精确槽位/镜像 owner 与完整凭据摘要；显示用的 credential generation 不作为刷新许可。复制槽位不能取得同一谱系的第二份授权。

| 持久事实 | 含义 |
|---|---|
| grant | 有唯一 id 的当前授权，记录 baseline、native login 或已验证旋转来源 |
| prepared | 不可变 attempt 已取得 grant，尚未发送；只可接管已过期的未发送准备 |
| dispatched | 实际 HTTP 前已写入并读回；可能已消费 token |
| unknown | 无法验证交换结果或保存；保留拒绝，不凭过期/改 access 字段授权重播 |
| native production | 配置写入前记录下一凭据、谱系与精确 owner/storage 指纹，不含原始 token 或响应 |
| rotated-persisted | 原 attempt 的消费和存储已确认，永久保留 predecessor；只给精确已存结果建立后继 grant |

同进程与跨进程均先捕获实际 `AccountEdit`、固定权威账本路径并取得谱系授权，再进入原生 single-flight。同进程共享键包含存储、owner、grant 与 attempt；同 owner 的跟随者可以取得唯一原生结果并独立条件保存，另一槽位不能取得原生凭据或外来存储回执。跨进程跟随者只等对应 attempt 的 terminal，再验证自己捕获的 owner。等待者不把条目删除当作成功。

固定路径同时保留启动时的 profile 目录身份；每次账本读取和锁内 mutation 都重新验证，包括 default profile。原目录被删除、替换或改为链接后，旧 attempt 不能在同名新目录派发；后续环境或当前 profile 变化也不能把原操作改指向另一存储。

原生响应能力只在实际 token exchange 内创建；任意返回对象或伪造 capability 不能授权下一代。响应先写无秘密指纹，再由 `persistAccountEdit` 条件保存并读回确认，最后在账本同一次 mutation 中保留消费历史和授予后继。服务端保留 refresh token 时，后继使用同一谱系的新 grant；旧 grant 和 attempt 不能被新 access generation 复活。迟到 unknown/release/finish 必须检查原不可变 attempt/grant，不能回退 terminal 或删除后继。

刷新响应的 access 凭据在接纳时必须尚未过期；已过期或完全未变化的原生结果保留 unknown，不保存为可用后继，也不在下次调用自动重播。尚有效但进入 60 秒续期窗口的凭据仍可接纳，该窗口不等于实际过期。

配置已存但账本完成写失败时，已存 access 凭据仍是事实，返回 cleanup 未确认。新进程只能用当前**自己的**存储匹配此前持久化的原生指纹，补完账本且零 HTTP；复制其他槽位的凭据、仅发现配置字节变化或缺少原生响应指纹都不能恢复授权。当前没有跨网络与文件的崩溃原子性承诺。

恢复时若已存 access 凭据已经过期，仍补完消费历史，但明确报告需重试，不返回过期凭据作为成功结果；下一次普通调用才可使用已经验证的后继 grant 刷新。无法识别的旧记录在恢复前检查，已有登录预留不能被后继授权覆盖。

V1 使用同一权威文件和锁迁移，旧 reader 必须拒绝 V2。能由当前 owner/token 重算的原 opaque key 才能映射，matched dispatched/unknown 保留；删除/改名后无法识别的旧记录保持 store-wide fence，不能按年龄淘汰。只有证实未发送的过期 prepared 可以释放。V1 曾删除的成功消费记录无法重建；证据为空的现有配置 enrollment 是明确的兼容假设，不是证明 token 从未使用。

新的 native login 同样需要实际 authorization-code exchange 的能力，以及未变更的 pending slot/provider/mirror 和写后确认。原始返回 payload 不能 mint grant。已知谱系历史或无法识别的 V1 不确定性不被重登录覆盖；可以保留已确认存储的 access 凭据，但必须显示 automatic renewal 未验证及独立 fresh profile 登录路径。

新的登录在凭据保存前持久化 enrollment，防止未验证返回值日后借用 baseline 兼容授权。预留写入抛错、丢写或读回失败时，中止凭据保存并报告 write state unchanged；已经存在的消费不确定性则可保留 access 存储并显示续期警告。OpenAI/Google 登录结果接纳时也必须尚有效；过期结果不建立连接凭据或 grant。写后 provider/active 选择与精确 pending owner 都必须一致，才能报告默认切换成功。

首版 profile 导入继续丢弃 live rotating OAuth，目标要求独立登录；不同权威存储之间不提供共享 mutex，不能宣称任意手动复制 token 到两个独立 profile 仍可全局互斥。账本不跨 profile 暗中共享。

## 6. 委派请求的续期与发布

普通子代理与顾问在实际请求前复用同一账号续期 owner。单次运行最多缓存 32 个捕获的账号身份；并发模型共享正在进行的交换和已验证结果。每次复用仍读取原 `AccountEdit` 的存储回执，删除、重登录、拓扑或镜像变化都拒绝，不能仅凭内存里的新 token 继续发送。账号地址先按 owner 校验；请求使用的缺省地址不写入原凭据存储身份，主请求 readiness 后也保持这一合同。

已开始的交换即使被取消也完成条件持久化，但取消后不再派发模型请求。只有存储验证通过才发布新凭据；主账号续期也不可变地更新当前运行配置的精确 owner/镜像，使随后按名称选择的角色使用新凭据。

顾问准备发生在原超时、取消和 durable pending 生命周期内；关闭或未命中 every-N 的 checkpoint 不续期。只允许该次准备通过其专属 publication 回调接纳经过验证的 token 字段变化，普通委派和并发顾问不能互相接纳对方的发布。设置、模型 revision、目录、作用域或账号身份变化仍使旧审核失效；准备超时后保留 pending，直至准备真正结束。

主请求发送前续期的存储回执同样交给该回合已经捕获的 checkpoint。只有精确 owner 的 token 发布、配置 revision 单次前进及原模型绑定都通过时，当前回合才继续顾问审核；共享同一账号的不同模型角色直接使用新 token，不重复交换。回执仅经过原生回调，不进入模型请求或事件。

存储成功仍必须发布，观察者遗漏、重复调用或抛错不能阻断或重复这次发布；发布者自身的错误保留。缺回执、宿主拒绝/未确认发布、模型读取失败及任何不相符变更均使旧 checkpoint 失效，即使宿主保留原配置对象也不发顾问请求。下一新回合重新捕获配置；这一接纳不放宽取消、超时、作用域或原始账号限制。
