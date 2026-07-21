# ClipVault 截图素材清单

本目录收录 README、user-guide 及发布说明中引用的截图。**当前所有引用的 `placeholder*.png` 均为占位，需补齐后替换**。

## 拍摄规范

- 分辨率：**1280×800**（常规）或 **2560×1600**（Retina 高清）
- 格式：PNG（无损、支持透明）；大于 1MB 可考虑转 `webp`
- 主题：**浅色主题为主**，深色主题每种单独拍一张命名为 `*-dark.png`
- 语言：中文 UI 优先；英文 UI 以 `-en.png` 后缀区分
- 隐私：**不得出现真实 API Key、邮箱、IP**；使用 `sk-demo-xxxx` / `user@example.com` 等脱敏示例
- 文件体积：单张建议 < 500KB（可 `pngquant` 压缩）

## 清单

| 文件名 | 场景 | 推荐尺寸 | 页面路径 | 状态 |
|--------|------|----------|----------|------|
| `dashboard.png` | 仪表盘四卡片布局（健康度 / 最近活动 / Vera 建议 / 团队状态） | 2560×1600 | `/dashboard` | ⬜ 待补 |
| `vera-chat.png` | Vera 对话面板，含一轮正常问答 + 脱敏占位符提示 | 1280×800 | Vera 侧边抽屉 | ⬜ 待补 |
| `team-page.png` | 团队空间，2-3 个设备在线，同步指示灯正常 | 1280×800 | `/team` | ⬜ 待补 |
| `unlock.png` | 解锁页，主密码输入框聚焦态 | 1280×800 | `/unlock` | ⬜ 待补 |
| `hud-command.png` | Alt+Space 召唤的 HUD 毛玻璃窗口，展示搜索+建议列表 | 2560×1600 | HUD window | ⬜ 待补 |
| `settings.png` | 设置页通用标签 + 语言/主题选择器可见 | 1280×800 | `/settings` | ⬜ 待补 |
| `audit-log.png` | 审计日志列表，含筛选器 + 5-10 条记录 | 1280×800 | `/audit` | ⬜ 待补 |
| `onboarding-step1.png` | Onboarding 第 1 步：欢迎页 | 1280×800 | Onboarding stage | ⬜ 待补 |
| `onboarding-step2.png` | Onboarding 第 2 步：设置主密码（含强度表） | 1280×800 | Onboarding stage | ⬜ 待补 |
| `onboarding-step3.png` | Onboarding 第 3 步：Vera 配置跳转提示 | 1280×800 | Onboarding stage | ⬜ 待补 |
| `onboarding-step4.png` | Onboarding 第 4 步：快捷键学习 | 1280×800 | Onboarding stage | ⬜ 待补 |
| `onboarding-step5.png` | Onboarding 第 5 步：导入现有凭证选择源 | 1280×800 | Onboarding stage | ⬜ 待补 |
| `totp-ring.png` | TOTP 凭证详情页动态环形倒计时 | 1280×800 | `/credential/:id` | ⬜ 待补 |
| `pair-dialog.png` | P2P 设备配对弹窗，展示 6 位数字验证码 | 1280×800 | `/team` → 配对 | ⬜ 待补 |
| `health-report.png` | 健康报告：弱密码/重复密码/HIBP 检测结果示例 | 1280×800 | `/health` | ⬜ 待补 |
| `recovery-phrase.png` | 恢复短语生成页（24 词，模糊处理一半） | 1280×800 | `/recovery` | ⬜ 待补 |
| `share-package.png` | 分享包裹创建界面 | 1280×800 | `/share-packages` | ⬜ 待补 |
| `import-wizard.png` | 导入向导选择数据源步骤 | 1280×800 | `/import` | ⬜ 待补 |

## 历史占位引用映射

README.md 与 quick-start.md 里的占位图对应以下实际文件：

| 占位引用 | 替换为 |
|----------|--------|
| `docs/screenshots/placeholder-main.png` | `dashboard.png` |
| `docs/screenshots/placeholder-onboarding.png` | `onboarding-step1.png` |

## 贡献截图

1. 在 `docs/screenshots/` 下直接提交 PNG
2. 同步更新本 README 状态列为 ✅
3. 提 PR 时附带对应页面的复现路径说明
