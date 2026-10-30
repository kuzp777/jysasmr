# JY's ASMR · 粉丝收集站 🌙

一个为 **[JY's ASMR](https://space.bilibili.com/176647698)** 做的粉丝向选片站。
**不存视频、不做播放器**——只帮你从 356 条助眠视频里，快速选出今晚要听的那一个，选完跳转 B 站 / YouTube 播放。

## 为什么需要这个站

B 站播放已经很完善，但「**粉丝收集**」这件事它做得不好：

- 没有时长筛选（今晚想听 20 分钟还是 2 小时？）
- 标签随意，没有触发音的结构化分类
- 打开就是推荐流，容易刷停不下来
- 充电专属、直播回放、正片混在一起不好找
- 没有「随机抽一个」

本站只做这一件事：**打开 → 筛一下 → 点开 → 睡**。

## 功能

- 🔍 **搜索** — 按名称、标签多词搜索
- 🏷️ **标签云** — 触发音 / 视觉 / 场景 / 效果等一级分类，点开二级标签精确筛
- 📺 **来源筛选** — B 站 / YouTube / 全部
- ⭐ **收藏夹** — 卡片一键收藏，「仅看收藏」快速回访
- 🕘 **观看历史** — 自动记录点开过的视频，「最近看过」按时间倒序
- 📋 **今晚序列** — 把收藏编排成播放列表，按序或随机播放，播放中可切上下条
- ⚡ **充电专属** — 一键筛选充电专属视频
- 🎬 **直播回放** — 一键筛选直播回放
- ⏱️ **时长筛选** — 短 / 中 / 长 / 超长
- 🎲 **随机抽取** — 睡前抽一个，告别选择困难
- 🌗 **主题切换** — 暗色 / 夜深调暗 / 浅色 三档分段切换
- 🔗 **链接分享** — 筛选条件写进 URL，直接把「这个筛选结果」发给别人
- 📺 **站内播放** — B 站 / YouTube iframe 站内播放，也可跳转原站
- 🗂 **筛选收起** — 筛选区可展开/收起，激活条件显示计数角标
- ☁️ **多用户同步** — 收藏/历史/列表跨设备，支持 1000+ 用户（见下文）

## 内容来源

| 平台 | 数量 | 说明 |
|------|------|------|
| [B 站 JYsASMR](https://space.bilibili.com/176647698) | 256 | 主阵地，含充电专属、直播回放 |
| [YouTube @JYs_ASMR](https://www.youtube.com/@JYs_ASMR) | 100 | 英文向副阵地，含 Shorts 与部分独占内容 |

视频数据在 [`videos.json`](videos.json)，每条包含：

```json
{
  "name": "视频名称",
  "link": "https://www.bilibili.com/video/BV...",
  "source": "bilibili",
  "cover": "cover-1.jpg",
  "uploadTime": "2026-03-28",
  "keywords": ["助眠", "轻语", "耳刮"],
  "duration": "17:41",
  "isPremium": false,
  "isLiveReplay": false,
  "isShort": false
}
```

YouTube 条目额外带 `youtubeId`，封面用 `https://i.ytimg.com/vi/{id}/hqdefault.jpg`。

## 本地运行

```bash
# 任意静态服务器即可
python -m http.server 8080
# 打开 http://localhost:8080
```

## 部署

基于 GitHub Pages，推送到 `main` 分支即可自动部署。

## 多用户数据同步

收藏、历史、播放列表等用户数据支持 **1000+ 用户跨设备同步**。

**三种模式，自动降级：**

1. **本地模式**（默认）— 存在浏览器 localStorage，开箱即用
2. **云端模式** — 部署 Cloudflare Workers 后开启，跨设备同步
3. **导出/导入** — JSON 文件手动带走，无后端也能用

**开启云端同步（免费）：**

```bash
# 见 cloudflare-worker/README.md
cd cloudflare-worker
npm install -g wrangler
wrangler login
wrangler kv:namespace create USERS   # 把 id 填进 wrangler.toml
wrangler deploy                      # 记下输出的 URL
```

然后在 `index.html` 里加一行（`<script src="main.js">` 之前）：

```html
<script>window.JYS_CLOUD_API = 'https://你的-worker.workers.dev';</script>
```

**换设备：** 点「🔑 同步码」复制一串码，新设备粘贴后点「恢复」。

容量参考：1000 用户 × 5KB = 5MB，Cloudflare 免费版 1GB 存储 / 10 万次请求每天，绰绰有余。

## 维护

### 新增视频（手动）

- **B 站视频**：往 `videos.json` 里追加条目，封面放到 `covers/`
- **YouTube 视频**：同上，`source` 填 `"youtube"`，`cover` 用油管缩略图 URL
- **批量导入**：参考 `upload_from_excel.py`（Excel → JSON）

### 自动同步（B 站）

推荐用**搜索接口同步**（无需登录 Cookie，稳定可用）：

```bash
python sync_bilibili_search.py
```

原理：B 站空间 API 有风控，但搜索接口可用。脚本按 `JYsASMR` 关键词分页搜索，
再按 mid 过滤出本人投稿，增量追加新视频并下载封面。

> 备用方案 `sync_bilibili.py` 走空间 API，需要浏览器 Cookie（F12 → Network →
> Request Headers → Cookie）。匿名请求会被 `-352` 风控拦截。

## 声明

- 本站为粉丝整理的**索引**，不存储、不转载视频文件
- 视频版权归 [JY's ASMR](https://space.bilibili.com/176647698) 所有
- 如 UP 主希望下架本索引，请联系，立即处理

## License

MIT
