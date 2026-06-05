from __future__ import annotations

import os
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class StickerStyle:
    background: str | None
    font_color: str
    border_color: str | None = None
    shadow_color: str | None = None
    box_opacity: float = 0.72


STYLES: dict[str, StickerStyle] = {
    "classic": StickerStyle(background="black", font_color="white"),
    "variety": StickerStyle(background=None, font_color="yellow", shadow_color="black"),
    "warning": StickerStyle(background=None, font_color="red"),
    "business": StickerStyle(background="lightgray", font_color="#333333", box_opacity=0.86),
    "ocean": StickerStyle(background="#1769aa", font_color="white", box_opacity=0.82),
    "mint": StickerStyle(background="#6ee7b7", font_color="#111827", box_opacity=0.86),
    "violet": StickerStyle(background="white", font_color="#53389e", border_color="#7f56d9"),
    "darkline": StickerStyle(background="#111827", font_color="white", border_color="#98a2b3"),
}

_NAMED_COLORS: dict[str, tuple[int, int, int]] = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "yellow": (255, 220, 0),
    "red": (220, 38, 38),
    "lightgray": (211, 211, 211),
}

_FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]


def parse_color(color: str, opacity: float = 1.0) -> tuple[int, int, int, int]:
    if color in _NAMED_COLORS:
        rgb = _NAMED_COLORS[color]
    elif color.startswith("#") and len(color) >= 7:
        hex_value = color.lstrip("#")
        rgb = (
            int(hex_value[0:2], 16),
            int(hex_value[2:4], 16),
            int(hex_value[4:6], 16),
        )
    else:
        rgb = (255, 255, 255)
    alpha = max(0, min(255, int(opacity * 255)))
    return (*rgb, alpha)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render_sticker_png(output_path: str, roi: dict, text: str, style_id: str) -> None:
    width = max(1, int(roi["width"]))
    height = max(1, int(roi["height"]))
    style = STYLES.get(style_id, STYLES["classic"])
    label = text[:20]

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if style.background:
        draw.rectangle(
            (0, 0, width, height),
            fill=parse_color(style.background, style.box_opacity),
        )

    if style.border_color:
        draw.rectangle(
            (1, 1, width - 2, height - 2),
            outline=parse_color(style.border_color, 1.0),
            width=3,
        )

    font_size = max(18, min(52, int(height * 0.48)))
    font = load_font(font_size)
    bbox = draw.textbbox((0, 0), label, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (width - text_width) // 2 - bbox[0]
    text_y = (height - text_height) // 2 - bbox[1]

    if style.shadow_color:
        draw.text(
            (text_x + 3, text_y + 3),
            label,
            font=font,
            fill=parse_color(style.shadow_color, 1.0),
        )

    draw.text((text_x, text_y), label, font=font, fill=parse_color(style.font_color, 1.0))
    image.save(output_path, "PNG")
