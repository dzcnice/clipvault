# ClipVault 3.3.0

个人本地版正确性、性能与像素壳收口。

## 下载

[`clipvault-3.3.0-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.3.0/clipvault-3.3.0-setup.exe)

## 亮点

- 密钥拦截默认名只保留「标签 · 日期」，不再把 `sk-` 片段写进凭证名
- 概览 / 健康 / 片段 / 凭证详情统一像素壳；健康全 0 时显示「箱子很干净」
- 开发态更新按钮显示「开发版」，打包版才检查 GitHub `latest.yml`
- 剪贴板列表不再下发整图 DataURL；凭证列表默认不带明文
- 片段复制走主进程 `writeText`，展开 `{date}` 等变量且不回写入历史
- 字体本地化，不再请求 Google Fonts CDN

## 说明

- 未代码签名：Windows 可能提示 SmartScreen；应用内更新仍校验 sha512
- 覆盖安装保留 `%APPDATA%\clipvault` 用户库
- 通道：stable（`latest.yml`）
- 已存在的旧凭证名不会自动改写
