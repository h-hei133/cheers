---
title: "按路径作用域设置"
category: article
created: 2026-10-17
updated: 2026-10-17
tags: [configuration, scope, phase-20]
summary: "路径规则是配置派生，不是新的workspace授权：固定声明基准、canonical目录组件匹配、逐字段安全合并、不可变操作快照与失效边界。"
---

# 按路径作用域设置

`pathRules` 让同一次安装按目标路径派生普通操作设置。它不是第二条权限系统：文件与命令仍由 workspace grants、pathJail、deny rules 和 execution authority 决定；路径规则只能在已授权范围内收紧或选择普通值。

```jsonc
{
  "pathRules": [
    { "path": ".", "settings": { "maxOutputTokens": 4096 } },
    { "path": "packages/generated", "settings": { "allowedTools": ["read"] } }
  ]
}
```

## 1. 声明与来源

- 只有项目主配置、用户主配置和显式 `--config` 输入可以声明规则；环境变量与启动覆盖不接受 `pathRules`。
- 项目规则的相对路径以声明项目的 canonical workspace 为基准；用户与显式输入的相对路径以该配置文件的 canonical 目录为基准，不在消费时读取 `process.cwd()`。
- 项目规则继续经过项目信任检查；被拒绝的安全字段不会因为出现在规则里而获得授权。
- 最多 128 条规则；超出是受控配置错误，不截断。
- `settings` 只接受 §3 登记的公开操作字段。`provider`、`providerCredentials`、`providerConnections`、`activeProviderConnectionId`、`allowUntrustedHooks`、`theme`、`tui`、`pathRules` 等字段在规则中一律非法，诊断不回显值。

## 2. 路径身份

规则与目标都先捕获真实路径：存在的部分取 canonical 路径，未创建的目标复用最深存在父目录的 containment；悬空链接、非目录规则前缀和不可读祖先拒绝。

匹配使用 canonical 目录组件边界，不是字符串前缀：`/repo/a` 匹配 `/repo/a/..cache`，不匹配 `/repo/ab`。Linux 大小写保持文件系统原样；Windows 仅 drive/UNC 锚点大小写不敏感。

目录 identity 与 canonical 路径一起冻结。目录被替换、链接改指或 workspace root rebind 后，旧快照拒绝继续使用；A→B→A 也不恢复旧准入。

## 3. 字段与优先级

| 基准 | 字段 | 合并 |
|---|---|---|
| session | `maxTurns`、`temperature`、`topP`、`maxOutputTokens`、`contextWindow`、`reserveTokens`、`instructionBudgetBytes`、`retry*`、`providerRetryMaxRetries`、`steeringMode`、`followUpMode`、`provider*TimeoutMs`、`allowedModels` | 沿用字段注册表的 replace/intersect 政策 |
| target | `allowedTools`、`disabledTools`、`hiddenToolPrefixes`、`denyRules`、`enableMcpTools` | allowlist 求交、disabled/prefix 求并、deny 累积、false 不可被更深规则撤销 |

解析顺序：内置默认 → 每个来源自己的 base 值 → 该来源命中规则的宽→窄应用 → 下一个来源。等价 prefix 按声明顺序应用并给出诊断。安全限制只收紧，不因更深规则扩大 allowlist 或移除父级 deny。

模型请求使用 session/子代理绑定的 workspace scope；shell 使用操作启动时的 canonical cwd；文件工具按实际目标逐项求策略。多文件操作取共同限制；普通设置冲突显式拒绝并提示拆分操作，不替用户选择第一条规则。已配置的模型 allowlist 无匹配时拒绝请求，不回退全局默认；空 allowlist 表示零请求/零工具。

## 4. 快照、消费与失效

`ConfigScopes` 在配置发布时冻结：profile、home、workspace、每个来源的 base/规则、规则 revision。操作捕获该对象后，模型步骤、委派步骤、压缩、工具准备、权限评估和结果发布只使用捕获的 scope；`await`、重试和后台完成不重新选择路径。

规则 revision 变化由 `ConfigState` 的 substrate transition 使旧 admission 失效；trust 撤销、workspace 变化和 profile 身份变化沿原 `configurationAdmission` 路径拒绝。设置保存仍走字段 patch/CAS，不把派生后的 effective 值写回文件。

## 5. 边界

- 没有 glob、正则或 YAML；没有通用 null 墓碑，清除值使用现有 unset/字段 patch。
- 不为 provider endpoint、凭据、账号池或预设引用开放路径值。
- Settings 面板的规则查看/编辑属于 SET-01…03；本机制只提供派生与准入。
- 已验证：组件边界、`..cache`、symlink 别名、未存在目标、Windows drive/UNC、等价 prefix、空 allowlist、跨 scope 逐目标、规则目录替换失效。真实跨进程并发、Windows/macOS 实机与 UI 交互不在本批证据内。
