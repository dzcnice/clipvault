# ClipVault v3.1 品牌与图标基线

## 结论

ClipVault v3.1 的品牌核心不是“网络安全平台”，而是一个随手可用的**本地像素保险库**：
把剪贴板历史、常用片段和个人凭证统一收进本机，免登录、打开即用。

新版标志将“叠放的复制记录”和“前置保险库卡片”合成一个符号：

- 后层暖白卡片代表剪贴板历史与片段。
- 前层琥珀金卡片代表本地保险库。
- 中央粗钥匙孔表达受保护的凭证。
- 顶部薄荷绿小标签表达内容已经安全保存。
- 深墨色像素台阶轮廓与当前 UI 的 2-3px 硬边框、像素阴影一致。

## 重新分析依据

当前代码和文档确认的产品范围：

- Electron 37 + React 18 的 Windows 桌面应用。
- 单机个人版，本地优先，不要求账号。
- 剪贴板历史支持文本、图片和 HTML，并提供搜索、置顶与安全清理。
- 本地加密保存 API Key、Token、SSH、数据库和账号密码等凭证。
- 包含常用片段、TOTP、健康检查、审计、导入导出、恢复短语与生物识别。
- v3.0 起已下线团队 P2P、Vera AI、CLI、HTTP、SSH Agent 和分享包能力。

当前运行视觉以 `src/renderer/src/styles/tokens.css` 为准：

| 角色 | 颜色 | 用途 |
| --- | --- | --- |
| 深墨 | `#2B2438` | 主轮廓、文字、像素边框 |
| 琥珀金 | `#C9920A` | 主品牌色、保险库与钥匙感 |
| 亮金 | `#E8B923` | 高光与强调 |
| 纸张暖白 | `#F6F0E4` | 本地档案、卡片与底板 |
| 薄荷绿 | `#2F7D55` | 已保存、健康与成功状态 |

旧图标使用莫兰迪绿粉和柔和 3D 玻璃效果，与当前像素壳不一致；三个正式 PNG
还是同一张无透明通道的浅色图片。它在 16-32px 下轮廓偏软，容易被识别成通用的
锁头或保险箱插画。新版改用粗轮廓、少层级和高明度对比解决这些问题。

## 资产矩阵

| 文件 | 用途 |
| --- | --- |
| `resources/brand/clipvault-logo-v3-source.png` | imagegen 生成并透明化的品牌母版 |
| `resources/logo-app-v3.png` | 1024px 透明 Logo 标志 |
| `src/renderer/src/assets/clipvault-logo-v3.png` | 应用侧栏内嵌 Logo |
| `resources/icon-square-v3.png` | 1024px 透明边缘 App Icon 母版 |
| `resources/icon-v3.png` | 512px 窗口、托盘与通知图标 |
| `resources/icon-v3.ico` | Windows 安装包、桌面快捷方式与可执行文件图标 |

旧版 `logo-app.png`、`icon.png`、`icon-square.png` 和 `icon.ico` 保留，便于回退。

## 最终生图提示词

```text
Use case: logo-brand
Asset type: final standalone brand mark for the ClipVault v3.1 Windows desktop application
Primary request: create one original compact symbol for a local-first personal clipboard history and encrypted credential vault. Fuse stacked copied-record cards with a front vault card into one unmistakable glyph; use a bold negative-space keyhole and a tiny saved-status tab without looking like office stationery.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for local removal
Style/medium: crisp flat vector-like logo with a restrained pixel-modern character; bold clean geometry and large solid shapes
Composition/framing: one centered front-facing glyph only, balanced, with even clear padding
Color palette: deep ink #2b2438, amber #c9920a and #e8b923, warm paper #f6f0e4, tiny mint #2f7d55
Constraints: strong silhouette at 16px and 32px; no text, letters, CV monogram, shield, generic padlock, generic key, multiple concepts, mockup, 3D, gradients, gloss, blur, glow, cast shadow, texture, thin lines, or watermark; do not use #ff00ff in the subject
Avoid: stock password-manager icon, office clipboard clipart, cybersecurity corporate logo, cartoon, toy, glassmorphism, cyberpunk, retro game sprite
```

生成使用本机 `codex-local-imagegen` 技能和 `gpt-image-2`，先在纯洋红背景上生成，
再用 imagegen 技能附带的 `remove_chroma_key.py` 做透明化。未使用需要模型原生透明度的
`gpt-image-1.5` 降级路径。

## 重建与验收

```powershell
npm run assets:icons
npm run typecheck
npm run build
```

`assets:icons` 会从透明品牌母版非破坏性地产出版本化 PNG 和包含
16、24、32、48、64、128、256px 帧的 Windows ICO。验收时同时检查浅色/深色背景、
透明四角、小尺寸轮廓、Electron 构建和安装包配置引用。
