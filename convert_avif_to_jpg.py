import subprocess
from pathlib import Path
from tqdm import tqdm
import json

COVER_FOLDER = "covers"

def main():
    cover_dir = Path(COVER_FOLDER)
    if not cover_dir.exists():
        print(f"❌ {COVER_FOLDER} 文件夹不存在")
        return

    # 查找所有 .avif 文件
    avif_files = list(cover_dir.glob("*.avif"))
    print(f"找到 {len(avif_files)} 个 .avif 文件，开始转换...")

    converted_count = 0

    for avif in tqdm(avif_files):
        # 新文件名：原文件名去掉 .avif 后加上 .jpg
        # 示例：image.avif → image.jpg
        jpg_path = avif.with_suffix(".jpg")

        # 如果 .jpg 已经存在就跳过
        if jpg_path.exists():
            print(f"⏭️ 已存在，跳过: {jpg_path.name}")
            continue

        # 转换
        cmd = [
            "ffmpeg", "-i", str(avif),
            "-q:v", "2",      # 高质量
            "-y",
            str(jpg_path)
        ]
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        if jpg_path.exists():
            print(f"✅ 已生成: {avif.name} → {jpg_path.name}")
            converted_count += 1
        else:
            print(f"❌ 转换失败: {avif.name}")

    print(f"\n🎉 转换完成！共生成了 {converted_count} 个 .jpg 文件")
    print("原 .avif 文件全部保留，未被删除")

if __name__ == "__main__":
    main()