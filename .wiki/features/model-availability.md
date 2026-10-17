---
title: "模型可用性投影"
category: article
created: 2026-10-17
updated: 2026-10-17
tags: [models, providers, phase-20]
summary: "本地可证明的 provider/connection 可用性事实、脱敏endpoint与选择器一致行为；不把打开UI变成认证探针。"
---

# 模型可用性投影

`core/models/availability.ts` 是 provider、连接与凭据状态的唯一本地投影。它只读取已接受的配置、目录和环境变量，不发起网络请求，也不声称端点已通过实测。

## 1. 状态

| 事实 | 含义 |
|---|---|
| `ready` | 至少一个连接或兼容/环境凭据能解析出凭据 |
| `credential-missing` | 目录中存在，但没有任何本地凭据来源 |
| `pending` / `error` | 连接自身的持久状态，优先于凭据判断 |
| `unsupported` | 存在已保存连接，但当前目录没有该 provider |
| `unknown` | 未取得可判定事实；保留文本降级 |

`measured` 始终为 `unknown`：配置中的 key 不是一次成功往返。真实可用性仍由显式 live 检查或实际请求记录，不由选择器推断。

凭据来源覆盖 CLI 之外的级联事实：连接自身 API key/account、环境变量、provider profile 的兼容凭据。凭据值不进入投影；连接与 provider 只输出 `credential` 事实和受控原因。

## 2. Endpoint 脱敏

只显示 host（含端口）与 pathname；userinfo、query、fragment 全部丢弃，非法 URL 不显示。`/connect status`、连接选择器与目录摘要使用同一函数，避免同一地址在不同表面以不同形状泄漏。

## 3. 消费面

| 表面 | 行为 |
|---|---|
| `/model` 与 `/model list` | provider 行显示凭据事实；active 由 `activeProvider/activeModel` 判定 |
| 模型选择器 | 只有 active connection 的 provider 行可选；其余行保留可见但禁用并注明 `switch connection first`；同一 provider 的多个中转站由连接列表区分 |
| 连接选择器 | 每行显示 `active` 或投影状态及脱敏 endpoint |
| `/model status` | readiness 行由投影的 pending/error/credential-missing 决定，再检查 base URL 与模型 |

目录 id 与 runtime 不同（自定义中转站）时，选择器按裸模型名应用，因为 `/model use <catalog-id>/<model>` 会被当作 provider 切换而拒绝；请求目标仍是 active connection。

## 4. 选择身份与失败

会话选择继续由 `session/model/state.ts` 在锁内以 `connectionId + provider + model + thinkingEffort` 提交；投影不写任何配置。打开选择器、刷新列表或渲染状态都不修改连接、模型或 effort，也不产生请求。

## 5. 边界

- 未实现 PAN-01 的两栏面板、PRV-02 的 profile 预设库、PRV-03 的账号池。
- 未验证真实 provider、跨进程并发或 Windows/macOS 实机。
- `unknown` 不等于不可用，`ready` 也不等于远端已确认；两者都不会被写成成功。
