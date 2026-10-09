---
title: "扩展源协议与独立授权"
category: specification
created: 2026-10-09
updated: 2026-10-09
tags: [extensions, registry, permissions]
summary: "版本化签名源、固定归档和安装/启用/能力/执行的独立决定；验收状态以 Phase 19 为准。"
---

# 扩展源协议与独立授权

本协议允许部署自己的 HTTPS 扩展源。当前实施与验收状态见 [Phase 19 W11](phase-19-decisions.md)；协议说明本身不代表实现验收完成。客户端不会因为登记来源、列出插件或重启而自动查询、下载或执行包。

## 源协议

选定基址为 `https://registry.example/extensions` 时，客户端查询下列路径；每个请求保持所选 origin 和基址路径，拒绝重定向。HTTP 仅接受显式选择的 loopback 来源。源无需共享产品或模型凭据。

| 操作 | 请求 | 已签名 payload |
|---|---|---|
| 搜索 | `GET <base>/v1/search?q=<query>&limit=20[&cursor=<cursor>]` | `{"protocol":"extension-registry/v1","packages":[{"name":"fixture-kit","description":"Example","versions":["1.0.0"]}],"nextCursor":null}` |
| 详情 | `GET <base>/v1/packages/<encoded-name>` | `{"protocol":"extension-registry/v1","name":"fixture-kit","versions":[{"manifest":{},"digest":"<archive-sha256>","url":"<base>/archives/fixture-kit-1.0.0.tar.gz"}]}` |

`manifest` 的完整形状见下一节。JSON 响应的 envelope 为 `{"payload":<object>,"keyId":"publisher-key","signature":"<base64>"}`。签名输入是 payload 的紧凑 UTF-8 JSON：对象键按递归字典序排列，数组顺序保留，字符串与原始值按 JSON 编码；Ed25519 签名后用 base64 编码。源协议响应限制 512 KiB、每页 20 包、每包 32 个固定版本、请求 15 秒；游标不透明且有界，重复游标拒绝。

信任锚由用户单独取得并明确选择 PEM SPKI Ed25519 公钥。客户端显示 SHA256 DER SPKI 指纹与来源，包自带公钥不能授予信任。签名确认所选发布者，压缩包 SHA256 只确认字节完整性；两者均不代表代码已经审查或获准执行。

## 包清单

包为 gzip 压缩 tar，根目录包含 `extension.json`。其内容与签名详情中的清单规范化后必须完全一致；四个能力数组必须存在，未使用时填 `[]`，未知清单字段拒绝。

```json
{
  "schema": 1,
  "name": "fixture-kit",
  "version": "1.0.0",
  "permissions": {"workspace": "read", "network": "none"},
  "skills": [{"path": "skills/fixture-skill/SKILL.md"}],
  "scripts": [{"name": "probe", "path": "scripts/probe.sh"}],
  "commands": [{"name": "fixture-echo", "aliases": ["fixture-alias"], "description": "Print a source", "script": "probe"}],
  "tools": [{"name": "fixture_echo", "description": "Print a source", "script": "probe"}]
}
```

名称使用小写字母开头的字母、数字、`_`、`-`；版本必须为精确的三段版本，可含 prerelease/build 后缀，范围或 `latest` 不接受。可选 `description` 有界。技能和 `.sh` 脚本路径为普通相对路径；命令和工具只能关联本清单中的脚本。每类至多 32 项，命令至多 8 个 aliases，内置命令、工具和本地技能优先。

客户端先检查压缩包 digest，再解析并向私有 stage 提取。压缩包至多 8 MiB、解压至多 32 MiB、膨胀比 100、单文件 4 MiB、entry 总量 512、归档 metadata 16 KiB；路径穿越、links、设备、重复/大小写冲突、特权模式、畸形或截断归档拒绝。完整文件/目录 inventory 与存储身份用于后续操作，未知文件和用户改动阻止破坏性生命周期。当前版本加至多三个旧版本保留，达到保留上限拒绝继续更新。

## 操作与授权

```text
/marketplace add local https://registry.example/extensions
/marketplace trust local publisher-key /absolute/path/publisher.pem
/marketplace search local fixture
/marketplace details local fixture-kit
/plugin install local:fixture-kit@1.0.0
/plugin enable fixture-kit
/plugin grant fixture-kit prompt
/plugin grant fixture-kit script:probe
/plugin run fixture-kit probe argument
/plugin grant fixture-kit command:fixture-echo
/plugin grant fixture-kit tool:fixture_echo
```

源/信任/安装管理使用普通 `extension_manage` 审批，启用/授予/撤销使用 `extension_grant`，直接脚本与动态命令每次执行使用 `extension_run`；模型工具以 `ext_fixture_kit_fixture_echo` 进入普通工具审批。执行仍评估 bash policy、Plan/deny 与当前 session/workspace 权限。启用不会附送 prompt/script/command/tool 授权；命令和模型工具还分别需要关联的 script grant。prompt 只是指令文本。安装、更新与回退都清除启用和旧 grants，权限扩大需重新决定。

`/plugin list|details` 查询实际安装；`update <name> <source>:<name>@<version>`、`rollback <name> <version>`、`uninstall <name>` 各自经过预览和审批。`disable`、`revoke`、`reload`、`cancel` 会进入原运行时的注销/取消路径；`/reload-plugins` 复用 reload。旧 `/plugin add` 和 `migrate` 仅保留 unresolved 注册，旧 enabled/resolved 字段不产生新能力。

`effect` 描述实际已发生的文件或注册变化，`durability` 单独描述持久化确认；写后保存/清理失败保留 unknown，不自动重放，也不承诺多个文件的崩溃原子性。卸载只处理完整已拥有的版本，不删除未知包内容或独立用户数据。存储身份变化需要重新审查，不能只凭相同字节确认目录所有权。

## 执行范围

脚本只通过原 ExecutionService 执行 `/bin/sh <absolute-script> ...argv`，当前需要 Linux bubblewrap 与强制 PID namespace，缺失时零执行。包、源和状态只读；清单 `workspace:read` 为工作区只读，`write` 仍需 session 写根权限；固定 PATH、隔离 HOME/USERPROFILE/TMPDIR，不继承父进程凭据。网络不可用，未能强制执行的 file deny 或更宽 sandbox grants 会导致拒绝。

原生调用限时 30 秒、捕获输出至多 256 KiB，显示脱敏输出和原生 receipt；取消/排空有界，清理未知时封锁继续执行。共享系统读取根 `/usr`、`/bin`、`/lib`、`/lib64`、`/etc`、`/opt` 仍可见，因此此沙箱不保证隐藏全部主机文件。非 Linux、真实公共源信任质量与真实模型质量需要分别记录实际证据。
