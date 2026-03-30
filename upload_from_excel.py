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
            if not content or content == "":
                return []
            return json.loads(content)
    except Exception as e:
        print(f"⚠️ 读取 videos.json 时出错（文件可能损坏），将创建一个新的。")
        print(f"错误信息: {e}")
        return []

def save_videos(videos):
    with open(VIDEO_JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

def main():
    print("🎥 GitHub 视频追加上传助手（已优化错误处理）")
    print("=" * 60)

    if not os.path.exists(EXCEL_PATH):
        print(f"❌ 未找到 {EXCEL_PATH}，请确认文件存在")
        sys.exit(1)

    existing_videos = load_existing_videos()
    print(f"✅ 当前已有视频数量：{len(existing_videos)} 条")

    try:
        df = pd.read_excel(EXCEL_PATH)
        print(f"✅ 读取 Excel 成功，共 {len(df)} 行")
    except Exception as e:
        print(f"❌ 读取 Excel 失败：{e}")
        sys.exit(1)

    new_count = 0
    for idx, row in df.iterrows():
        name = str(row.get('视频名字', '')).strip()
        link = str(row.get('视频链接', '')).strip()
        cover_raw = str(row.get('视频封面', '')).strip()

        if not name or not link:
            continue

        # 检查重复
        if any(v.get("name") == name or v.get("link") == link for v in existing_videos):
            print(f"⚠️ 跳过重复视频：{name}")
            continue

        # 处理封面
        if cover_raw and not cover_raw.startswith(('http', '/')):
            cover = COVER_PREFIX + cover_raw
        else:
            cover = cover_raw

        new_video = {
            "name": name,
            "link": link,
            "cover": cover,
            "uploadTime": datetime.now().isoformat()
        }
        existing_videos.insert(0, new_video)
        new_count += 1
        print(f"✅ 已准备添加：{name}")

    if new_count == 0:
        print("⚠️ 没有检测到新视频")
        sys.exit(0)

    save_videos(existing_videos)
    print(f"✅ 已成功追加 {new_count} 条新视频")

    # Git 上传
    try:
        subprocess.run(["git", "add", VIDEO_JSON_PATH], check=True)
        if os.path.exists(COVER_FOLDER):
            subprocess.run(["git", "add", COVER_FOLDER], check=True)
        
        subprocess.run(["git", "commit", "-m", f"📤 追加 {new_count} 个新视频"], check=True)
        subprocess.run(["git", "push"], check=True)
        print("✅ 已成功推送到 GitHub！")
    except subprocess.CalledProcessError as e:
        print(f"❌ Git 操作失败：{e}")
        print("请检查 git 是否配置好，并确保你在仓库根目录运行")

    print(f"\n🎉 完成！当前总视频数：{len(existing_videos)} 条")

if __name__ == "__main__":
    main()