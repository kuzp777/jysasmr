#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B 站视频同步（搜索接口，无需登录 Cookie）

用法：
    python sync_bilibili_search.py

原理：B 站空间 API 有风控（-352/412），但搜索接口可用。
      用 "JYsASMR" 等关键词分页搜索，再按 mid=176647698 过滤出本人投稿。

注意：
    - 搜索接口的 is_pay 字段不可靠，充电专属标记会与备份取 OR 保护
    - 会自动下载新封面到 jysasmr/covers/
    - 只更新 B 站条目，不动 YouTube 条目
"""
import urllib.request
import urllib.parse
import json
import re
import http.cookiejar
import time
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
MID = 176647698
# 兼容两种位置：脚本在仓库根，或在 jysasmr/ 内
_SCRIPT_DIR = Path(__file__).resolve().parent
if (_SCRIPT_DIR / "videos.json").exists():
    PROJECT = _SCRIPT_DIR
else:
    PROJECT = _SCRIPT_DIR / "jysasmr"
BASE = _SCRIPT_DIR
VIDEOS_JSON = PROJECT / "videos.json"
COVERS = PROJECT / "covers"

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def get(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Referer": "https://search.bilibili.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    return opener.open(req, timeout=25).read()


def fetch_search_page(kw, page, size=50):
    q = urllib.parse.quote(kw)
    url = (
        f"https://api.bilibili.com/x/web-interface/search/type"
        f"?search_type=video&keyword={q}&page={page}&page_size={size}&order=pubdate"
    )
    data = json.loads(get(url).decode("utf-8", "ignore"))
    if data.get("code") != 0:
        return None, f"code={data.get('code')} {data.get('message')}"
    return (data.get("data") or {}).get("result") or [], None


def fetch_all_our_videos():
    found = {}
    for kw in ["JYsASMR", "JYs ASMR", "JY's ASMR"]:
        print(f"search: {kw}")
        for page in range(1, 12):
            res, err = fetch_search_page(kw, page)
            if err:
                print(f"  page {page} err: {err}")
                break
            if not res:
                break
            for r in res:
                if str(r.get("mid")) != str(MID):
                    continue
                bvid = r.get("bvid")
                if bvid:
                    found[bvid] = r
            print(f"  page {page}: +{len(res)} (cum {len(found)})")
            if len(res) < 50:
                break
            time.sleep(0.5)
        time.sleep(0.6)
    return found


def fmt_ts(ts):
    if not ts:
        return ""
    try:
        return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(int(ts)))
    except Exception:
        return ""


def clean_html(s):
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", "", s)
    for a, b in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'")]:
        s = s.replace(a, b)
    return s


def is_live(name):
    n = name or ""
    return ("直播回放" in n) or ("回放" in n and "直播" in n)


def download_cover(url, dest_name):
    if not url:
        return ""
    if url.startswith("//"):
        url = "https:" + url
    COVERS.mkdir(parents=True, exist_ok=True)
    ext = ".png" if ".png" in url else ".jpg"
    dest = COVERS / f"{dest_name}{ext}"
    if dest.exists() and dest.stat().st_size > 0:
        return f"covers/{dest.name}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.bilibili.com/"})
        dest.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        return f"covers/{dest.name}"
    except Exception as e:
        print(f"  cover fail: {e}")
        return ""


def bvid_of(v):
    m = re.search(r"(BV[\w]+)", v.get("link") or "")
    return m.group(1) if m else None


def next_cover_id(items):
    mx = 0
    for v in items:
        m = re.search(r"cover-(\d+)", v.get("cover") or "")
        if m:
            mx = max(mx, int(m.group(1)))
    return mx + 1


def norm_keywords(desc, is_pay, title):
    kws = []
    text = f"{title} {desc}"
    for kw in ["助眠","ASMR","轻语","耳语","口腔音","敲击音","抓挠","采耳","按摩","化妆",
               "理发","头疗","冥想","解压","放松","白噪音","视觉触发","灯光","无对话",
               "沉浸式","3D音效","双耳分听","合集","专注力测试","角色扮演","护肤"]:
        if kw in text and kw not in kws:
            kws.append(kw)
    if is_pay:
        kws.append("充电专属")
    return kws or ["助眠", "ASMR"]


def main():
    print("= B 站搜索同步 =")
    try:
        get("https://www.bilibili.com/")
    except Exception:
        pass

    found = fetch_all_our_videos()
    print(f"\n找到 {len(found)} 条")

    items = json.loads(VIDEOS_JSON.read_text(encoding="utf-8")) if VIDEOS_JSON.exists() else []
    existing = {bvid_of(v): v for v in items if v.get("source") != "youtube" and bvid_of(v)}
    print(f"现有 B 站 {len(existing)}")

    cover_seq = next_cover_id(items)
    new_entries, updated, fixed_premium = [], 0, 0

    for bvid, r in sorted(found.items(), key=lambda kv: -(kv[1].get("pubdate") or 0)):
        name = clean_html(r.get("title") or "")
        upload = fmt_ts(r.get("pubdate"))
        duration = r.get("duration") or ""
        is_pay = bool(r.get("is_pay") or r.get("is_charge_video"))
        live = is_live(name)

        if bvid in existing:
            v = existing[bvid]
            changed = False
            for k, val in [("name", name), ("uploadTime", upload), ("duration", duration)]:
                if val and v.get(k) != val:
                    v[k] = val
                    changed = True
            # is_pay 字段不可靠：只在原本为 true 时保留（OR 保护）
            if is_pay and not v.get("isPremium"):
                v["isPremium"] = True
                changed = True
                fixed_premium += 1
            if live and not v.get("isLiveReplay"):
                v["isLiveReplay"] = True
                changed = True
            if changed:
                updated += 1
            continue

        print(f"  + {name[:55]}")
        cover_rel = download_cover(r.get("pic") or "", f"cover-{cover_seq}")
        if cover_rel:
            cover_seq += 1
        new_entries.append({
            "name": name,
            "link": f"https://www.bilibili.com/video/{bvid}/",
            "source": "bilibili",
            "cover": cover_rel,
            "uploadTime": upload,
            "keywords": norm_keywords(r.get("desc"), is_pay, name),
            "aiTagged": False,
            "tagTime": "",
            "duration": duration,
            "isPremium": is_pay,
            "isLiveReplay": live,
            "isShort": False,
        })

    print(f"\n新增 {len(new_entries)}  更新 {updated}  恢复充电标记 {fixed_premium}")

    if new_entries:
        insert_at = 0
        for i, v in enumerate(items):
            if v.get("source") != "youtube":
                insert_at = i + 1
        items[insert_at:insert_at] = new_entries

    items.sort(key=lambda x: x.get("uploadTime") or "", reverse=True)

    if VIDEOS_JSON.exists():
        VIDEOS_JSON.with_suffix(".json.bak").write_bytes(VIDEOS_JSON.read_bytes())
    VIDEOS_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    bl = sum(1 for v in items if v.get("source") != "youtube")
    yt = sum(1 for v in items if v.get("source") == "youtube")
    prem = sum(1 for v in items if v.get("isPremium"))
    print(f"完成: 总 {len(items)}（B站 {bl} / YouTube {yt}）充电专属 {prem}")


if __name__ == "__main__":
    main()
