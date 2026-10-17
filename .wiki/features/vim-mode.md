# 输入区模态编辑

`vimMode` 是普通配置字段（默认 `false`），按 `safe` 策略即时生效。开启后输入区从 Insert 开始，Esc 进入 Normal；模式键只在 composer 有焦点时被路由，overlay、pager、权限确认先于 keymap。

## 状态机

`editor/modal/state.ts` 是纯函数：读取 `(state, key, text, cursor)`，返回意图（edit/cursor/mode/undo/redo/none），不持有缓冲区。Insert 之外的所有键都由状态机消费，所以 Normal/Visual 的 Enter 不会提交，打印字符不会进入草稿。

- 模式：Insert、Normal、Visual、Visual-Line、Replace。
- 计数上限 9999；operator `d/y/c`、`dd/yy/cc`、`iw/aw`、`f/F/t/T`、`gg/G`、`0/$`、`w/b/e`、`r<char>`、`R`、`S`、`x/X/D/C`、`p/P`、`u`、Ctrl+R。
- 移动按字素簇与 Unicode 单词边界，CJK/emoji ZWJ 不会被切开。
- yank 寄存器在状态机内，`p` 通过 `editor.replace` 写回；撤销仍由编辑器唯一拥有，一次操作一步 undo。
- 编辑意图携带原始偏移；keymap 在应用前把光标夹到替换范围内，再以当前 snapshot 绑定 `DraftEdit`，过期或切在字素中间的编辑会被拒绝。
- 括号粘贴走宿主的 `onPaste` 通道，直接 `editor.insert`，不经过模式解析：Normal 中粘贴 `dd` 插入文本而不是删除。

## 未覆盖

- IME 组合态未在真实输入法下验收；grapheme 断言只覆盖单元测试。
- Visual 选区目前是状态机内部范围，未接入鼠标 shading/拖选复制；yank/paste 是源文本通道。
- 长粘贴 placeholder、外部编辑器返回后的模式重置沿用既有宿主路径，没有新增专门验收。
