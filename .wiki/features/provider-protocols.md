---
title: "原生请求协议与回放"
category: article
created: 2026-10-19
updated: 2026-10-19
tags: [provider, protocol, replay]
summary: "现有端点注册表中的 Responses 请求、终态、工具与加密回放合同；公开 API 与账户服务能力分别验证。"
---

# 原生请求协议与回放

`openai-responses` 在现有 `provider/endpoints/` 注册表中提供公开 Responses API。显式目录 endpoint 选择该协议，地址追加 `/responses`；API key 的原默认 Chat Completions 保留。普通 turn 使用流式，辅助请求使用 JSON，均设置 `store:false` 并提交本地完整历史。现有 request attempt、权限和执行边界继续拥有发送、计量与工具执行。

函数声明使用平铺 schema，显式 `strict:false` 保留现有可选参数语义，不让协议自动改写工具合同。`function_call` 和 `function_call_output` 使用原生 `call_id`。成功输出中的工具参数必须是完整 JSON 对象；截断、拒绝、失败及未知流终态不产生可执行调用。公开 `max_output_tokens` 包括推理，返回的 `output_tokens` 已含推理，计量不能再相加。该适配器没有未经测量的 `requestBound`，需要可信完整输入上界的累计预算仍拒绝未证明请求。

SSE 处理分块 UTF-8、CR/LF、多行 data、注释及最后未分隔事件，单帧限制 8 MiB。只有明确终态接纳完成；已完成内容、阶段和工具参数不能被后续事件替换。已存在的加密材料保持原值，终态可补回 item done 未提供的材料。失败保留已显示文字和身份匹配的 usage，外来响应身份不产生本请求计量。完成或消费者退出均取消并释放 reader。

完整有序 output 保存到版本化 opaque reasoning signature，沿原消息、transcript 和 resume 路径保留，允许没有可见 reasoning text。回放前校验协议形状、原消息文字和工具语义、选定 provider/model，以及捕获 endpoint/address/实际凭据代次的脱敏 binding。服务端 canonical model 名称只是 metadata，不替代请求 alias 身份。变更地址、账号、代次或消息以及旧 transcript 缺 binding 时，以公开文字/工具重建，丢弃 opaque 回放；当前策略保守地在续期后也重建，尚不承诺加密推理跨续期连续性。

官方合同来源：[Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)、[function calling](https://developers.openai.com/api/docs/guides/function-calling)、[reasoning](https://developers.openai.com/api/docs/guides/reasoning)。账户服务虽使用 Responses wire family，但其地址、stream-only、输出上限、缓存刷新和 OAuth entitlement 必须独立声明及验证。**公开适配器不代表 ChatGPT 账户、Google scope/原生协议、subscription 身份或续期已经完成。**
