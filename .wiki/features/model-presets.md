---
title: "模型角色预设"
category: article
created: 2026-10-17
updated: 2026-10-17
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
| `save <name> [role=provider/model[@effort]]` | 保存到当前会话；无显式角色时使用当前选择 |
| `save <name> --profile …` | 保存到 profile 库；同名整项替换并明确报告 replaced |
| `promote <name>` | 把会话预设复制到 profile 库 |
| `delete <name>` | 从 profile 库删除；返回 deleted 或 was not found |
| `list` / `status` | 合并列出，标注 `[session]` / `[profile]`，同名时标注会话遮盖 profile |
| `apply <name> [role]` | 先查会话，再查 profile；整项解析，不跨层拼角色 |
| `validate <name>` | 用同一解析顺序验证全部角色 |

## 3. 遮盖与应用

同名时会话整项获胜；profile 的角色不会补进会话缺失的角色。删除 profile 条目后若会话仍有同名预设，应用继续使用会话条目。

应用前验证每个角色：名称与目标形状、目录中真实模型、effort 能力、连接存在且 provider 一致且状态为 `connected`。任一角色失败则整个应用拒绝，不产生半更新。

选中的角色通过现有 `session/model/state.ts` 锁内事务写入 `connectionId/provider/model/effort`，只改当前会话，不写全局配置。目标连接不是当前连接时拒绝并提示先 `/connect use`，与手动切换的规则一致。

角色名的消费者是显式的 `apply` 动作；后台 advisor、压缩、子代理不会因为某个角色名而自动换模型。角色名不会被解释为权限或自动请求授权。

## 4. 边界

- 没有跨层角色合并、自动提升或默认写全局。
- 未实现 PAN-01 的角色编辑面板与 PRV-03 的账号池。
- 已验证：保存/列表/删除、会话遮盖、提升、profile 应用、损坏库报错；未运行真实 provider 或跨平台动态证据。
