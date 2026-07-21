# P2P 局域网协作排障指南

ClipVault 的团队协作完全走**同一局域网 P2P**：没有任何服务器中转，发现用 mDNS（UDP 5353），握手和同步走本地 TCP + Noise。下面是三条最常见的"看不到其他设备"的原因与修复方式。

## 1. 防火墙拦截 mDNS / 信令端口

Windows 首次启动 ClipVault 会弹出防火墙询问，如果当时不小心选了"取消"或"拒绝"，之后 ClipVault 的 announce 包会被内核静默丢弃，局域网里其他设备**看不到你**、你也**看不到他们**。

**修复**：

- Windows：控制面板 → `control firewall.cpl` → 允许应用通过防火墙 → 找到 `ClipVault`，勾选"专用网络"。Onboarding 的"P2P 前置"步骤提供了"打开 Windows 防火墙"快捷按钮，一键跳转。
- macOS：系统设置 → 网络 → 防火墙 → 关闭；或在"允许应用"里把 ClipVault 放行。
- Linux：`sudo ufw allow 5353/udp`，并允许 ClipVault 的信令 TCP 端口（启动时打印在日志里）。

## 2. 不同 WiFi / VPN / 客户端隔离

局域网发现包不会穿过路由器，也穿不过启用了"客户端隔离"（AP Isolation）的 WiFi。常见坑：

- 一台在 `WiFi-A`，另一台在 `WiFi-5G`，虽然是同一台路由器但是两个独立广播域 — **不通**。
- 一台开着 VPN（企业 VPN、ProtonVPN、Clash TUN 等），mDNS 被 VPN 劫持走了 — **不通**。
- 公共 WiFi 或酒店网络启用了 AP Isolation — **不通**。

**修复**：所有设备连到同一个非隔离的 WiFi / 有线网段，**关掉 VPN** 再试。

## 3. 对方尚未启动或未登录

ClipVault 需要 vault 解锁之后才会启动 P2P 协调器（包括 mDNS 广播）。如果对方只是打开了窗口但没输入主密码，其他设备**看不到他**。

**修复**：让对方完成主密码解锁，观察自己 JoinTeamDialog 的"局域网发现"列表是否出现。仍然不出现，点击诊断卡片里的"测试网络"按钮，把输出贴给 ClipVault issues。
