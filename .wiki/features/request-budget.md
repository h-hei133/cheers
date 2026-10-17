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
{ provider, model, endpoint, schemaDigest, systemDigest }
```

`schemaDigest` 是实际发送的工具声明摘要，`systemDigest` 是实际组装的 system 文本摘要。`measuredPromptContext` 在 provider/model 不同，或调用方提供的 endpoint/schema/system 摘要与记录不同时返回 `undefined`，不使用旧数字。`invalidatePromptMeasurement` 在模型切换时清除计量但保留请求证据；压缩、undo、会话导航继续走 `markContextUnknown`。

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
