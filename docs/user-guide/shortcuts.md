# 快捷键参考

![快捷键总览](placeholder.png)

## 目录

- [全局快捷键](#全局快捷键)
- [主窗口](#主窗口)
- [HUD 窗口](#hud-窗口)
- [命令面板](#命令面板)
- [自定义](#自定义)

---

## 全局快捷键

即使 ClipVault 在后台或最小化状态下依然有效。

| 组合键 | 动作 |
|--------|------|
| `Ctrl+Space` | 显示 / 隐藏主窗口 |
| `Alt+Space` | 召唤 HUD（快速粘贴 / 搜索 / AI 调用） |
| `Ctrl+Shift+F` | 显示主窗口并聚焦搜索框 |
| `Ctrl+Shift+N` | 新建凭证 |
| `Ctrl+Shift+P` | 粘贴最近一条剪贴板项 |

> macOS 将 `Ctrl` 替换为 `Cmd`。

![全局快捷键示意](placeholder.png)

---

## 主窗口

### 导航

| 快捷键 | 页面 |
|--------|------|
| `Ctrl+1` | Dashboard |
| `Ctrl+2` | 凭证 |
| `Ctrl+3` | 剪贴板 |
| `Ctrl+4` | 片段 |
| `Ctrl+5` | 团队 |
| `Ctrl+,` | 设置 |

### 操作

| 快捷键 | 动作 |
|--------|------|
| `Enter` | 复制选中项 |
| `Space` | 预览选中项 |
| `Delete` | 删除选中项（有确认对话） |
| `Ctrl+Shift+B` | 置顶 / 取消置顶 |
| `Ctrl+E` | 编辑凭证 |
| `Ctrl+D` | 复制并清空计时器（30s 自动清空） |

---

## HUD 窗口

HUD 是一个毛玻璃浮层，召唤后自动聚焦输入框。

| 快捷键 | 动作 |
|--------|------|
| `Alt+Space` | 切换显示 |
| `Esc` | 关闭 |
| `Tab` | 在「剪贴板 / 凭证 / AI」标签间切换 |
| `Enter` | 粘贴首条结果到上一个焦点窗口 |
| `Ctrl+Enter` | 复制但不粘贴 |

![HUD 示意](placeholder.png)

---

## 命令面板

按 `Ctrl+K` 或 `Ctrl+Shift+P` 唤起。

- 模糊匹配所有动作（新建 / 导入 / 导出 / 锁定 / 切换主题 …）
- 支持命令前缀：`>` 执行命令，`#` 搜标签，`@` 搜凭证

---

## 自定义

在「设置 → 快捷键」中：

- 点击任一快捷键后按下新组合即可重新绑定
- 冲突会用红色提示
- 点击「重置为默认」可一键恢复

配置持久化在 `%APPDATA%/clipvault/shortcuts.json`（Windows）或 `~/.config/clipvault/shortcuts.json`（Linux/macOS）。

![快捷键设置页](placeholder.png)

---

**字数：** 约 500 字
