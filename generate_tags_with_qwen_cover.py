import os
import json
import time
from pathlib import Path
import base64
from tqdm import tqdm
from openai import OpenAI
from PIL import Image

# ==================== 配置区 ====================
COVER_FOLDER = "covers"
DASHSCOPE_API_KEY = "sk-8a1c355552824ca0899b3f3feccbe7b4"   # ←←← 必须改成你自己的阿里云 API Key
MODEL = "qwen-vl-plus"                        # 可改成 qwen-vl-max（更强但更贵）
# =============================================

client = OpenAI(
    api_key=DASHSCOPE_API_KEY,
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

def is_valid_image(image_path: Path):
    """检查图片是否有效"""
    try:
        with Image.open(image_path) as img:
            img.verify()
        return True
    except:
        return False

def encode_image_to_base64(image_path: Path):
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')

def generate_tags_with_qwen(cover_path: Path, video_name: str):
    """封面 + 标题联合生成标签"""
    prompt = f"""你是一个专业的 ASMR 视频标签专家。
视频标题：《{video_name}》
请同时观察这张封面图片和视频标题内容。
生成 6-10 个最贴合这个视频的中文关键词标签，用英文逗号分隔。
重点突出 ASMR 触发元素：耳骚、助眠、雨声、轻柔、按摩、解压、耳刮、咀嚼、翻书、刷子、tapping、scratching、黏糊糊、口腔音、视觉触发等。
只返回标签列表，不要解释，不要多余文字。"""

    try:
        base64_img = encode_image_to_base64(cover_path)
        
        response = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_img}"}}
                ]
            }],
            temperature=0.7,
            max_tokens=512
        )
        
        tags_text = response.choices[0].message.content.strip()
        tags = [tag.strip() for tag in tags_text.split(',') if tag.strip()]
        return tags[:10]
    except Exception as e:
        print(f"❌ API 调用失败: {e}")
        return ["asmr", "放松"]

def main():
    if not Path("videos.json").exists():
        print("❌ videos.json 不存在，请先运行 upload_from_excel.py")
        return

    with open("videos.json", 'r', encoding='utf-8') as f:
        videos = json.load(f)

    print(f"当前共有 {len(videos)} 条视频，开始【封面 + 标题】联合生成标签...")

    cover_dir = Path(COVER_FOLDER)
    if not cover_dir.exists():
        print(f"❌ {COVER_FOLDER} 文件夹不存在")
        return

    updated_count = 0
    skipped_count = 0

    for video in tqdm(videos):
        name = video.get("name", "").strip()
        cover_path_str = video.get("cover", "")

        if not cover_path_str:
            skipped_count += 1
            continue

        # 处理封面路径
        if cover_path_str.startswith("/covers/"):
            relative_path = cover_path_str.lstrip("/")
        else:
            relative_path = cover_path_str

        # 优先使用 .jpg，如果没有则尝试 .avif
        jpg_file = cover_dir / Path(relative_path).with_suffix(".jpg").name
        avif_file = cover_dir / Path(relative_path).with_suffix(".avif").name

        cover_file = None
        if jpg_file.exists() and is_valid_image(jpg_file):
            cover_file = jpg_file
        elif avif_file.exists() and is_valid_image(avif_file):
            cover_file = avif_file

        if not cover_file:
            print(f"⏭️ 跳过（无有效封面）：{name}")
            skipped_count += 1
            continue

        # 如果已有较多标签则跳过
        if video.get("keywords") and len(video.get("keywords", [])) >= 6:
            print(f"⏭️ 已有标签，跳过：{name}")
            skipped_count += 1
            continue

        print(f"\n处理视频: {name}")
        tags = generate_tags_with_qwen(cover_file, name)
        print(f"  生成标签: {tags}")

        # 更新 JSON（保留原来的 uploadTime）
        video["keywords"] = tags
        video["aiTagged"] = True
        video["tagTime"] = time.strftime("%Y-%m-%d %H:%M")
        updated_count += 1

    # 保存更新后的 videos.json
    with open("videos.json", 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)

    print("\n🎉 【封面 + 标题】联合打标签完成！")
    print(f"成功更新标签：{updated_count} 条")
    print(f"跳过处理：{skipped_count} 条")
    print("\n推送命令：")
    print("git add videos.json")
    print('git commit -m "AI（通义千问）使用封面+标题生成标签"')
    print("git push")

if __name__ == "__main__":
    main()