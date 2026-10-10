# 实时语音与本地终端录制

W14 的媒体领域分别持有语音与终端记录；CLI 只注入当前会话、普通批准、请求账本与终端输出。语音和录制均为显式本地命令，没有模型工具可静默启用麦克风或录制。

## 语音

`/live start [--seconds 120] [--capture-device default] [--playback-device default]` 经普通执行批准后建立连接，收到 `session.started` 才打开麦克风。`/live mute` 停止本地捕获；`listen` 恢复原批准寿命内的捕获；`interrupt` 中断本地输入/播放并关闭语音；`stop` 等待 final usage 与原生设备清理。连接继续存活期间，mute 不会停止远端秒数计费。取消、目标/协作/配置/会话或权限变化撤销同一寿命；不存在自动重连、音频重放或重启接管。再次开始需要新的显式批准。

当前协议是公开 **OpenAI Live API**，使用 API key、`gpt-live-1`、`marin`、client delegation 与 PCM16 little-endian 单声道 24kHz。固定模型/声音，禁止自动切换协议或私有账户协议；compatible provider 需明确提供实现该协议的 HTTPS base URL，HTTP 仅允许 loopback 合成端点。WebSocket 禁止重定向及压缩，不发凭据到另一端点。依据实际取得的官方 [WebSocket](https://developers.openai.com/api/docs/guides/realtime-websocket)、[会话](https://developers.openai.com/api/docs/guides/live-conversations)、[委派](https://developers.openai.com/api/docs/guides/live-delegation)页面；不能混用旧 Realtime 的 `session.update`、`input_audio_buffer.append` 或 Responses 事件。

设备适配当前只支持 Linux ALSA 的成熟 `arecord`/`aplay`，在批准前解析两个实际程序/参数并绑定 cwd；预览明确此双设备执行寿命，启动与每次设备重开前复验程序身份、参数、cwd 和普通 bash 拒绝规则。调用同一 ExecutionService，复用进程组取消与清理。缺程序、缺设备、设备 busy、普通失败与清理 unknown 分开显示；native stderr/provider error body 不回显。采用半双工抑制：播放排队及估算播放尾部期间，丢弃捕获的麦克风语音并发送同长度 PCM 静音，保持输入时线；这会丢弃重叠语音。不是声学回声消除，也不以管道已写入证明用户实际听见。显式 interrupt 关闭整段语音，避免无法定位的旧音频混入下一段。硬件驱动/真实声音与其他平台未验证。

本地墙钟时长 1–1800 秒（默认 120），入/出消息最大 128KiB、transport backlog 256KiB、播放队列 96KiB（2 秒），4096 incoming events。原始音频不写磁盘；会话最多保存 16 段，每段最多 512 个转写片段或 64KiB，总量到限时停止并保留真实状态。journal 使用原会话锁内 CAS，普通输入保存不覆盖媒体记录，media-only 会话也保留。没有隐式清理用户记录；达到留存上限后明确拒绝新段。

Live 转写只有 `event_id/start_ms/end_ms`，没有 provider 的 completed-turn ID。`/live transcript` 保留两个说话者、原空格/重复词与时段，重复 event ID 不重复加入。文字分组不能冒称完整 turn；client delegation 不调用 agent、不执行工具，只返回未执行/未批准的事实。`/live submit <first> <last>` 只接受明确选择的连续 user 片段，经普通 text query 处理，附独立 voice-selection ID、原 voice/session/event/时间身份；内容以转写数据进入提示，不解析成 slash command，也不提升执行权限。

Live 的 usage 是**累计秒数**，不是 tokens。`session.closed` 才证明最终 seconds；仅 socket close、非法/递减 usage 或停止超时都保留 unknown。既有共享请求账本登记每次连接前的准入/dispatch；Live 不能提供可信 token 上界，因此 token cap 启用时在连接与设备发送前拒绝。无 cap 时登记 dispatched，token usage 始终 unknown，不捏造 tokens 或费率；以后设 token cap 不会抹除这段未知历史。voice finalization 与 token budget unknown 是两个不同事实。

## 终端录制

`/record start <destination> --retain keep|discard [--max-bytes 4194304] [--seconds 600]` 必须明确目的地与停止后的保留策略，经普通文件批准后创建 mode600 新文件，不覆盖已有目标。录制实际 stdout/stderr 写入经隐私过滤后的内容、整行完成时刻和 terminal resize；不使用协作事件代替。原 write/callback 原样转发，结束时恢复 observer。范围仅为启用后的应用输出，不包含内核回显、其它终端进程或启用前的屏幕。

录制不观察 stdin。两种 TUI 在编辑输入、回答问题、overlay/pager/search 显示期间排除输出帧，并在绘制前按中性敏感行标记排除提交后的 user transcript 回显/重绘。管道显式 prompt 回显同样排除，fallback readline 关闭 terminal echo 并排除待答问题期间显示；均保留 gap marker；这会漏掉同时发生的其它显示。普通输出保留实际 ANSI，完整行缓冲防止 split writes/着色穿插绕过既有 credential redaction；connect login/key flags 行排除，原始控制 payload 与可见文字各自检查。整行缓冲会合并同流写入，时间取行完成时刻，并可能改变 stdout/stderr 交错顺序；不是逐字节原时序。取消/截断丢弃未完成行且 footer 明确 incomplete，普通 stop 会脱敏后 flush 尾行。默认排除输入和可识别凭据，**不保证识别任意正常输出中的未知秘密**。本地文件不默认上传。

文件是 version2 asciicast 风格 JSONL，附带版本化 session/retention metadata，包含 output/error/resize/marker。记录上限 1KiB–16MiB、1–3600 秒、20000 events、单 event/缓冲行 64KiB；到限显示 truncated。每次 append 核对 workspace、descriptor/path、inode、大小和文件版本；外部替换/编辑不得继续录制或删除。创建及 discard 复用 native workspace publication；export 复用现有 edit operation/receipt/compensation。完整 footer 与 fsync 才报告 stopped/cancelled/truncated；ENOSPC、footer/close/journal 失败或重启遗留显示 unknown。不是跨文件 crash atomicity。

`/record stop` 完成并按 keep/discard 处理；`cancel` 与 Escape 取消同一寿命。discard 仅删除身份/内容仍属于本次录制的文件；失败/截断/未知工件保留供检查。会话切换时撤销，原文件不会包含后续会话输出。`/record status` 来自持久 journal 与实际 live writer，不自动恢复。

`/record play <source> [--speed 1]` 读取有界严格 schema，按实际 recorded timing 以 safe text 回放，resize 是明确的原尺寸 notice。ANSI 的 CSI/OSC/DCS/APC/其它控制、C1 和查询/clipboard sequences 按跨 event 状态解析并排除；不执行原命令，不向终端发控制字符串。取消/会话变化中断等待并停止后续输出。partial 最后一行及缺 footer 仍显示 incomplete，不称正常停止。`/record export <source> <destination>` 独立批准 mode600 新目标的纯文本导出；批准后复验 source digest，原文件保留，不发网络。

## 对照与验证边界

定向参考采取显式媒体 start/stop、单控制器寿命、播放/转写分开及终端 paint/retention 分离。此处用成熟 native device 与公开协议，保留取消/重启真值；没有照搬参考的私有账户协议或依赖另一套协作 renderer。回声选择半双工、转写不推断完成 turn、秒数不伪装 token、录制不授执行权是须可反转检验的关键决定。

新增 `ws@8.22.0`（MIT、Node>=10、registry modified 2026-09-26）与开发类型 `@types/ws@8.18.1`；无新的语言、执行平面、package script 或 auth core 改动。真实设备和真实 Live 访问未运行。

最终 39 TS / 35 production freeze `cabcf157319e7ebcbe0b3c69ec11c8354698773af0c83769739f5cf4363beb63`，没有新增或增长的函数超限，新模块最多16个声明。Node20.3 受影响组合15文件/181项通过，最终设备cwd修复后的媒体17项另通过；TS与单文件构建、import/config/declaration/node-floor、43 scripts通过。四项隔离反转（半双工、选择进入普通提示、提交后输入隐私、安全回放）均产生实际断言失败，原产品源未变。media-only留存单独验证，没有用普通prompt掩盖空会话条件。

Node20.3及单文件程序 × regular/fullscreen/pipe 六条actualCLI exit0，共18个合成模型POST：拒绝零音频发送/零录制文件、真实设备PID清理、明确转写选择和独立write deny、提交后输入重绘排除、resize、导出/回放/discard及重启零接管通过。材料 `.tmp/media/acceptance.json`。独立代码APPROVE、架构WATCH，综合COMMENT；WATCH保留上述时序/输出损失及媒体控制器当前与jobs admission的耦合。完整NormProof exit2/not_proven，完整图超过8192-edge collector容量，阻断unresolved-specifier证据缺失；W16负责修复，不缩图或豁免。commit/push/精确远端CI分别记录，未从合成探针推断真实硬件或Live质量。
