# Raycast Extension 示例

一个最小可用的 Raycast 扩展：列出 ClipVault 凭证并支持「复制到剪贴板」。

## package.json

```json
{
  "name": "clipvault",
  "title": "ClipVault",
  "description": "Access ClipVault credentials",
  "icon": "icon.png",
  "author": "you",
  "categories": ["Developer Tools"],
  "dependencies": { "@raycast/api": "^1.70.0", "node-fetch": "^3.3.0" },
  "commands": [{ "name": "list", "title": "List Credentials", "mode": "view" }],
  "preferences": [
    { "name": "token", "title": "ClipVault Token", "type": "password", "required": true },
    { "name": "port", "title": "Port", "type": "textfield", "default": "7424", "required": false }
  ]
}
```

## src/list.tsx

```tsx
import { ActionPanel, Action, List, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import fetch from "node-fetch";

interface Prefs { token: string; port?: string }
interface Cred { id: string; name: string; type: string }

export default function Command() {
  const { token, port } = getPreferenceValues<Prefs>();
  const base = `http://127.0.0.1:${port || "7424"}`;
  const [items, setItems] = useState<Cred[]>([]);

  useEffect(() => {
    fetch(`${base}/v1/credentials?limit=100`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((d: any) => setItems(d.items ?? []))
      .catch((e) => showToast({ style: Toast.Style.Failure, title: "ClipVault error", message: String(e) }));
  }, []);

  async function copy(id: string) {
    const r = await fetch(`${base}/v1/clipboard/copy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: id })
    });
    if (r.ok) showToast({ style: Toast.Style.Success, title: "Copied (auto-clear 30s)" });
    else showToast({ style: Toast.Style.Failure, title: `HTTP ${r.status}` });
  }

  return (
    <List>
      {items.map((c) => (
        <List.Item
          key={c.id}
          title={c.name}
          subtitle={c.type}
          actions={
            <ActionPanel>
              <Action title="Copy to Clipboard" onAction={() => copy(c.id)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
```

## 使用

1. 在 ClipVault → Developer Tools 启动 HTTP API，生成一个 Token
2. 在 Raycast 扩展偏好设置里粘贴 Token
3. 触发命令 `List Credentials`，回车即把凭证复制到剪贴板（30 秒自动清空）
