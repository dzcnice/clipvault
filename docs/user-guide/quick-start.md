# 快速开始

这份指南按当前产品状态说明 ClipVault 的首次使用流程，不再沿用旧版 5 步引导描述。

## 安装

### Windows

下载 `clipvault-x.y.z-setup.exe` 后直接运行。

- 默认会创建开始菜单 / 桌面入口
- 可在设置页里再决定是否开机自启
- 当前正式代码签名仍依赖发布环境中的证书配置

### macOS

下载 `.dmg` 后拖入“应用程序”。

- 当前版本公证流程尚依赖 Apple Developer 证书与账号变量
- 若首次打开遇到 Gatekeeper，请按系统提示允许

### Linux

支持三种分发形式：

- `AppImage`
- `deb`
- `snap`

## 当前 onboarding 流程

首次启动后会自动进入 7 步 onboarding：

1. 欢迎页
   说明 ClipVault 的本地优先、安全、团队和 Vera 能力。
2. 设置主密码
   至少 8 位，并通过强度检查。完成后即可进入下一步。
3. 配置 Vera
   当前以 DeepSeek 为正式在线 provider；本地 fallback 仍为预留入口，可稍后在设置页继续配置。
4. 快捷键与 HUD
   介绍 `Alt+Space`、`Ctrl+K` 等常用入口。
5. P2P 局域网前置说明
   说明防火墙、同网段与端口要求。单机使用可跳过。
6. 加入 ClipVault 网络
   可选接入 overlay 网络。未部署时可跳过。
7. 导入现有凭证
   支持 1Password、Bitwarden、Chrome/Edge、LastPass；也可以稍后在设置页进入导入导出。

## 主密码与恢复短语

### 主密码

主密码用于解锁本地加密存储。建议：

- 使用 12 位以上长度
- 混合大小写、数字和符号
- 不与任何在线账户复用

### 恢复短语

主密码设置完成后，请及时保存恢复短语。

- 推荐抄写到离线介质
- 不要截图或存放到联网笔记工具
- 至少保留一份异地备份

## 初次使用后的建议

完成 onboarding 后，建议按这个顺序继续：

1. 进入 `Settings`
2. 在 `Developer Tools` 中按需开启 HTTP API / CLI Token
3. 在 `Security` 区域确认生物识别与恢复短语设置
4. 如需团队协作，再进入 `Team` / `Share Packages` / `File Transfer`

## 当前版本说明

- Vera 当前正式支持 DeepSeek
- 本地 fallback UI 仍为禁用状态
- Windows 签名、macOS 公证、GitHub 正式发布需要外部证书与凭据环境
