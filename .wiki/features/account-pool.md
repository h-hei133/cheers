---
title: "显式账号池"
category: article
created: 2026-10-17
updated: 2026-10-17
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

- 本批不做轮换、quota/429 退避归属和跨进程 refresh lease；这些属于 PRV-04/05。
- 不复制 live rotating OAuth 到其他 profile；每个 profile 独立登录。
- 已验证：池校验、空池、不可用成员、池内选择、显式连接优先、会话亲和、身份/代际；未运行真实 provider。
