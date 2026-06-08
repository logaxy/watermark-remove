from __future__ import annotations

import os
import platform
import shutil
import sys
from pathlib import Path


def _exe_suffix() -> str:
    return ".exe" if sys.platform == "win32" else ""


def _get_mac_arch() -> str:
    """获取 macOS 的架构标识 (arm64 或 x64)"""
    machine = platform.machine().lower()
    if machine in ("arm64", "aarch64"):
        return "arm64"
    return "x64"


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
    """解析二进制文件路径，支持 macOS 多架构"""
    suffix = _exe_suffix()
    directory = bin_dir()

    if directory:
        # macOS: 先尝试带架构后缀的版本
        if sys.platform == "darwin":
            arch = _get_mac_arch()
            arch_candidate = directory / f"{name}-{arch}{suffix}"
            if arch_candidate.exists():
                return str(arch_candidate)

        # 尝试默认名称
        candidate = directory / f"{name}{suffix}"
        if candidate.exists():
            return str(candidate)

    # 回退到系统 PATH 中的版本
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
