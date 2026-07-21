# ClipVault 3.1.2

侧栏更新按钮 + 修复未签名包应用内更新失败。

## 下载

[`clipvault-3.1.2-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.1.2/clipvault-3.1.2-setup.exe)

## 修复

应用内更新下载 3.1.1 时若出现：

> New version is not signed by the application owner / not digitally signed

这是 **Windows 对未签名安装包的校验**。3.1.2 在无代码签名证书时会跳过该校验（仍校验 sha512）。

**若你仍在 3.1.0 / 3.1.1：** 请先 **手动安装本页 setup 一次**，之后侧栏「检查更新」可正常自动升级后续版本。

## 新功能

- 侧栏底部小按钮：自动显示更新状态，点击检查 / 下载 / 重启安装

## 通道

请使用 **stable**（对应 `latest.yml`）。`beta` 仅用于预发布通道。
