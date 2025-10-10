from PIL import Image
from pathlib import Path

cur = Path(__file__).parent.parent
img_dir = cur / "public" / "raw"
output_dir = cur / "public"
# 把所有png变成webp
for img_path in img_dir.glob("*.png"):
    img = Image.open(img_path)
    webp_path = output_dir / img_path.with_suffix(".webp").name
    if not webp_path.exists() or webp_path.stat().st_mtime < img_path.stat().st_mtime:
        img.save(webp_path, "WEBP", quality=80)
        print(f"Saved {webp_path}")