---
title: "模型角色预设"
category: article
created: 2026-10-17
updated: 2026-10-18
tags: [models, presets, phase-20]
summary: "会话预设原位兼容，profile库显式保存/提升/删除；同名整项由会话遮盖，应用验证全部角色并在一次session事务内选择目标。"
---

# 模型角色预设

预设把一个名字映射到若干角色目标：`role → { connectionId, provider, model, thinkingEffort? }`。角色只存非秘密引用，不存 key、header 或 endpoint 秘密。

## 1. 两个 owner

| owner | 位置 | 生命周期 |
|---|---|---|
| session | 会话 `state.json` 的 `modelSelection.presets` | 随会话保存与恢复；既有格式原位兼容 |
| profile | profile 数据目录的 `model-presets.json`（`CHEERS_MODEL_PRESETS_FILE` 可覆盖，必须位于 profile 内） | 同 profile 跨会话 |

profile 库文件形如 `{ "version": 1, "presets": { "<name>": { "roles": { … } } } }`。读取在锁外验证；写入在 `model-presets.json.lock` 内重读、原子写入并读回核对。损坏或不支持的结构报错，不当作空库。

## 2. 命令

| 命令 | 行为 |
|---|---|
| `save <name> [role=connection-or-provider/model[@effort]]` | 保存到当前会话；无显式角色时使用当前选择 |
| `save <name> --profile …` | 保存到 profile 库；同名整项替换并明确报告 replaced |
| `promote <name>` | 把会话预设复制到 profile 库 |
| `delete <name>` | 从 profile 库删除；返回 deleted 或 was not found |
| `list` / `status` | 合并列出，标注 `[session]` / `[profile]`，同名时标注会话遮盖 profile |
| `apply <name> [role]` | 先查会话，再查 profile；整项解析，不跨层拼角色；空会话可直接应用 profile 项 |
| `apply <name> --all` | 一次 session 事务应用 `default` 和自动 `subagent`、`summary`、`advisor` 策略；必须有 `default`，不接受无自动 consumer 的其他角色 |
| `validate <name>` | 用同一解析顺序验证全部角色 |

明确角色可用 `review=relay-b/model@high` 指定连接。连接 ID 的精确匹配优先于 provider 名；provider 名匹配多个连接时，只有当前 session 的 connection ID 和 provider 同时匹配才能消歧，否则要求明确连接。目录 alias 还需 runtime 与 endpoint 匹配，不选第一个同协议连接。模型 ID 中的后续 `/` 保留。

显式 `save --profile` 与 `validate` 可在无 session 时管理库；未提供角色目标的 save 需要已选模型。`apply` 总是需要 session，但不要求先选一次模型。删除 profile 项后若同名 session 项仍存在，命令明确报告该 owner 仍可用。

## 3. 遮盖与应用

同名时会话整项获胜；profile 的角色不会补进会话缺失的角色。删除 profile 条目后若会话仍有同名预设，应用继续使用会话条目。

应用前验证每个角色：名称与目标形状、目录中真实模型、effort 能力、连接存在且 provider 一致且状态为 `connected`、自身凭据、账号允许模型、模型 scope 与请求预算约束。任一角色失败则整个应用拒绝，不产生半更新。

选中的角色通过现有 `session/model/state.ts` 锁内事务写入 `connectionId/provider/model/effort`，只改当前会话，不写全局配置。目标连接可与当前连接不同；连接、模型和 effort 在同一次 session CAS 中提交，不需先修改全局 `/connect use`。空会话也可应用 profile 预设。任一角色缺少自身凭据、预设 owner/内容变化、session/config/catalog revision 变化或请求 override 改变目标时拒绝；已选择连接失效不会退回默认账号。

`apply --all` 同时保存默认目标与 `modelSelection.roles`。`subagent` 用于未明确指定模型的普通子代理，选择该角色的精确连接/模型/effort；定义中的显式模型优先，只有 effort 的定义覆盖角色 effort。子请求仍走现有 scope、权限、请求账本与预算；角色失效时失败，不回退主账号。工具结果报告选中的目标、effort 与来源，零发送失败不会伪称执行成功。

`summary` 用于手动压缩、自动压缩（含侧会话）、turn-prefix 与分支摘要。主模型决定压缩阈值、保留历史与上下文显示；摘要角色决定实际发送连接、模型、effort、协议与摘要请求限制。摘要身份进入已完成步骤的复用键，改变角色、effort、能力或摘要请求限制不会复用旧材料；未选择角色的既有步骤键保持兼容。摘要账号在一次压缩内只刷新一次，多个步骤共享已验证的新凭据，每次发送仍独立计量。明确角色不可用时拒绝，不轮询其他角色或父账号。摘要窗口预检发生在任一步骤 claim/发送前，拒绝不会冒充可能已发送。

整个预设重新应用会替换策略，未提供的自动角色会清除旧 assignment；个别角色应用或普通模型切换保留策略。删除/编辑预设库不会暗改已经应用的会话策略；再次应用才捕获新内容。策略随 session 恢复，经运行时配置投影传入下一次调用，不写入全局配置。角色名不会被解释为权限或自动请求授权。

`advisor` 用于已明确启用的 checkpoint 审核。保存/应用预设不启用审核；`/advisor on` 才启用，恢复会话后仍需重新启用。`/advisor configure connection/model` 的明确模型优先；省略目标的 `/advisor configure [--every N]` 恢复使用会话角色并保持关闭。缺少角色、连接失效、scope 或 effort 不兼容都拒绝，不借用 subagent 或父模型。审核继续独立、无工具，建议必须通过 `/advisor apply <id>` 显式提交。

审核结果绑定配置 publication、模型 revision、目标/effort、目录能力与凭据身份，派发、发布和应用均检查；A→B→A 不复活旧建议。CLI 捕获的请求函数还固定其 publication/model revision，配置重载后手动 review 不能复用旧连接闭包。若主回合期间发生 publication 更新（包括凭据续期发布），本回合明确报告跳过 checkpoint；下一次新回合重新捕获后恢复审核。独立 advisor 账号的自动续期仍沿现有委派路径，其完整生命周期在 PRV-04/05 继续复核。

## 4. 边界

- 没有跨层角色合并、自动提升或默认写全局。
- 模型面板提供各具名角色及整套应用；任意自定义名字继续支持个别应用。账号池已有实现，其完整裁决另行复核。
- 已验证：保存/列表/删除、会话遮盖、提升、profile 应用、损坏库报错；未运行真实 provider 或跨平台动态证据。
