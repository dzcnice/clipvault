# Alfred Workflow 示例

一个最小骨架：通过关键词 `cv <keyword>` 查询 ClipVault 凭证并复制。

## Script Filter（Alfred）

- Language：`/bin/bash`
- Script：

```bash
#!/bin/bash
QUERY="$1"
TOKEN="${CV_TOKEN:?set CV_TOKEN env var in workflow}"
PORT="${CV_PORT:-7424}"

ITEMS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/v1/credentials?keyword=$(printf %s "$QUERY" | jq -sRr @uri)")

# 期望 jq 已安装：brew install jq
echo "$ITEMS" | jq '{items: [ .items[] | {
  uid: .id,
  title: .name,
  subtitle: .type,
  arg: .id
} ]}'
```

## Run Script（由 Alfred action 触发）

```bash
#!/bin/bash
ID="$1"
TOKEN="${CV_TOKEN}"
PORT="${CV_PORT:-7424}"

curl -s -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"credentialId\":\"$ID\"}" \
  "http://127.0.0.1:$PORT/v1/clipboard/copy" >/dev/null

echo "Copied (auto-clear 30s)"
```

## 环境变量

在 Workflow 右上角「Variables」中设置：

- `CV_TOKEN`：ClipVault Developer Tools 页生成
- `CV_PORT`：默认 7424，如有端口冲突改为实际值

## 注意

- Alfred 的 Script Filter 必须返回 Alfred JSON Schema（上面使用了 jq 转换）
- 如未安装 jq，可改用 Python/Node 处理 JSON
- ClipVault Vault 上锁时 API 返回 423，需要在 App 解锁后再查询
