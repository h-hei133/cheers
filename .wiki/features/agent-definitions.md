# 代理定义与配置

`/agents` 管理原生子代理角色；普通模型 `task` 调用消费同一目录。角色文字不授执行权限，子代理沿用父会话的权限、工具交集、审批、预算和请求账目。

## 命令

```text
/agents [list|discover]
/agents show <name>
/agents create <user|project> <name> <markdown-file>
/agents import <user|project> <name> <markdown-file>
/agents edit <user|project> <name> <markdown-file>
/agents delete <user|project> <name>
/agents enable|disable <user|project> <name>
/agents model <user|project> <name> <target|inherit>
/agents effort <user|project> <name> <low|medium|high|auto|inherit>
/agents export <name> <workspace-path>
```

`import` 与 `create` 只创建当前作用域尚不存在的定义；`edit` 只替换明确作用域的既有定义。启停、模型和 effort 修改在该作用域没有覆盖时，复制当前有效角色为可写覆盖；内置定义保持只读。删除覆盖后，下层定义重新可见。模型 target 接受连接/模型、provider/模型或当前 provider 下的模型 ID。

所有修改和导出经过普通 `apply_patch` 文件计划与审批。拒绝、审批等待和保存成功分开；保存角色不启动子任务，也不批准角色未来的写操作。源 Markdown 遵守来源读取策略，审批后复查精确字节和文件身份。目标及祖先身份受共享文件提交器保护；在可能已发生写入但同步或后续核验失败时显示 `unverified`，保留实际发布证据。

## 来源与字段

发现顺序为内置、用户目录、可信项目目录；后者覆盖前者。用户目录使用当前数据目录的 `agents/` 并保留既有兼容路径；项目目录为 `.agents/agents/` 与 `.agents/`。名称大小写不影响查找。`list` 展示有效来源、启停、模型、effort、被覆盖项数量和诊断，`show` 展示有效内容及被覆盖来源。工作区不可信时不读取项目角色。

```markdown
---
name: reviewer
description: Review a bounded change
tools: [read, grep, glob]
disallowedTools: [write, edit]
permissionMode: plan
maxTurns: 3
model: openai/gpt-5.1-mini
effort: high
enabled: true
---
Inspect the supplied files and report concrete findings.
```

支持 `name`、`description`、`tools`、`disallowedTools`、`permissionMode`、`maxTurns`、`model`、`effort`、`enabled`、`isolation` 和 `memory`。新发布严格检查字段与值；既有发现允许合法未知扩展元数据。单定义最多 512 KiB，元数据最多 16 KiB，名称最多 64 字符，工具列表最多 64 项，`maxTurns` 为 1–1000。递归发现最多六层、512 文件及 8 MiB，遇到无法确认的来源或限额会保留诊断并拒绝依赖该不完整发现的任务。

禁用或无效的已知定义不退回动态角色。父 read-deny 同样保护角色 prompt；用户角色只有明确的原生配置来源例外，不向普通读取工具添加外部工作区权限。文件和路径不能经符号链接替换到别处。

## 实际请求与停用

普通 `task` 在审批前绑定角色身份，在子请求发送、子工具执行及返回结果时复查。角色模型使用现有精确目标解析与 provider 请求路径；不可用目标明确失败，不回退主模型。effort 只影响该子请求；没有角色模型时，effort 仍作用于继承的实际模型。`inherit` 去掉角色覆盖，`auto` 显式交给 provider 决定。已知不支持的 effort 在发送前拒绝，未知能力保持未验证。

修改或停用成功后，后续任务重新发现角色；受影响的活跃角色立即收到取消。完整终端、逐行和实际 pipe 输入都接到同一管理入口；已有审批未完成时不会让新的管理命令抢占回答。收尾最多等待三秒，未排空明确显示未验证；已经发送但缺 usage 的请求仍留在原目标账目，取消不承诺远端计算已终止。外部文件变化也会通过监听、轮询和同步发送/工具检查阻止旧定义继续使用。

实现位于 [子代理 owner](../../packages/ts-shell/src/core/subagents/subagentLoader.ts)、[管理入口](../../packages/ts-shell/src/core/subagents/command.ts)、[普通 task](../../packages/ts-shell/src/core/tools/taskTool.ts) 与 [实际委派请求](../../packages/ts-shell/src/cli/provider/step.ts)。运行任务总览、后台任务和编排属于后续 FLOW 范围，验收与交付事实见 [Phase 19](phase-19-decisions.md)。
