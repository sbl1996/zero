import sys
from PIL import Image
from pathlib import Path
import subprocess

def png_to_webp(png_path: Path, output_dir: Path):
    img = Image.open(png_path)
    webp_path = output_dir / png_path.with_suffix(".webp").name
    if not webp_path.exists() or webp_path.stat().st_mtime < png_path.stat().st_mtime:
        img.save(webp_path, "WEBP", quality=80)
        print(f"Saved {webp_path}")


def run(cmd: list[str]) -> None:
    """Run a shell command and echo it; raise if error."""
    print(">>>", " ".join(cmd))
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] command failed with code {e.returncode}", file=sys.stderr)
        sys.exit(e.returncode)


def video_to_webp(
    src_video: Path,
    output_dir: Path,
    fps_palette: int = 8,
    fps_output: int = 12,
    width: int = 768,
    speed_factor: float = 1.0,
) -> None:
    """
    将 mp4 等视频转为 webp（带调色板、循环播放）。

    相当于：
      mv /mnt/d/Downloads/boss-wind-raptor.mp4 src/assets/raw
      ffmpeg -y -i src/assets/raw/boss-wind-raptor.mp4 -vf fps=8,scale=768:-1:flags=lanczos,palettegen=stats_mode=full src/assets/raw/palette.png
      ffmpeg -y -i src/assets/raw/boss-wind-raptor.mp4 -i src/assets/raw/palette.png -lavfi "fps=12,scale=768:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" -loop 0 src/assets/boss-wind-raptor.webp
      rm src/assets/raw/palette.png

    Args:
        src_video: 源视频路径
        output_dir: 输出目录
        fps_palette: 生成调色板时的帧率
        fps_output: 输出webp的帧率
        width: 输出宽度
        speed_factor: 播放速度倍率 (2.0 表示播放速度是原来的2倍，4秒视频变成2秒)
    """

    src_video = src_video.resolve()
    output_dir = output_dir.resolve()
    tmp_dir = src_video.parent.resolve()

    if not src_video.exists():
        raise FileNotFoundError(f"源视频不存在: {src_video}")

    dst_webp = output_dir / src_video.with_suffix(".webp").name

    if dst_webp.exists() and dst_webp.stat().st_mtime >= src_video.stat().st_mtime:
        return

    palette_path = tmp_dir / "palette.png"

    # 计算加速后的帧率（速度倍率越高，需要的帧率也越高以保持流畅）
    adjusted_fps_palette = int(fps_palette * speed_factor)
    adjusted_fps_output = int(fps_output * speed_factor)

    # 构建速度滤镜 (setpts=0.5*PTS 表示2倍速播放)
    speed_filter = f"setpts={1/speed_factor}*PTS"

    # 1) 生成调色板
    run([
        "ffmpeg",
        "-y",
        "-i", str(src_video),
        "-vf",
        f"{speed_filter},fps={adjusted_fps_palette},scale={width}:-1:flags=lanczos,palettegen=stats_mode=full",
        str(palette_path),
    ])

    # 2) 使用调色板生成 webp
    run([
        "ffmpeg",
        "-y",
        "-i", str(src_video),
        "-i", str(palette_path),
        "-lavfi",
        f"{speed_filter},fps={adjusted_fps_output},scale={width}:-1:flags=lanczos [x]; "
        f"[x][1:v] paletteuse=dither=bayer:bayer_scale=5",
        "-loop", "0",
        str(dst_webp),
    ])

    # 3) 删除临时调色板
    try:
        palette_path.unlink()
    except FileNotFoundError:
        pass

    print(f"生成完成: {dst_webp}")


if len(sys.argv) == 1:
    cur = Path(__file__).parent.parent
    img_dir = cur / "src" / "assets" / "raw"
    output_dir = cur / "src" / "assets"
    # 把所有png变成webp
    all_mp4_path = list(img_dir.glob("*.mp4"))
    all_img_path = []
    # if mp4 files exist, not convert png to webp to avoid redundant work
    for img_path in img_dir.glob("*.png"):
        if not any(mp4_path.stem == img_path.stem for mp4_path in all_mp4_path):
            all_img_path.append(img_path)
    for img_path in all_img_path:
        png_to_webp(img_path, output_dir)
    for video_path in img_dir.glob("*.mp4"):
        video_to_webp(video_path, output_dir)
elif len(sys.argv) >= 2:
    path = Path(sys.argv[1])
    if len(sys.argv) == 3:
        speed_factor = float(sys.argv[2])
    else:
        speed_factor = 1.0
    if path.suffix.lower() == ".mp4":
        video_path = path
        output_dir = video_path.parent.parent
        if video_path.exists():
            video_to_webp(video_path, output_dir, speed_factor=speed_factor)
        else:
            print(f"File not found: {video_path}")
    else:
        png_path = path
        output_dir = png_path.parent.parent
        if png_path.exists():
            png_to_webp(png_path, output_dir)
        else:
            print(f"File not found: {png_path}")