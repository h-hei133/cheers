---
title: "请求计量与预算"
category: article
created: 2026-10-17
updated: 2026-10-17
tags: [context, budget, phase-20]
summary: "usage 只对产生它的模型/端点/schema/system 有效；完整请求按 P+O+H<=W 与独立输入上限准入，未知上限保留远端拒绝。"
---

# 请求计量与预算

## 1. 计量身份

最近一次请求的 prompt tokens 只在同一身份下有效。telemetry 记录：

```ts
{ provider, model, endpoint, endpointId, schemaDigest, systemDigest, historyDigest }
```

`endpointId` 是实际目标地址的脱敏摘要；`schemaDigest` 是实际发送的工具声明摘要，`systemDigest` 是实际组装的 system 文本摘要，`historyDigest` 是有序、已选择消息内容的摘要。`measuredPromptContext` 在 provider/model、协议、目标地址、schema、system 或 history 身份不同时返回 `undefined`，不使用旧数字；如果记录包含某个可选身份字段而调用方无法提供同一字段，也不把该记录当作当前测量。

`/context` 与状态栏都从同一实时 `promptIdentity` 传递 schema/system/history，并从当前生效的 provider 地址派生 `endpointId`。因此同 provider/model/协议的另一个 relay 不能复用旧测量。压缩查询使用 recorded `promptMessageCount` 从当前 messages 派生前缀 `historyDigest`；只有该前缀及其他请求身份全部匹配时才复用 provider count并追加后续消息估算。`invalidatePromptMeasurement` 在模型切换时清除计量但保留请求证据；undo、会话导航等真值变化继续走 `markContextUnknown`。

`promptMessageCount` 是实际发送的 `messages` 长度。此前保存 `length + 1`，导致下一次测量跳过新 assistant 消息及其 tool-call 参数；现在只追加该请求之后新增的消息。

## 2. 预算

`context/request/budget.ts` 实现协议共享窗口的准入：

```text
P + O + H <= W
```

- `P`：完整请求（measured 前缀 + 之后新增消息的估算）；
- `O`：本次实际输出上限（配置或模型上限）；
- `H`：reserve；
- `W`：配置覆盖或目录窗口。

独立 `inputLimit` 存在时再要求 `P + H <= inputLimit`。等号通过；超出一 token 拒绝。缺少窗口、输出上限或出现非整数时返回 `unknown`，不把估算冒充上界，交由远端拒绝处理。

软阈值 `min(floor(0.9W), W - O - H)` 只用于提醒/触发候选，不改变硬预算。当可用输入低于 90% 窗口时，软阈值等于可用输入，达到它时硬预算已拒绝。

## 3. 发送前检查

step 在构造请求后、发送前检查预算。失败返回带 `Context overflow:` 前缀的失败 step，由现有有界 overflow 救援压缩一次并重试；不会先发出一个必然超窗的请求。未知上限不拦截。

`bytes` 与 `codeUnits` 仍是独立测量量，不换算成 token；token 估算只用于软触发与无实测时的回退。

## 4. 边界

- 未实现 TOOL-01 的动态 schema 加载预算；schema 变化通过下一次请求身份与 `schemaDigest` 失效。
- 未改变 provider 的实际拒绝与重试分类。
- 已验证：身份不匹配、无效计量、等号/超界、输出与 reserve 边界、独立输入上限、软阈值钳制、measured 前缀追加；未运行真实 provider。

## 5. 四态报告

`/context` 与状态栏只使用一个分类：

| 状态 | 条件 | 报告 |
|---|---|---|
| `measured` | 存在与当前 provider/model/endpoint/endpointId/schema/system/history 匹配的测量 | 显示 tokens 与窗口占比 |
| `stale` | 有旧测量，但身份不匹配或无法证明 | 明确说明属于另一模型/端点/schema/history，不显示为当前值 |
| `estimated` | 没有测量 | 给出当前工具 schema 的首请求下限估算，并说明会话 token 在发送前不估算 |
| `unknown` | 无测量且无可信估算输入 | 只报告未知 |

状态栏 `contextUsed` 只在 measured 时出现；旧的无身份记录在模型切换清空之前仍可用。窗口、reserve 与模型解析来自同一次 configuration publication，报告不会为了数字去探测 provider 或读取网络。

## 6. 边界

- 首请求估算只覆盖当前工具 schema；system 文本与用户输入在发送前不作为 token 上界。
- 未改变 `/context` 的工具池加载路径（它可能刷新扩展/MCP，但不发起 provider 请求）。
- 已验证：measured/stale/unknown 事实、首请求估算行、状态栏不回退旧值、legacy 记录在失效前可用，以及 history/relay 身份不匹配；未运行真实 provider。
