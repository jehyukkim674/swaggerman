#!/usr/bin/env python3
"""스크린샷에 빨간 네모박스 + 번호 원 주석을 그리고 리사이즈한다.

사용법: python3 annotate.py <입력.png> <출력.png> <주석.json> [--width 1728]

주석 JSON (좌표는 입력 PNG 픽셀 기준 — Retina 캡처면 2배율 픽셀):
[
  {"num": 1, "x": 100, "y": 50, "w": 800, "h": 60, "label": "tl"},
  {"blur": true, "x": 100, "y": 200, "w": 400, "h": 40},
  ...
]
label: 번호 원 위치 — tl(좌상단 모서리, 기본) | tr | bl | br | l(왼쪽 바깥) | r(오른쪽 바깥)
blur: true면 번호 대신 해당 영역을 블러 처리(민감 정보 가림용)
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RED = (255, 59, 48, 255)
WHITE = (255, 255, 255, 255)
BOX_W = 6          # 박스 테두리 두께 (2x 캡처 기준)
R = 34             # 번호 원 반지름
FONT_SIZE = 44


def load_font():
    for p in ["/System/Library/Fonts/Helvetica.ttc",
              "/System/Library/Fonts/SFNS.ttf",
              "/Library/Fonts/Arial Unicode.ttf"]:
        try:
            return ImageFont.truetype(p, FONT_SIZE)
        except OSError:
            continue
    return ImageFont.load_default()


def circle_center(a, img_w, img_h):
    x, y, w, h = a["x"], a["y"], a["w"], a["h"]
    pos = a.get("label", "tl")
    pad = 6
    centers = {
        "tl": (x + R + pad, y + R + pad),
        "tr": (x + w - R - pad, y + R + pad),
        "bl": (x + R + pad, y + h - R - pad),
        "br": (x + w - R - pad, y + h - R - pad),
        "l": (x - R - 12, y + R),
        "r": (x + w + R + 12, y + R),
        "t": (x + w // 2, y - R - 12),          # 박스 위 바깥(가운데)
        "b": (x + w // 2, y + h + R + 12),      # 박스 아래 바깥(가운데)
        "tl-out": (x - R - 10, y - R - 10),      # 좌상단 대각 바깥
    }
    cx, cy = centers[pos]
    cx = max(R + 2, min(img_w - R - 2, cx))
    cy = max(R + 2, min(img_h - R - 2, cy))
    return cx, cy


def main():
    src, dst, spec = sys.argv[1], sys.argv[2], sys.argv[3]
    out_width = 1728
    if "--width" in sys.argv:
        out_width = int(sys.argv[sys.argv.index("--width") + 1])

    img = Image.open(src).convert("RGBA")

    with open(spec) as f:
        annotations = json.load(f)

    # 1) 블러 영역 먼저 (원본 픽셀 가공)
    for a in annotations:
        if a.get("blur"):
            box = (a["x"], a["y"], a["x"] + a["w"], a["y"] + a["h"])
            region = img.crop(box).filter(ImageFilter.GaussianBlur(24))
            img.paste(region, box)

    # 2) 빨간 박스 + 번호
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = load_font()

    for a in annotations:
        if a.get("blur"):
            continue
        x, y, w, h = a["x"], a["y"], a["w"], a["h"]
        draw.rectangle([x, y, x + w, y + h], outline=RED, width=BOX_W)
        cx, cy = circle_center(a, img.width, img.height)
        draw.ellipse([cx - R, cy - R, cx + R, cy + R], fill=RED)
        text = str(a["num"])
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]), text,
                  fill=WHITE, font=font)

    out = Image.alpha_composite(img, overlay).convert("RGB")
    if out.width > out_width:
        ratio = out_width / out.width
        out = out.resize((out_width, int(out.height * ratio)), Image.LANCZOS)
    out.save(dst, "PNG", optimize=True)
    print(f"saved: {dst} ({len(annotations)} annotations, {out.width}x{out.height})")


if __name__ == "__main__":
    main()
