import sys
from PIL import Image
from pathlib import Path

def png_to_webp(png_path: Path, output_dir: Path):
    img = Image.open(png_path)
    webp_path = output_dir / png_path.with_suffix(".webp").name
    if not webp_path.exists() or webp_path.stat().st_mtime < png_path.stat().st_mtime:
        img.save(webp_path, "WEBP", quality=80)
        print(f"Saved {webp_path}")

if len(sys.argv) == 1:
    cur = Path(__file__).parent.parent
    img_dir = cur / "src" / "assets" / "raw"
    output_dir = cur / "src" / "assets"
    # 把所有png变成webp
    for img_path in img_dir.glob("*.png"):
        png_to_webp(img_path, output_dir)
elif len(sys.argv) == 2:
    png_path = Path(sys.argv[1])
    output_dir = png_path.parent.parent
    if png_path.exists():
        png_to_webp(png_path, output_dir)
    else:
        print(f"File not found: {png_path}")