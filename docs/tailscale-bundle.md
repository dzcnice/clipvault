# Tailscale 二进制打包说明（Windows x64）

ClipVault 将自建的 headscale overlay 作为 P2P 首选路径之一，因此需要在
Electron 安装包内随附官方 `tailscaled` / `tailscale` 可执行文件与 `wintun.dll`
驱动。本文档说明如何准备这些资源。

> 目录约定：`resources/tailscale/x64/`（打包后位于 `<APP>/resources/tailscale/x64/`）
>
> 所需文件：
> - `tailscaled.exe` - Tailscale 本地守护进程
> - `tailscale.exe`  - CLI 客户端
> - `wintun.dll`     - WireGuard 在 Windows 下的虚拟网卡驱动

## 方案 A：一键脚本（推荐）

在仓库根目录（`ClipVault/`）执行：

```bash
npm run bundle:tailscale
```

脚本 `scripts/download-tailscaled.js` 会：

1. 访问 <https://pkgs.tailscale.com/stable/>，解析最新 `tailscale_*_amd64.zip`；
2. 下载该 zip，若旁路存在 `.sha256` 文件则比对校验；
3. 解压出 `tailscaled.exe` / `tailscale.exe` / `wintun.dll` 到
   `resources/tailscale/x64/`；
4. 写入 `resources/tailscale/x64/.verified`，记录版本号与三个二进制的 SHA-256
   供审计。

指定版本：

```bash
npm run bundle:tailscale -- --version=1.74.1
```

强制重新下载：

```bash
npm run bundle:tailscale -- --force
```

## 方案 B：手动补齐

当 CI 或开发机受限无法访问 `pkgs.tailscale.com` 时：

1. 在任意可联网主机打开 <https://pkgs.tailscale.com/stable/>；
2. 下载形如 `tailscale_1.74.1_amd64.zip` 的 Windows x64 压缩包；
3. 解压，找到以下三个文件（历史版本可能位于 `windows/` 子目录）：
   - `tailscaled.exe`
   - `tailscale.exe`
   - `wintun.dll`
4. 原样复制到 `<ClipVault repo>/resources/tailscale/x64/`；
5. 不需要额外签名，electron-builder 会把整个目录作为 `extraResources` 打进安装包。

## 方案 C：使用系统已安装的 Tailscale

若目标设备已经安装了 Tailscale 官方 MSI，亦可从以下位置复制：

```
C:\Program Files\Tailscale\tailscaled.exe
C:\Program Files\Tailscale\tailscale.exe
C:\Program Files\Tailscale\wintun.dll
```

> 注意：不同官方版本的 `wintun.dll` 必须与对应版本的 `tailscaled.exe`
> 成对使用，不要混用跨版本文件。

## 验证

准备完成后可以检查目录：

```
resources/
└── tailscale/
    └── x64/
        ├── .verified          # 可选，脚本生成
        ├── tailscale.exe
        ├── tailscaled.exe
        └── wintun.dll
```

构建时 `electron-builder.yml` 会：

- `asarUnpack: resources/tailscale/**/*`：保证二进制以真实文件形式解压出来可被
  `spawn` 调用；
- `extraResources.from: resources/tailscale` → `to: tailscale`：安装后路径为
  `<APP>/resources/tailscale/x64/*.exe`，可通过 `process.resourcesPath`
  直接访问。

## 常见问题

### Q：脚本执行时报 “HTTP 403/404”

切换到方案 B 手动下载。也可能是 `pkgs.tailscale.com` 临时变更目录结构，
届时请先升级本仓库的 `download-tailscaled.js`。

### Q：运行时报 “wintun.dll load failed”

通常是 `wintun.dll` 被杀软拦截或位数不匹配（必须是 amd64 版本）。
可临时将 ClipVault 安装目录加入杀软白名单并重新启动 `tailscaled`。

### Q：macOS / Linux 下是否需要同样处理？

不需要。当前仅提供 Windows x64 版本的内置 tailscaled；macOS/Linux 默认仍然
使用官方客户端或用户自行安装，不打包进 app 资源。
