# ClipVault 3.1.1

**维护更新**：截图目录迁移、导入说明、自动更新与安装升级规范。

---

## 下载

| 平台 | 文件 |
|------|------|
| **Windows x64** | [`clipvault-3.1.1-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.1.1/clipvault-3.1.1-setup.exe) |

> 未代码签名：SmartScreen 可能提示「未知发布者」，选择「仍要运行」即可。

---

## 相对 3.1.0 的变化

### 体验
- 更换截图存储目录时，**自动迁移**仍存在的历史截图并更新数据库路径
- 导入向导补充跳过/重复策略与 Chrome 导出说明
- 更新提示可关闭、失败可重试

### 安装与更新
- NSIS：引导安装、卸载默认保留用户库、同 appId 覆盖升级
- 文档：`docs/release/auto-update.md`（如何推送更新）
- 签名：`docs/release/signing-setup.md` 补充可执行接线

### 从 3.1.0 升级

**方式 A（推荐，验证自动更新）**  
1. 保持已安装的 3.1.0  
2. 打开本 Release 后，客户端设置 → 检查更新（或等 30s 自动检查）  
3. 下载 → 立即重启安装  

**方式 B**  
直接运行本页 `setup.exe` 覆盖安装，`%APPDATA%\clipvault` 数据保留。

---

## 校验

Release 含 `latest.yml`（version **3.1.1**）与 `.blockmap`。

## License

MIT
