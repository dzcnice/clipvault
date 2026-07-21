# ClipVault HTTP API v1

ClipVault 以本地守护进程方式暴露一组**只在 127.0.0.1 可达**的 HTTP 接口，供 Raycast / Alfred / 脚本等开发者工具调用。API 默认关闭，需要用户在 **Settings → Developer Tools** 中显式开启。

## 基本信息

- Base URL：`http://127.0.0.1:{port}`（默认 `7424`，端口冲突自动 +1，最多 10 次）
- 鉴权：`Authorization: Bearer <token>`（token 在 Developer Tools 页生成，明文仅显示一次）
- 响应：`application/json; charset=utf-8`
- Rate Limit：每个 token 每分钟 60 次；超出返回 `429`
- **响应绝不包含明文 credential value**（`/v1/clipboard/copy` 会把值写入系统剪贴板，由调用方读取）

## 状态码

| Code | 含义 |
|------|------|
| 200  | 成功 |
| 401  | 缺少 / 无效 Bearer token |
| 404  | 资源不存在 |
| 423  | Vault 已上锁（`E_VAULT_LOCKED`） |
| 429  | 触发限流 |

## 端点

### `GET /v1/status`（不鉴权）

```json
{ "running": true, "unlocked": true, "version": "v1" }
```

### `GET /v1/credentials`

列表，只返回元数据（无 value）。

Query：
- `keyword` (可选)：按 name/description 模糊匹配
- `limit` (可选)：默认 50，最大 200

```json
{
  "items": [
    { "id": "uuid", "name": "GitHub PAT", "type": "token",
      "tags": ["dev"], "createdAt": 1710000000000, "updatedAt": 1710000000000,
      "useCount": 3, "isFavorite": false }
  ],
  "total": 1
}
```

### `GET /v1/credentials/:id`

返回单条凭证**元数据**（不含 value）。

### `GET /v1/clipboard/recent`

最近剪贴板项（仅 preview 摘要）。

Query：
- `limit` (可选)：默认 20，最大 100

```json
{ "items": [{ "id":"...","type":"text","preview":"xxx","size":42,"createdAt":0 }] }
```

### `POST /v1/clipboard/copy`

把指定凭证的 value 写入系统剪贴板，并按 ClipVault 的 auto-clear 策略 30 秒后自动清空。

Body：
```json
{ "credentialId": "uuid" }
```

Response：
```json
{ "copied": true, "credentialId": "uuid" }
```

## Bash 示例

```bash
export CV_TOKEN="cv_xxxxxxxx"
curl -s http://127.0.0.1:7424/v1/status
curl -s -H "Authorization: Bearer $CV_TOKEN" \
  'http://127.0.0.1:7424/v1/credentials?keyword=github'
curl -s -H "Authorization: Bearer $CV_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"credentialId":"uuid"}' \
  http://127.0.0.1:7424/v1/clipboard/copy
```

## 安全边界

- API 绑定 `127.0.0.1`，**不暴露到局域网**
- Token 以 SHA-256 哈希入库；明文 token 仅创建时一次性返回
- 所有凭证类端点在 Vault 上锁时返回 `423`
- 未提供「直接返回明文 value」的端点；如需取值必须通过 `clipboard/copy`（由 OS 剪贴板 + 30 秒 auto-clear 限制暴露窗口）
