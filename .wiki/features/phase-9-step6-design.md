---
title: "Phase 9 施工记录：第 6 步 —— MCP 诚实化收尾"
category: article
sources: [phase-9-decisions, ref-mcp-primitives-2026-09-25]
created: 2026-09-25
tags: [features, phase-9, execution, mcp]
summary: "Phase 9 第 6 步施工（扩展路径 2 收尾）。第 1 步已修掉最关键的一条（非 stdio 传输报告假成功）。本步处理剩余两条如实性缺陷：`resources`/`prompts` 只有 mock 且**无生产消费者**，以及 stdio 封包是自有形状而非标准协议。决定：**不实现** resources/prompts（无需求证据，且我方无对应执行面），而是**让类型与文档如实说明只支持 tools**；并把 stdio 封包的非标准性写进代码注释与类型，避免后来者以为能接第三方服务器。"
confidence: high
---

# Phase 9 第 6 步施工

> **第 1 步已完成的部分**（不重复）：非 stdio 传输的 `invokeTool` 不再返回假成功、
> `connect` 不再把未实现传输报告为 `connected`。本步处理余下两条。

## 1. 复核：三条如实性缺陷的现状

| # | 缺陷 | 第 1 步后状态 | 本步处置 |
|---|---|---|---|
| N1 | 非 stdio 传输报告假成功 | **已修** | — |
| N2 | `resources`/`prompts` 只有 mock | 仍存在 | **本步** |
| N3 | stdio 封包是自有形状 | 仍存在 | **本步** |

## 2. N2：resources / prompts 的实测现状

```
client.ts:117  listTools     → 非 stdio 时返回 config.mockTools
client.ts:125  listResources → 返回 config.mockResources ?? []
client.ts:129  listPrompts   → 返回 config.mockPrompts ?? []
```

**关键实测**：
- 三个 `mock*` 字段**只被测试使用**（`gateway.test.ts`），即**测试夹具泄进了生产配置类型**；
- `listResources`/`listPrompts` **没有 stdio action**——即使连上真实服务器也取不到东西；
- `gateway.ts:139-140` 把结果放进快照的 `resources`/`prompts`，但**三个快照消费者
  （`cliMcpModule`、`mcpControlCliSurface`、`picker/servers`）都不读这两个字段**——
  它们被计算出来然后丢弃。

**参考对照**：三个 MCP 原语（tools/resources/prompts）里，**只有 tools 在参考实现与我方有真实执行面**。

### 决定

| # | 决定 | 依据 |
|---|---|---|
| **M1** | **不实现** resources/prompts | 无需求证据；且我方**没有消费它们的执行面**（模型不能引用 resource、`/` 命令不能插入 prompt）。实现了也是算出来没人读 |
| **M2** | **让类型如实**：`listResources`/`listPrompts` 的返回值语义改为「**本构建不提供**」，而不是「空的资源列表」 | 「空列表」与「不支持」是两件事。前者让调用者以为服务器没有资源，后者告诉它这个构建取不到 |
| **M3** | **`mock*` 字段移出生产配置类型** | 实测它们**只被测试使用**。测试夹具留在生产类型里，会让读者以为配置可以声明 mock 资源 |
| **M4** | 快照**不再计算** resources/prompts | 算了没人读。`gateway.ts:139-140` 两次 `await` 换取两个被丢弃的值 |

**M3 的处置方式**：不改测试的意图，而是让夹具走**测试自己的类型**，生产类型只保留真实可配置的字段。

## 3. N3：stdio 封包的非标准性

`client.ts` 用 `{action: "list-tools"}` / `{action: "invoke-tool"}` 自有信封，
而**不是 JSON-RPC 2.0** 的 `tools/list` / `tools/call`。

**实测影响**：**无法接任何第三方 MCP 服务器**。这是「MCP **形状**」而非「MCP **协议**」。

### 决定

