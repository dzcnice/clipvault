# ClipVault 安全文档

本文档说明 **ClipVault v3 个人本地版** 的威胁模型、加密架构与明确不在防护范围内的攻击面。

> **适用范围**：桌面端 Electron 应用（Windows 主测 · macOS / Linux 兼容）  
> **本文档版本**：3.1.0  
> **同步于代码**：`src/main/crypto/**`、`src/main/biometric/**`、`src/db/**`、`src/utils/export.ts`

---

## 产品安全边界（v3）

| 项 | 说明 |
|----|------|
| 形态 | **单机个人版**：无团队 / P2P / 云同步 / Vera AI / CLI / 本地 HTTP / SSH Agent |
| 登录 | **无主密码日常门槛**：启动时 `ensureOpen` → OS `safeStorage` 创建或解锁 DEK |
| 旧库 | 旧版主密码库可 **一次性** 迁移到 safeStorage（输入旧密码后不再需要） |
| 目标 | 防误贴、剪贴板历史与凭证本地加密存储 |
| 非目标 | **不**防本机其他登录用户、Admin/root 恶意进程、内存 dump、键盘/剪贴板 Hook |

详见 `docs/KNOWN-LIMITATIONS.md`。

---

## 1. 威胁模型（T1 ~ T8）

> 缓解状态：**完整** = 设计与实现落地；**部分** = 有实现但边界有限；**接受风险** = 威胁模型外，明确不承诺。

| ID | 威胁 | 缓解 | 说明 |
|----|------|------|------|
| **T1** | 物理拿走已登录本机 | 部分 | 依赖 OS 登录；ClipVault 无独立主密码门槛。可选生物识别作 **敏感操作确认**（非日常登录） |
| **T2** | 同机异用户读 SQLite | 完整 | 凭证 value AES-256-GCM + DEK；AppData 受 OS 用户 ACL 隔离 |
| **T3** | 离线硬抠 DEK 包装 | 部分 | DEK 由 `safeStorage`（Win DPAPI / mac Keychain / Linux libsecret）包装；同用户进程可调用 OS API，**安全性低于独立主密码** |
| **T4** | SQL 注入 | 完整 | better-sqlite3 参数化；排序字段白名单 |
| **T5** | 导出文件泄露 | 完整 | 默认脱敏；加密导出用独立密码 scrypt + AES-256-GCM |
| **T6** | 伪造 IPC | 完整 | sender 校验 + contextIsolation + sandbox；`openExternal` 协议白名单 |
| **T7** | 渲染进程 XSS | 部分 | CSP + contextIsolation；依赖与 Electron 版本需持续审计 |
| **T8** | 屏幕录制 / 截图 | 部分 | 敏感页可 `setContentProtection`；无法对抗物理拍摄 |

### 1.1 不在威胁模型内

1. 被篡改的应用二进制（依赖代码签名，见 `docs/release/signing-setup.md`）  
2. 解锁后内存中的 DEK dump  
3. 全局键盘 / 剪贴板监听（自动清空只能缩短窗口）  
4. 硬件侧信道、冷启动、DMA  
5. 本机 Admin/root 持久化恶意软件  
6. 供应链零日（npm / native module）  
7. 后量子攻击  

---

## 2. 加密架构

### 2.1 密钥分层

```
┌─ 日常路径（v3.1 默认）──────────────────────────────────┐
│  OS safeStorage ──包装──► encrypted_dek（vault_meta）     │
│       │ 解锁                                              │
│       ▼                                                   │
│      DEK (32B，会话内存) ──AES-256-GCM──► 凭证 value      │
└───────────────────────────────────────────────────────────┘

┌─ 旧库迁移路径 ────────────────────────────────────────────┐
│  旧主密码 ─scrypt─► KEK ─解密─► DEK ─再包装─► safeStorage │
└───────────────────────────────────────────────────────────┘
```

- **DEK**：随机 32 字节，加密凭证；仅解锁会话驻留内存  
- **mode**：`safestorage`（默认）/ `password`（仅遗留库，迁移前）  
- 剪贴板历史加密回填：解锁后对 legacy 明文列做 backfill（见 `clipboard-store`）

### 2.2 BIP39 恢复短语

- 可选灾难恢复：24 词派生 Recovery KEK，加密同一 DEK  
- **不是**日常登录门槛；短语展示后由用户离线保管  
- 库内仅存校验指纹，无法反推短语  

### 2.3 生物识别

- 注册时 vault 须已解锁：`safeStorage` 再包装一份 DEK 副本到 `biometric_enrollment`  
- 用途：敏感操作确认；**主密码不落盘**  
- 失败计数与临时锁定见 `src/main/biometric/`  

### 2.4 导出

| 模式 | value | 场景 |
|------|-------|------|
| plain / 脱敏 | 空或占位 | 结构备份、Issue |
| encrypted | 独立密码 scrypt + AES-GCM | 跨设备迁移 |

---

## 3. 依赖与发布

- 定期 `npm audit` / `npm run security:scan`  
- Windows / macOS **正式签名与公证**依赖外部证书环境（未配置时不得宣称已签名发布）  
- 自动更新走 `electron-updater`；生产应使用可信 Release 源  

---

## 4. 历史说明

v2 曾包含 P2P 团队、Vera AI、CLI/HTTP/SSH、加密分享包等能力及对应威胁面（T 系列更宽）。  
**v3 源码已移除上述子系统**；本文件以当前个人版为准。旧版设计笔记可在仓库 `docs/` 历史文档中查阅，**不作为 v3 对外承诺**。

---

## 5. 报告问题

若发现安全缺陷，请勿在公开 Issue 贴明文凭证或完整内存转储。优先通过维护者私密渠道说明复现步骤与影响范围。
