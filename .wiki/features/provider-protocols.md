---
title: "原生请求协议与回放"
category: article
created: 2026-10-19
updated: 2026-10-20
tags: [provider, protocol, replay]
summary: "现有端点注册表中的 Responses 和 Gemini 请求、终态、工具与签名回放合同；公开 API 与账户服务能力分别验证。"
---

# 原生请求协议与回放

`openai-responses` 在现有 `provider/endpoints/` 注册表中提供公开 Responses API。显式目录 endpoint 选择该协议，地址追加 `/responses`；API key 的原默认 Chat Completions 保留。普通 turn 使用流式，辅助请求使用 JSON，均设置 `store:false` 并提交本地完整历史。现有 request attempt、权限和执行边界继续拥有发送、计量与工具执行。

函数声明使用平铺 schema，显式 `strict:false` 保留现有可选参数语义，不让协议自动改写工具合同。`function_call` 和 `function_call_output` 使用原生 `call_id`。成功输出中的工具参数必须是完整 JSON 对象；截断、拒绝、失败及未知流终态不产生可执行调用。公开 `max_output_tokens` 包括推理，返回的 `output_tokens` 已含推理，计量不能再相加。该适配器没有未经测量的 `requestBound`，需要可信完整输入上界的累计预算仍拒绝未证明请求。

SSE 处理分块 UTF-8、CR/LF、多行 data、注释及最后未分隔事件，单帧限制 8 MiB。只有明确终态接纳完成；已完成内容、阶段和工具参数不能被后续事件替换。已存在的加密材料保持原值，终态可补回 item done 未提供的材料。失败保留已显示文字和身份匹配的 usage，外来响应身份不产生本请求计量。完成或消费者退出均取消并释放 reader。

完整有序 output 保存到版本化 opaque reasoning signature，沿原消息、transcript 和 resume 路径保留，允许没有可见 reasoning text。回放前校验协议形状、原消息文字和工具语义、选定 provider/model，以及捕获 endpoint/address/实际凭据代次的脱敏 binding。服务端 canonical model 名称只是 metadata，不替代请求 alias 身份。公开 API 在代次变化后保守重建；账户协议只有经原生登录/续期的精确存储 grant 才保持跨续期回放身份。地址、账号、槽位、profile、消息变更及旧 transcript 缺 binding 时仍重建公开文字/工具。

官方合同来源：[Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses)、[function calling](https://developers.openai.com/api/docs/guides/function-calling)、[reasoning](https://developers.openai.com/api/docs/guides/reasoning)。账户服务虽使用 Responses wire family，但其地址、stream-only、输出上限、缓存刷新和 OAuth entitlement 必须独立声明及验证。**公开适配器不代表 ChatGPT 账户、Google scope/原生协议、subscription 身份或续期已经完成。**

OpenAI 账户的 issuer 固定选择 `https://chatgpt.com/backend-api/codex/responses` 和 `openai-account-responses`，独立于模型目录；存储及 CLI 显式地址不相符即拒绝。API key 保持目录协议选择。登录要求 access token 中精确的 `https://api.openai.com/auth.chatgpt_account_id`，续期必须返回同一账户；subject、organization、其他 namespace 和 ID-token 不能替代。交换已派发而身份缺失/不相符时保持 unknown，不保存或发布新凭据，也不自动重试。同 issuer token 交换和原生生成均拒绝重定向，防止凭据被转发。

原生账户 full turn、委派、agent、摘要、压缩和 `/btw` 都使用 `stream:true`、`store:false` 及非空 instructions。辅助请求也完整消费 SSE 并关闭 reader。账户协议没有通用 models probe、缓存刷新、service tier 或可信 requestBound；配置默认 output cap 让位于 provider，任何显式 `maxOutputTokens` 在派发前拒绝，不能把目录估算上限当作服务端强制上界。预算需要证明的请求仍按原合同拒绝。

账户 decoder 额外接纳 `response.done`；终态缺 output 时只从连续且封口的 `output_item.done` 重建。缺 wire model 使用账户专属 opaque schema，并继续由已捕获的请求 provider/model/binding 校验。created model 若存在则保持并校验，终态不能改名。截断、失败、身份矛盾、稀疏/未封口 output 和非法工具参数不产生执行权限。

新登录保存独立 `loginId`，续期保留它；它本身不是证明。回放 owner 读取现有 lease store，要求 login/rotation grant 的 owner、generation、storage 精确匹配且未准备/派发/未知/消费。恢复已消费前代、原始替换 token/expiry/loginId、复制槽位/账本或替换 profile 目录均不能保留 stable binding。旧配置无原生 grant 时仍使用保守代次 binding。合成 HTTP/TLS、独立进程与 PTY 验证覆盖此合同，不能证明真实账户 entitlement 或远端兼容性；subscription 身份/续期继续开放。

Google 自有 Desktop OAuth 使用公开 Gemini API：issuer 固定 `https://generativelanguage.googleapis.com`，账户 endpoint 为 `google-account-generative-ai`，复用现有 `google-generative-ai` codec。生成分别使用 `:generateContent` JSON 与 `:streamGenerateContent?alt=sse`；models 使用 `/v1beta/models`。Bearer 与登录捕获的 `x-goog-user-project` 同时发送，不借用 API key、ADC 或另一个项目；OAuth、生成和账户 models 都拒绝重定向。旧 compatibility 地址或未知 scope/project 在 HTTP 前拒绝。官方 [OAuth quickstart](https://ai.google.dev/gemini-api/docs/oauth) 允许 cloud-platform；它不证明托管订阅 entitlement。

登录保存实际 granted scopes、可选自有 client secret 和 quota project，proof 同时绑定这些字段与 issuer/client/token。省略响应 scope 继承请求集；续期使用捕获的 secret/scope，不读取后来的环境值。任何规范化 grant 集变化在派发后保留 unknown，零保存/发布/自动重播。既有原生 grant、跨进程 lease 和 `AccountEdit` CAS 保留；项目、secret、scope 或槽位并发修改不能被旧响应覆盖。

共享 Gemini codec 保存有序签名 parts 到既有版本化 opaque signature，并沿 transcript/resume 保留。签名可位于 thought、text、functionCall 或签名单独 part；流内同一文字块增量合并，签名保留原关联，不拼接不同签名。回放校验 provider/model、捕获地址/凭据/项目 binding，以及当前文字、reasoning 和有序调用参数；身份或消息变化则不转发旧签名。缺原生 call id 时内部匹配 id 不写成外来 functionResponse id，后来 fallback 调用复用 id 时重新建立其映射。Google 续期代次变化后保守丢弃旧 opaque 材料，未承诺跨续期连续性。

明确 STOP 且完整合法输出才产生工具或 opaque 回放。error、refusal、length、畸形帧/参数、冲突终态和终态后新增内容均不能取得工具权限；usage-only 尾帧保持计量。opaque 捕获限制 4096 parts / 1 MiB，未知输出形状保守拒绝。合成四格 TLS PTY、实际编译模块及反转验证覆盖这些合同；真实服务兼容性与 entitlement 仍属于原先推迟的真实模型验收。
