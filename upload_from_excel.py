import pandas as pd
import json
import subprocess
import sys
import os
from datetime import datetime

# ==================== 配置区 ====================
VIDEO_JSON_PATH = "videos.json"
EXCEL_PATH = "video_data.xlsx"
COVER_FOLDER = "covers"
COVER_PREFIX = f"/{COVER_FOLDER}/"
# =============================================

def load_existing_videos():
    if not os.path.exists(VIDEO_JSON_PATH):
        return []
    try:
        with open(VIDEO_JSON_PATH, 'r', encoding='utf-8') as f:
            content = f.read().strip()
            return json.loads(content) if content else []
    except Exception as e:
        print(f"⚠️ 读取 videos.json 出错，将新建：{e}")
        return []

def save_videos(videos):
    with open(VIDEO_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

def parse_date(date_value):
    """解析 Excel 中的「发布时间」"""
    if pd.isna(date_value) or str(date_value).strip() == "" or str(date_value).lower() == "nan":
        return datetime.now().isoformat()
    try:
        dt = pd.to_datetime(date_value, errors='coerce')
        return dt.isoformat() if not pd.isna(dt) else datetime.now().isoformat()
    except:
        return datetime.now().isoformat()

def main():
    print("🎥 GitHub 视频同步助手（更新发布时间 + 是否充电）")
    print("=" * 75)

    if not os.path.exists(EXCEL_PATH):
        print(f"❌ 未找到 {EXCEL_PATH}")
        sys.exit(1)

    existing_videos = load_existing_videos()
    print(f"✅ 当前 videos.json 中已有 {len(existing_videos)} 条视频")

    try:
        df = pd.read_excel(EXCEL_PATH)
        print(f"✅ 读取 Excel 成功，共 {len(df)} 行")
    except Exception as e:
        print(f"❌ 读取 Excel 失败：{e}")
        sys.exit(1)

    updated_count = 0
    added_count = 0

    for idx, row in df.iterrows():
        name = str(row.get('视频名字', '')).strip()
        link = str(row.get('视频链接', '')).strip()
        cover_raw = str(row.get('视频封面', '')).strip()
        publish_time_raw = row.get('发布时间')
        whether_charge = str(row.get('是否充电', '')).strip()

        if not name or not link:
            continue

        # 处理封面
        cover = COVER_PREFIX + cover_raw if cover_raw and not cover_raw.startswith(('http', '/')) else cover_raw

        # 解析发布时间
        upload_time = parse_date(publish_time_raw)

        # 处理是否充电 → 转为 keywords
        keywords = [whether_charge] if whether_charge and whether_charge.lower() != "nan" else []

        # 查找是否已存在
        existing = None
        for v in existing_videos:
            if v.get("name") == name or v.get("link") == link:
                existing = v
                break

        if existing:
            # === 已存在 → 更新字段 ===
            existing["uploadTime"] = upload_time
            existing["keywords"] = keywords
            existing["cover"] = cover  # 同时更新封面（防止不一致）
            updated_count += 1
            print(f"✅ 已更新：{name}  |  发布时间：{upload_time[:19]}  |  是否充电：{whether_charge}")
        else:
            # === 不存在 → 新增 ===
            new_video = {
                "name": name,
                "link": link,
                "cover": cover,
                "uploadTime": upload_time,
                "keywords": keywords,
                "addTime": datetime.now().isoformat()
            }
            existing_videos.insert(0, new_video)
            added_count += 1
            print(f"✅ 已新增：{name}  |  发布时间：{upload_time[:19]}")

    if updated_count == 0 and added_count == 0:
        print("⚠️ 没有需要更新的视频")
        sys.exit(0)

    save_videos(existing_videos)
    print(f"\n🎉 处理完成！")
    print(f"   更新了 {updated_count} 条视频的发布时间和是否充电")
    print(f"   新增了 {added_count} 条视频")
    print(f"   当前总视频数：{len(existing_videos)} 条")

    # Git 上传
    try:
        subprocess.run(["git", "add", VIDEO_JSON_PATH], check=True)
        if os.path.exists(COVER_FOLDER):
            subprocess.run(["git", "add", COVER_FOLDER], check=True)
        
        subprocess.run(["git", "commit", "-m", f"🔄 同步 Excel：更新 {updated_count} 条 + 新增 {added_count} 条"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("✅ 已成功推送到 GitHub！")
    except subprocess.CalledProcessError as e:
        print(f"❌ Git 操作失败：{e}")

if __name__ == "__main__":
    main()