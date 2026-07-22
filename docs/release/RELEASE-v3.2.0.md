# ClipVault 3.2.0

个人本地版功能增强：剪贴板可控、TOTP 总览、导出字段、快捷键编辑、片段全局热键、更新诊断等。

## 下载

[`clipvault-3.2.0-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.2.0/clipvault-3.2.0-setup.exe)

## 亮点

- 剪贴板：历史上限 / 排除应用 / 来源应用 / 批量与时间清理 / 暂停监听
- TOTP 总览页（侧栏 + 托盘）
- 凭证：类型筛选、复制用户名/序列复制、复制并粘贴（Windows）
- 导出字段勾选 + 时间范围；通用 CSV 导入
- 设置：快捷键改键与冲突检测；更新自动检查/诊断
- 片段全局热键（Electron accelerator 格式）
- 可选生物识别门禁（复制/导出）

## 说明

- 未代码签名：Windows 可能提示 SmartScreen；应用内更新仍校验 sha512
- 覆盖安装保留 `%APPDATA%\clipvault` 用户库
- 通道：stable（`latest.yml`）
