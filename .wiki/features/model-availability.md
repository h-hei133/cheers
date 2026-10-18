---
title: "模型可用性投影"
category: article
created: 2026-10-17
updated: 2026-10-18
tags: [models, providers, phase-20]
summary: "本地可证明的 provider/connection 可用性事实、脱敏endpoint与选择器一致行为；不把打开UI变成认证探针。"
---

# 模型可用性投影

`core/models/availability.ts` 提供 provider、连接与凭据状态的共享脱敏投影。明确选择连接时，模型面板还用请求解析器检查该连接自身的凭据；普通 provider 的环境/兼容凭据事实不等于某条连接获准借用该账号。两条路径均不发起网络请求，也不声称端点已通过实测。

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
| 模型选择器 | 按连接逐模型展示，行内优先显示 connection ID，详情列展示脱敏 endpoint；有凭据的 provider 优先，pending/error/无自身凭据项保留原因；预设按具名角色提供选择 |
| 连接选择器 | 每行显示 `active` 或投影状态及脱敏 endpoint |
| `/model status` | readiness 行由投影的 pending/error/credential-missing 决定，再检查 base URL 与模型 |

选择器保留目标对象，不从 label 或后续目录重新解析地址。规范 provider 的目录可用于同协议 relay；relay 专用目录只关联地址相符的连接。目录无法明确解析的能力保持未验证，不能从另一条 relay 的同名条目猜测。

## 4. 选择身份与失败

会话选择继续由 `session/model/state.ts` 在锁内以 `connectionId + provider + model + thinkingEffort` 提交。明确连接选择带 `connectionScope: session`，投影覆盖本会话的连接并产生运行时 `sessionConnection` 断言；旧的仅模型偏好仍只在原连接为默认连接时生效。默认选择不写全局；普通 `/model use` 后续模型修改保持已有会话连接，只有显式 `--global` 才尝试修改默认值。

打开面板时捕获 profile、会话模型 revision、工作区、接受的配置 publication、磁盘配置、目录和凭据环境；选择前与锁内重新检查，变化则要求重开。保存后配置发布失败会单独报告，不把已保存当作已应用。

明确的会话连接只能使用自身凭据；不兼容的 CLI provider/endpoint/key override 阻止选择和请求，普通配置既有凭据级联不变。连接删除、provider 变化或 error 状态会阻止发送，用户仍可打开面板选择有效替代连接；不会静默退回全局默认。委派的明确连接替换主会话断言，账号刷新则按已捕获的连接 owner 重读和 CAS，不把默认账号当作本会话账号。

打开选择器、刷新列表或渲染状态都不修改连接、模型或 effort，也不产生请求。

## 5. 边界

- 本轮只闭合具名连接的选择、恢复和拒绝路径；无具名连接的 legacy/env-only 精确选择、目录同名能力歧义和完整角色策略 consumer 仍待复核。两栏面板和 profile 预设库已存在，不再列为未实现。
- 未验证真实 provider、跨进程并发或 Windows/macOS 实机。
- `unknown` 不等于不可用，`ready` 也不等于远端已确认；两者都不会被写成成功。
