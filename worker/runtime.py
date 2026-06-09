from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def _exe_suffix() -> str:
    return ".exe" if sys.platform == "win32" else ""


def bin_dir() -> Path | None:
    env_dir = os.environ.get("WATERMARK_BIN_DIR")
    if env_dir:
        path = Path(env_dir)
        if path.is_dir():
            return path

    if getattr(sys, "frozen", False):
        candidate = Path(sys.executable).resolve().parent
        if candidate.is_dir():
            return candidate

    return None


def resources_dir() -> Path | None:
    env_dir = os.environ.get("WATERMARK_RESOURCES_DIR")
    if env_dir:
        path = Path(env_dir)
        if path.is_dir():
            return path
    return None


def resolve_binary(name: str) -> str:
    suffix = _exe_suffix()
    directory = bin_dir()
    if directory:
        # macOS Universal 包：按硬件架构选择对应二进制
        if sys.platform == "darwin":
            import subprocess
            try:
                result = subprocess.run(["sysctl", "-n", "hw.optional.arm64"], capture_output=True, text=True)
                arch = "arm64" if result.stdout.strip() == "1" else "x64"
            except Exception:
                import platform
                arch = "arm64" if platform.machine() == "arm64" else "x64"
            arch_candidate = directory / f"{name}-{arch}"
            if arch_candidate.exists():
                return str(arch_candidate)
        candidate = directory / f"{name}{suffix}"
        if candidate.exists():
            return str(candidate)

    found = shutil.which(name)
    if found:
        return found

    raise RuntimeError(
        f"找不到 {name} 可执行文件。请确认 FFmpeg 已安装，或使用包含内置 FFmpeg 的应用版本。"
    )


def font_candidates() -> list[str]:
    candidates: list[str] = []
    resources = resources_dir()
    if resources:
        fonts_dir = resources / "fonts"
        if fonts_dir.is_dir():
            candidates.extend(str(path) for path in sorted(fonts_dir.glob("*.ttf")))
            candidates.extend(str(path) for path in sorted(fonts_dir.glob("*.ttc")))
            candidates.extend(str(path) for path in sorted(fonts_dir.glob("*.otf")))

    candidates.extend(
        [
            "/System/Library/Fonts/PingFang.ttc",
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/Library/Fonts/Arial Unicode.ttf",
            "C:/Windows/Fonts/msyh.ttc",
            "C:/Windows/Fonts/simhei.ttf",
        ]
    )
    return candidates