| # | 决定 | 依据 |
|---|---|---|
| **M5** | **在类型与注释里写明这不是 MCP 协议** | 代码自述是唯一会跟到未来的地方。不写，后来者会以为配一个第三方服务器就能用 |
| **M6** | **不改成标准 JSON-RPC** | 那是「实现一个真 MCP 客户端」，属新能力而非修补；且**我方唯一的服务器是自带 fixture**，改成标准形状没有可验证的对象。**记入未做** |

**M5 的措辞要点**：说清「这是本构建与自带服务器之间的自有信封」，
以及「接第三方服务器需要按 JSON-RPC 2.0 重写传输层」——即**给出改造方向**，而不只是否定。

## 4. 文件

| 文件 | 改动 |
|---|---|
| `core/mcp/types.ts` | 移除 `mock*` 三字段；`McpClientSnapshot` 去掉 `resources`/`prompts` |
| `core/mcp/client.ts` | `listResources`/`listPrompts` 语义改为「不提供」；stdio 信封加非标准说明 |
| `core/mcp/gateway.ts` | 不再计算 resources/prompts |
| `core/mcp/gateway.test.ts` | 夹具改用测试自有类型 |
| `core/mcp/types.test.ts`（新） | 断言快照**不含** resources/prompts（即「不宣称支持」） |

## 5. 验证方式

| 项 | 验证 |
|---|---|
| 不宣称支持 | 快照类型与运行时都**没有** resources/prompts 字段 |
| 工具仍可用 | 既有 tools 路径不受影响（回归） |
| mock 字段已出生产类型 | `grep mockTools src --include='*.ts' \| grep -v test` → 空 |
| 实机 | `/mcp status` 仍正常，且不暗示支持 resources/prompts |

## 5.5 实现结果（2026-09-25）

### 改动

| 文件 | 改动 |
|---|---|
| `core/mcp/types.ts` | **删** `mockResources`/`mockPrompts`；**删** `McpResourceDescriptor`/`McpPromptDescriptor` 两个类型；快照**去掉** `resources`/`prompts` |
| `core/mcp/client.ts` | **删** `listResources`/`listPrompts` 两个方法；类文档纠正（原写「full JSON-RPC lifecycle」**不实**）并写明信封非标准 |
| `core/mcp/gateway.ts` | 不再计算 resources/prompts（两次 `await` 换取两个被丢弃的值） |
| `core/mcp/surface.test.ts`（新） | 断言快照**不含** resources/prompts |

### 关于 `mockTools` 的保留

`mockTools` **保留**，但加注说明它是**测试专用**。理由：实测它是三个 mock 字段里**唯一还有使用者**的
（`gateway.test.ts` 用它描述一个不启动进程的服务器），删掉会迫使测试去 spawn 真进程。
保留一个诚实的、有说明的测试钩子，比删掉后让测试变慢更合适。而另外两个**零使用**，
「留着一个没人用、还宣称支持的字段」正是第 3 步删掉 10 个死令牌时处理过的问题。

### 实机（构建产物）

```
snapshot keys  : clients, tools
claims resources: false
claims prompts  : false
http transport : failed | executable: false
invokeTool     : threw
```
即：**不宣称支持取不到的东西**，且第 1 步的传输诚实化仍然生效。

### 反向验证

把 `resources: {}` / `prompts: {}` 加回快照 → `surface.test.ts` **失败**。

### 关于类文档的一处不实

原类文档写「**full JSON-RPC lifecycle**」——**实测不成立**：信封是 `{action:"list-tools"}` 自有形状，
不是 JSON-RPC 2.0。已改为如实描述：说清它**能**做什么（自带服务器、重连、超时、EPIPE 韧性）、
**不能**做什么（接第三方服务器），以及**改造方向**（按 JSON-RPC 2.0 重写传输层）。

## 6. 本步不做（如实记录）

- **不实现 MCP resources/prompts**（M1：无执行面、无需求）。
- **不把 stdio 封包改成 JSON-RPC 2.0**（M6：那是实现真 MCP 客户端，属新能力；
  且无第三方服务器可验证）。
- 不实现 http/ws/sdk 传输（第 1 步已定为「明确失败」，非「实现」）。
