"""Buat thumbnail JPG ringan dari concept art PNG di root proyek -> client/assets/art/.

Jalankan: python tools/make_thumbs.py
Hasilnya dipakai lobby (kartu hero & latar). PNG asli tidak diubah.
"""
import pathlib
import re
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "assets" / "art"
OUT.mkdir(parents=True, exist_ok=True)


def slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    return s


for png in sorted(ROOT.glob("*.png")):
    img = Image.open(png).convert("RGB")
    img.thumbnail((900, 900))
    dst = OUT / (slug(png.stem) + ".jpg")
    img.save(dst, "JPEG", quality=80, optimize=True, progressive=True)
    print(f"{png.name} -> {dst.relative_to(ROOT)} ({dst.stat().st_size // 1024} KB)")
