# ClipVault 3.2.2

严格排查后的稳定性与安全修复版。

## 下载

[`clipvault-3.2.2-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.2.2/clipvault-3.2.2-setup.exe)

## 修复

- 来源应用 `sourceApp` 探测（PowerShell `$PID` 冲突）
- TOTP 列表不再经 IPC 下发明文 secret
- Windows 生物识别确认改为 DPAPI 会话校验（非假通过）
- 损坏凭证禁止复制空串
- 排除应用全等/`前缀*` 匹配
- 复制并粘贴 UX、片段热键校验、复制错误提示

## 说明

- 未代码签名；应用内更新仍校验 sha512
- 覆盖安装保留用户库 `%APPDATA%\clipvault`
- 通道：stable（`latest.yml`）
