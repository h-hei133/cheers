---
title: "显式配置输入"
category: article
created: 2026-10-17
updated: 2026-10-17
tags: [configuration, cli, phase-20]
summary: "按启动目录固定的有序只读 JSONC 输入、来源权限、完整重载与主配置保存边界。"
---

# 显式配置输入

启动时可以重复使用 `--config <file>` 或 `--config=<file>`。例如：

```sh
cheers --profile work --project ./workspace --config ./personal.jsonc --config ./local.jsonc
```

普通字段按“原项目/用户配置 → 显式文件的声明次序 → 环境变量 → 启动覆盖”解析。同一个文件重复出现仍保留每个位置；后一次普通值可以覆盖前一次。相对路径固定到进程最初的启动目录，`--project`、切换会话、`/cd` 和同进程 `/restart` 都不会重新解释它。以 `-` 开头的文件名要写成 `./-p` 这类明确路径。真正的 `--` 之后是 prompt，不再选择输入文件。

CLI 的显式输入属于个人来源。JSON 中的 `source` 不能提升文件权限；内部项目来源仍保留项目 allowlist 和信任检查，在解析凭据环境引用之前拒绝不允许的字段。`allowedTools` 求交、`disabledTools` 求并、deny 累积、禁用值不被后续启用撤销。显式空 allowlist 仍表示零工具。TUI 保留项目叶值优先、同来源后来值优先及空项目 status 回退个人值的原有规则。

显式输入必须存在并且是可读、有效 UTF-8 的 JSONC 对象。语法、已知字段的非法值、文件/总预算超限和身份变化都拒绝启动，不静默回退默认值。未知字段继续使用现有受控诊断。最多 32 个显式位置；每文件上限 1 MiB，整个捕获集合上限 8 MiB，集合包含当次存在的项目/用户主文件，重复位置重复计入预算。

`/reload` 先捕获全部文件、验证身份和原始字节版本、合并并再检查，随后由现有配置 publication 一次提交。坏输入保留此前接受的配置、catalogue 和已安装 theme。来源不可读、消失、别名/目录替换或解析不确定时阻止新动作；普通非安全字段的非法值不额外封锁已接受的旧配置。恢复文件后有效重载可解除封锁。普通原子替换文件可在下一次重载生效；重定向符号链接或替换捕获的父目录需要重新启动。此协议不承诺多个外部写入者之间的文件系统事务或跨进程锁。

来源树只记录来源类别、canonical 文件、原始字节 SHA、输入位置及固定字段/数字位置。accepted、shadowed 和 rejected 文件分别保留，不记录凭据值或任意映射 key。部分即时生效的 TUI 叶值可以与仍待重启的旧叶值属于不同原始版本，父级汇总两者。会话模型与显式界面安装同样保留实际叶值来源及拒绝记录。

Settings 继续只对所选 user/project 主文件做单字段 patch。有效值受显式输入遮盖时会说明位置和文件，移除主文件字段仍会显示合法低层或当前输入值。`/connect` 的保存只说明主文件存储结果；重载接受后若显式文件仍提供连接设置，另有来源提示。保存不会改输入文件，也不会把整份 effective 配置写回主文件。

overlay 中的连接可用于当前会话模型选择和 session 预设。hook 等待后的读回仍使用同一组输入，并重核实际连接与凭据身份。全局模型保存拒绝 overlay 拥有的连接数组，避免把有效凭据复制进主配置。持有 live rotating `accountAuth` 的独立输入文件会以 `account-owner` 拒绝；现有刷新持久化只认所选 profile 的主配置 owner，其 canonical alias 可读取。API key 输入沿个人配置现有规则处理；没有新增 OAuth 刷新 writer。

`/profile switch` 使用新进程的显式目标参数，不继承旧 profile 的输入文件。每个 profile 应独立选择所需文件。默认配置未选择 `--config` 时继续兼容原行为。

交付证据以[开发日志](../log.md)的精确提交、CI 与已运行验证为准；本文不把本地实现等同于已交付。

## 环境输入

普通字段只有在注册表里显式声明 `environment` 变量时才读取进程环境；没有声明就不存在隐式开放。首批声明为 `maxTurns → CHEERS_MAX_TURNS`。provider 凭据的 `OPENAI_API_KEY` 等映射继续由 provider facts owner 负责，不进入普通字段环境表。

优先级保持“项目/用户文件 → 显式输入次序 → 环境 → 运行覆盖”。环境值按字段 schema 类型解析：整数/数字取 `Number`，布尔只接受 `true`/`false`，其余保持文本。空字符串或全空白等同未设置，不产生诊断。

缺失之外的非法值（非数字、非整数、小于下界、超过 `Number.MAX_SAFE_INTEGER`）与文件非法值同样处理：记录 `Config environment <field>: invalid-value`，诊断不含原始值，并使本次 publication 拒绝，保留此前接受的配置。来源树记录 `environment`，不记录值。新增字段必须同时声明 `sources` 包含 `environment`，否则字段工厂在启动时拒绝该声明。
