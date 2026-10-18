---
title: "模型可用性投影"
category: article
created: 2026-10-17
updated: 2026-10-19
tags: [models, providers, phase-20]
summary: "本地可证明的 provider/connection 可用性事实、脱敏endpoint与选择器一致行为；不把打开UI变成认证探针。"
---

# 模型可用性投影

`core/models/availability.ts` 提供 provider、连接与凭据状态的共享脱敏投影。明确选择连接时，模型面板还用请求解析器检查该连接自身的凭据；普通 provider 的环境/兼容凭据事实不等于某条连接获准借用该账号。两条路径均不发起网络请求，也不声称端点已通过实测。

## 1. 状态

| 事实 | 含义 |
|---|---|
| `ready` | 无池时至少一个连接或兼容/环境凭据可解析；有池时至少一个完整合法池成员有自己的可用凭据 |
| `credential-missing` | 目录中存在，但没有任何本地凭据来源 |
| `pending` / `error` | 连接自身的持久状态，优先于凭据判断 |
| `unsupported` | 存在已保存连接，但当前目录没有该 provider |
| `unknown` | 未取得可判定事实；保留文本降级 |
| `pool-empty` / `pool-unavailable` | 池明确为空，或完整拓扑/自身凭据/当前代次等待不允许任何成员 |

`measured` 始终为 `unknown`：配置中的 key 不是一次成功往返。真实可用性仍由显式 live 检查或实际请求记录，不由选择器推断。

凭据来源覆盖 CLI 之外的级联事实：连接自身 API key/account、环境变量、provider profile 的兼容凭据。凭据值不进入投影；连接与 provider 只输出 `credential` 事实和受控原因。

声明账号池后，`core/auth/account/pool.ts` 的 `availablePoolConnections` 同时供请求选择与投影检查完整成员、provider、重复及 endpoint 拓扑，再检查自身合法凭据与当前 generation 的等待。环境、profile 及池外连接不能提高 pool.available；无目录 provider 保留全部已声明连接。无效配置保持不可用。检查不选亲和、不刷新认证、不发布配置、不发网络；过期等待清理由原等待 owner 处理。

## 2. Endpoint 脱敏

只显示 host（含端口）与 pathname；userinfo、query、fragment 全部丢弃，非法 URL 不显示。`/connect status`、连接选择器与目录摘要使用同一函数，避免同一地址在不同表面以不同形状泄漏。

## 3. 消费面

| 表面 | 行为 |
|---|---|
| `/model` 与 `/model list` | provider 行显示凭据事实；默认 list 与数据列表使用实际 endpoint 对应的目录，归属歧义时拒绝列出可选模型 |
| 模型选择器 | 按连接逐模型展示，行内优先显示 connection ID，详情列展示脱敏 endpoint；active 匹配实际请求的连接、模型、endpoint 和凭据；CLI/env/旧配置凭据可通过 provider 行选择模型；无匹配目录项时以只读行显示实际模型；pending/error/无自身凭据项保留原因；预设提供具名角色和整套应用 |
| 连接选择器 | 每行显示投影状态及脱敏 endpoint；active 目标失去池授权时仍显示不可用原因 |
| `/model status` | readiness 行由投影的 pending/error/credential-missing 决定，再检查 base URL 与模型 |

选择器保留目标对象，不从 label 或后续目录重新解析地址。目录 owner 先确定实际地址（明确地址优先，否则规范 provider 的目录默认地址），再匹配相同 runtime、地址去尾部斜线后相等的 alias。唯一 alias 拥有模型及全部元数据；缺字段或缺模型保持未知，不借用官方条目或另一 relay。没有匹配 alias 时才使用规范 provider 目录，多个 alias 声明同一地址时拒绝选择和请求。

模型/思考菜单、preset、上下文与 tier 校验、主请求、委派、顾问、侧问和摘要沿同一归属读取能力与协议；输出字段、effort 映射、温度支持、缓存元数据和容量均随实际 endpoint。歧义检查先于主请求的账号续期与 readiness，侧问及压缩也不得发送。目录默认地址同样适用，不要求为使用默认地址额外保存一条连接。原始 URL 不新增到会话模型或临时选择的公开状态中。

当前模型与全局默认连接分别判定；自动回退的具名连接可正确显示 active，CLI/env 凭据不能因此被归到保存的另一账号。选择器与命令的 reasoning effort 都来自实际请求解析结果，再沿原项目偏好回退；不能混用默认 provider 的 effort。只读当前项不提供保存动作。

## 4. 选择身份与失败

会话选择继续由 `session/model/state.ts` 在锁内以 `connectionId + provider + model + thinkingEffort` 提交。明确连接选择带 `connectionScope: session`，投影覆盖本会话的连接并产生运行时 `sessionConnection` 断言；旧的仅模型偏好仍只在原连接为默认连接时生效。默认选择不写全局；普通 `/model use` 后续模型修改保持已有会话连接，只有显式 `--global` 才尝试修改默认值。

没有命名连接的选择使用明确的 `connectionScope: provider`，不包含 `connectionId`，继续使用同一 session CAS、hook 与配置发布路径。投影把模型/effort/tier 写入 provider 偏好，运行时只从 CLI、环境变量或 provider 配置槽解析凭据，禁止回退到后来新增的命名连接。声明账号池时拒绝此绑定，不能借它跳过池限制。凭据不保存到 session；恢复时重新解析当前来源，来源变化不能被描述为固定账号身份。

provider 槽的 `--global` 只在没有连接、账号池或只读输入拥有该默认值时允许，锁内重验，且仅保存模型偏好。预设角色仍要求命名连接；保存当前 provider-only 模型为角色会明确拒绝，用户可提供已有命名连接的目标。

打开面板时捕获 profile、会话模型 revision、工作区、接受的配置 publication、磁盘配置、目录和凭据环境；选择前与锁内重新检查，变化则要求重开。保存后配置发布失败会单独报告，不把已保存当作已应用。

明确的会话连接只能使用自身凭据；不兼容的 CLI provider/endpoint/key override 阻止选择和请求，普通配置既有凭据级联不变。连接删除、provider 变化或 error 状态会阻止发送，用户仍可打开面板选择有效替代连接；不会静默退回全局默认。委派的明确连接替换主会话断言，账号刷新则按已捕获的连接 owner 重读和 CAS，不把默认账号当作本会话账号。

service tier 与 context window 校验实际请求的 provider/model，CLI model 覆盖导致不匹配时拒绝保存。旧的无 scope 会话仍沿原凭据级联校验，不能被偏好更新升级成强制命名连接。provider 槽 OAuth 续期保留该槽的身份，只保存原 owner；等待期间删除凭据或新增账号池会拒绝迟到结果。

打开选择器、刷新列表或渲染状态都不修改连接、模型或 effort，也不产生请求。

## 5. 边界

- 具名连接及无具名连接的 CLI/env/旧配置模型选择、恢复、精确目录能力和歧义拒绝路径有本地合成验证。独立委派账号续期仍需完整复核；不能由此宣称完整 PRV-01…05 已闭合。
- 历史成本按请求发送前捕获的目的地及价格计算；旧 provider/model 记录保留明确兼容解释，缺价不借用当前目录。主、cache 和辅助请求已有本地证据，完整 PRV-05 consumer/publication 仍按范围复核。
- 未验证真实 provider、跨进程并发或 Windows/macOS 实机。
- `unknown` 不等于不可用，`ready` 也不等于远端已确认；两者都不会被写成成功。
