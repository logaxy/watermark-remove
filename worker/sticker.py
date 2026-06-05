from __future__ import annotations

import os
from dataclasses import dataclass

from PIL import Image, ImageDraw, ImageFont

from runtime import font_candidates


@dataclass(frozen=True)
class StickerStyle:
    background: str | None
    font_color: str
    border_color: str | None = None
    shadow_color: str | None = None
    box_opacity: float = 1.0
    border_radius: int = 4
    border_width: int = 0
    background_gradient: tuple[str, str] | None = None
    shape: str = "rect"


STYLES: dict[str, StickerStyle] = {
    "solid-white": StickerStyle(background="#ffffff", font_color="#1d2433"),
    "solid-black": StickerStyle(background="#111827", font_color="#ffffff"),
    "promo-red": StickerStyle(background="#e11d48", font_color="#ffffff", border_radius=999, shape="pill"),
    "promo-orange": StickerStyle(
        background=None,
        font_color="#ffffff",
        background_gradient=("#f97316", "#ea580c"),
        border_radius=16,
        shape="pill",
    ),
    "business-navy": StickerStyle(background="#1e3a5f", font_color="#f8fafc"),
    "business-silver": StickerStyle(
        background="#e2e8f0",
        font_color="#334155",
        border_color="#94a3b8",
        border_width=2,
    ),
    "cloud-cute": StickerStyle(
        background="#f0f9ff",
        font_color="#0369a1",
        border_color="#bae6fd",
        border_radius=24,
        border_width=2,
        shape="cloud",
    ),
    "candy-pink": StickerStyle(background="#fce7f3", font_color="#be185d", border_radius=999, shape="pill"),
    "fresh-mint": StickerStyle(background="#6ee7b7", font_color="#064e3b", border_radius=8),
    "ocean-block": StickerStyle(background="#1769aa", font_color="#ffffff", border_radius=6),
    "classic": StickerStyle(background="#000000", font_color="#ffffff", box_opacity=0.72, border_radius=6),
    "variety": StickerStyle(background=None, font_color="#ffdc00", shadow_color="#000000"),
    "subtitle": StickerStyle(background=None, font_color="#ffffff", shadow_color="#000000"),
    "warning": StickerStyle(background=None, font_color="#dc2626"),
    # legacy ids kept for older jobs
    "business": StickerStyle(background="#e2e8f0", font_color="#334155", border_color="#94a3b8", border_width=2),
    "ocean": StickerStyle(background="#1769aa", font_color="#ffffff"),
    "mint": StickerStyle(background="#6ee7b7", font_color="#064e3b"),
    "violet": StickerStyle(background="#ffffff", font_color="#53389e", border_color="#7f56d9", border_width=2),
    "darkline": StickerStyle(background="#111827", font_color="#ffffff", border_color="#98a2b3", border_width=2),
}

_NAMED_COLORS: dict[str, tuple[int, int, int]] = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "yellow": (255, 220, 0),
    "red": (220, 38, 38),
    "lightgray": (211, 211, 211),
}

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
    for path in font_candidates():
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int, int] | None = None,
    outline: tuple[int, int, int, int] | None = None,
    width: int = 1,
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def _draw_gradient_background(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    start_color: str,
    end_color: str,
    radius: int,
) -> None:
    start = parse_color(start_color, 1.0)
    end = parse_color(end_color, 1.0)
    gradient = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gradient_draw = ImageDraw.Draw(gradient)
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = (
            int(start[0] + (end[0] - start[0]) * ratio),
            int(start[1] + (end[1] - start[1]) * ratio),
            int(start[2] + (end[2] - start[2]) * ratio),
            255,
        )
        gradient_draw.line((0, y, width, y), fill=color)
    mask = Image.new("L", (width, height), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((0, 0, width, height), radius=radius, fill=255)
    image.paste(gradient, (0, 0), mask)


def _draw_cloud_background(
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    fill: tuple[int, int, int, int],
    outline: tuple[int, int, int, int] | None,
) -> None:
    bubbles = [
        (int(width * 0.22), int(height * 0.58), int(width * 0.18)),
        (int(width * 0.5), int(height * 0.5), int(width * 0.24)),
        (int(width * 0.78), int(height * 0.58), int(width * 0.17)),
        (int(width * 0.5), int(height * 0.72), int(width * 0.28)),
    ]
    for cx, cy, radius in bubbles:
        draw.ellipse(
            (cx - radius, cy - int(radius * 0.65), cx + radius, cy + int(radius * 0.65)),
            fill=fill,
            outline=outline,
            width=2 if outline else 0,
        )


def _draw_background(
    image: Image.Image,
    draw: ImageDraw.ImageDraw,
    width: int,
    height: int,
    style: StickerStyle,
) -> None:
    if style.background_gradient:
        _draw_gradient_background(
            image,
            draw,
            width,
            height,
            style.background_gradient[0],
            style.background_gradient[1],
            style.border_radius,
        )
        return

    if not style.background:
        return

    fill = parse_color(style.background, style.box_opacity)
    outline = parse_color(style.border_color, 1.0) if style.border_color else None

    if style.shape == "cloud":
        _draw_cloud_background(draw, width, height, fill, outline)
        return

    radius = height // 2 if style.shape == "pill" else style.border_radius
    _rounded_rect(
        draw,
        (0, 0, width - 1, height - 1),
        radius=radius,
        fill=fill,
        outline=outline,
        width=style.border_width,
    )


def render_sticker_png(output_path: str, roi: dict, text: str, style_id: str) -> None:
    width = max(1, int(roi["width"]))
    height = max(1, int(roi["height"]))
    style = STYLES.get(style_id, STYLES["solid-white"])
    label = text[:20]

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    _draw_background(image, draw, width, height, style)

    font_size = max(18, min(52, int(height * 0.48)))
    font = load_font(font_size)
    bbox = draw.textbbox((0, 0), label, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (width - text_width) // 2 - bbox[0]
    text_y = (height - text_height) // 2 - bbox[1]

    if style.shadow_color:
        for offset in ((3, 3), (-2, 2), (2, -2), (-2, -2)):
            draw.text(
                (text_x + offset[0], text_y + offset[1]),
                label,
                font=font,
                fill=parse_color(style.shadow_color, 1.0),
            )

    draw.text((text_x, text_y), label, font=font, fill=parse_color(style.font_color, 1.0))
    image.save(output_path, "PNG")
