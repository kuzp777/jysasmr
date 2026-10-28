# 用户数据云端同步（Cloudflare Workers + D1）

让 1000+ 用户的**收藏 / 观看历史 / 播放列表**跨设备同步。

## 为什么用 D1（而不是 KV）

| 资源 | Workers KV 免费 | **D1 免费** | 1000 用户需求 |
|------|---------------|------------|-------------|
| 每天写入 | 1,000 次 ⚠️ | **100,000 行** | ~2,000 次 |
| 每天读取 | 100,000 次 | **5,000,000 行** | ~5,000 次 |
| 存储 | 1 GB | **5 GB** | ~5 MB |

> KV 免费版每天只允许 1,000 次写入，1000 人同时用会互相抢额度。
> D1 是 Cloudflare 的 Serverless SQL，免费额度对千人级完全够用。

**免费额度没有期限**（不是试用），但 Cloudflare 保留调整定价的权利。

## 部署步骤

```bash
# 1. 安装 wrangler（Cloudflare CLI）
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 创建 D1 数据库
wrangler d1 create jys-users
# 记下输出的 database_id，填到 wrangler.toml

# 4. 建表
wrangler d1 execute jys-users --file=schema.sql

# 5. 部署
wrangler deploy
# 记下输出的 URL，例如 https://jys-asmr-users.xxx.workers.dev
```

## 前端接入

在 `index.html` 的 `<script src="user-data.js">` **之前**加一行：

```html
<script>
  // 改成你的 Workers URL
  window.JYS_CLOUD_API = 'https://jys-asmr-users.xxx.workers.dev';
</script>
<script src="user-data.js"></script>
<script src="main.js"></script>
```

不配置 `JYS_CLOUD_API` 时，站点自动退回 **localStorage 本地模式**（单机可用）。

## API 协议

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/data/{userId}` | 读用户数据，不存在返回 `{ok:true, empty:true}` |
| PUT | `/data/{userId}` | 写入 `{"data":{...}}`，body ≤ 64KB |
| GET | `/health` | 健康检查，返回 `{ok:true, users:N}` |

`userId` 格式：`u_` + 8~32 位小写字母数字（前端自动生成）。

## 数据结构

```json
{
  "version": 1,
  "updatedAt": 1761600000000,
  "favorites": ["https://..."],
  "history": [{ "id": "...", "name": "...", "ts": 1761600000000 }],
  "playlist": ["..."],
  "theme": "dark"
}
```

## 换设备

站点「同步」栏点「🔑 同步码」复制一串码，新设备粘贴后点「恢复」。

## 无后端保底

「导出 / 导入」按钮可把数据存成 JSON 文件，手动带走。

## 额度保护建议

前端已做 **1.5 秒防抖合并**（短时间多次操作只写一次）。若用户量超过 1 万：

1. 拉长防抖间隔到 5–10 秒
2. 或升级到 Workers Paid（$5/月，1000 万请求/月）
3. 或迁移到 Supabase（免费 500MB 数据库，5 万月活用户）
